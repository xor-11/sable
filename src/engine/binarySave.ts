import { computeShadowcastFOV } from './fov';
import {
  AIState,
  DungeonMap,
  EnemyEntity,
  EnemyType,
  GamePhase,
  GameState,
  ItemInstance,
  ItemType,
  LogEntry,
  LogSeverity,
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_FOV_RADIUS,
  Room,
} from './types';

/**
 * Binary Save/Load Codec with Magic Header, Version, Payload Length, and CRC32 Checksum.
 *
 * Binary Header Layout (16 bytes, little-endian):
 *   0..3  : ASCII Magic "SABL" (0x53, 0x41, 0x42, 0x4C)
 *   4..5  : Format Version uint16 (currently 1)
 *   6..7  : Reserved Flags uint16 (0)
 *   8..11 : Payload Byte Length uint32
 *  12..15 : IEEE 802.3 CRC32 Checksum of payload bytes uint32
 *  16..N  : Compact little-endian binary payload encoding full GameState
 */

export const SAVE_MAGIC = 'SABL';
export const SAVE_VERSION = 1;
export const SAVE_HEADER_SIZE = 16;
const STORAGE_KEY = 'sable_binary_save_v1';

export interface ParsedSaveHeader {
  magic: string;
  version: number;
  flags: number;
  payloadLength: number;
  expectedChecksum: number;
  actualChecksum: number;
  totalBytes: number;
  validMagic: boolean;
  validVersion: boolean;
  validLength: boolean;
  validChecksum: boolean;
}

export interface DecodeSaveResult {
  ok: boolean;
  state?: GameState;
  header?: ParsedSaveHeader;
  error?: string;
}

// Precompute standard IEEE 802.3 CRC32 lookup table
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let bit = 0; bit < 8; bit++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC32_TABLE[i] = c >>> 0;
}

export function computeCRC32(bytes: Uint8Array, offset = 0, length = bytes.length - offset): number {
  let crc = 0xffffffff;
  const end = Math.min(bytes.length, offset + length);
  for (let i = offset; i < end; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

class BinaryWriter {
  private buf: Uint8Array;
  private view: DataView;
  private pos = 0;
  private encoder = new TextEncoder();

  constructor(initialSize = 4096) {
    this.buf = new Uint8Array(initialSize);
    this.view = new DataView(this.buf.buffer);
  }

  private ensure(extra: number): void {
    if (this.pos + extra <= this.buf.length) return;
    let nextLen = this.buf.length * 2;
    while (nextLen < this.pos + extra) nextLen *= 2;
    const next = new Uint8Array(nextLen);
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }

  u8(v: number): void {
    this.ensure(1);
    this.view.setUint8(this.pos++, v & 0xff);
  }

  i16(v: number): void {
    this.ensure(2);
    this.view.setInt16(this.pos, v, true);
    this.pos += 2;
  }

  u16(v: number): void {
    this.ensure(2);
    this.view.setUint16(this.pos, v & 0xffff, true);
    this.pos += 2;
  }

  u32(v: number): void {
    this.ensure(4);
    this.view.setUint32(this.pos, v >>> 0, true);
    this.pos += 4;
  }

  bytes(arr: Uint8Array): void {
    this.ensure(arr.length);
    this.buf.set(arr, this.pos);
    this.pos += arr.length;
  }

  str(text: string): void {
    const encoded = this.encoder.encode(text);
    this.u16(encoded.length);
    this.bytes(encoded);
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.pos);
  }
}

class BinaryReader {
  private view: DataView;
  private bytesRef: Uint8Array;
  private pos = 0;
  private decoder = new TextDecoder();

  constructor(data: Uint8Array, offset = 0) {
    this.bytesRef = data;
    this.view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    this.pos = offset;
  }

  private assertAvailable(need: number): void {
    if (this.pos + need > this.bytesRef.length) {
      throw new Error(`Unexpected end of binary stream (needed ${need} bytes at offset ${this.pos}).`);
    }
  }

  u8(): number {
    this.assertAvailable(1);
    return this.view.getUint8(this.pos++);
  }

  i16(): number {
    this.assertAvailable(2);
    const v = this.view.getInt16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u16(): number {
    this.assertAvailable(2);
    const v = this.view.getUint16(this.pos, true);
    this.pos += 2;
    return v;
  }

  u32(): number {
    this.assertAvailable(4);
    const v = this.view.getUint32(this.pos, true);
    this.pos += 4;
    return v;
  }

  sliceBytes(length: number): Uint8Array {
    this.assertAvailable(length);
    const out = this.bytesRef.slice(this.pos, this.pos + length);
    this.pos += length;
    return out;
  }

  str(): string {
    const len = this.u16();
    const raw = this.sliceBytes(len);
    return this.decoder.decode(raw);
  }
}

function writeItem(w: BinaryWriter, item: ItemInstance): void {
  w.u32(item.id);
  w.u8(item.type);
  w.u16(item.value);
  w.i16(item.x);
  w.i16(item.y);
}

function readItem(r: BinaryReader): ItemInstance {
  const id = r.u32();
  const type = r.u8() as ItemType;
  const value = r.u16();
  const x = r.i16();
  const y = r.i16();
  return { id, type, value, x, y };
}

/** Encode a complete GameState into a checksum-verified binary buffer. */
export function encodeGameStateBinary(state: GameState): Uint8Array {
  const w = new BinaryWriter();

  // Core metadata
  w.u32(state.seed);
  w.u32(state.rngState);
  w.u8(state.floor);
  w.u32(state.turn);
  w.u8(state.phase);
  w.u32(state.nextEntityId);

  // Player state
  const p = state.player;
  w.i16(p.x);
  w.i16(p.y);
  w.u16(p.hp);
  w.u16(p.maxHp);
  w.u16(p.energy);
  w.u16(p.maxEnergy);
  w.u16(p.baseAtk);
  w.u16(p.baseDef);
  w.u16(p.level);
  w.u32(p.xp);
  w.u32(p.nextLevelXp);
  w.u32(p.gold);
  w.u8(p.oscilloscopeActive ? 1 : 0);
  w.u8(p.multimeterActive ? 1 : 0);
  w.i16(p.lastDirX);
  w.i16(p.lastDirY);
  w.u8(p.energyRegenCounter);

  // Equipped weapon & armor
  w.u8(p.equippedWeapon ? 1 : 0);
  if (p.equippedWeapon) writeItem(w, p.equippedWeapon);
  w.u8(p.equippedArmor ? 1 : 0);
  if (p.equippedArmor) writeItem(w, p.equippedArmor);

  // Inventory
  w.u16(p.inventory.length);
  for (const item of p.inventory) {
    writeItem(w, item);
  }

  // Map tiles, explored bitmask, stairs, rooms
  const m = state.map;
  w.u16(m.width);
  w.u16(m.height);
  w.i16(m.stairsX);
  w.i16(m.stairsY);
  w.bytes(m.tiles);
  w.bytes(m.explored);

  w.u16(m.rooms.length);
  for (const rm of m.rooms) {
    w.u8(rm.x);
    w.u8(rm.y);
    w.u8(rm.w);
    w.u8(rm.h);
    w.u8(rm.cx);
    w.u8(rm.cy);
  }

  // Enemies
  w.u16(state.enemies.length);
  for (const e of state.enemies) {
    w.u32(e.id);
    w.u8(e.type);
    w.i16(e.x);
    w.i16(e.y);
    w.i16(e.hp);
    w.u16(e.maxHp);
    w.u16(e.atk);
    w.u16(e.def);
    w.u16(e.xpValue);
    w.u8(e.aiState);
    w.i16(e.lastKnownPlayerX);
    w.i16(e.lastKnownPlayerY);
    w.u8(e.turnParity);
    w.u8(e.teleportCooldown);
    w.u8(e.bossPhase);
    w.u8(e.alive ? 1 : 0);
  }

  // Ground items
  w.u16(state.groundItems.length);
  for (const item of state.groundItems) {
    writeItem(w, item);
  }

  // Message log
  w.u16(state.logEntries.length);
  for (const entry of state.logEntries) {
    w.u32(entry.turn);
    w.u8(entry.severity);
    w.str(entry.text);
  }

  // Run stats
  w.u32(state.stats.kills);
  w.u32(state.stats.damageDealt);
  w.u32(state.stats.damageTaken);
  w.u32(state.stats.itemsUsed);
  w.u32(state.stats.surgesFired);
  w.u8(state.stats.deepestFloor);
  w.str(state.stats.causeOfDeath);

  const payload = w.finish();
  const crc = computeCRC32(payload);

  const out = new Uint8Array(SAVE_HEADER_SIZE + payload.length);
  const hv = new DataView(out.buffer);
  out[0] = SAVE_MAGIC.charCodeAt(0);
  out[1] = SAVE_MAGIC.charCodeAt(1);
  out[2] = SAVE_MAGIC.charCodeAt(2);
  out[3] = SAVE_MAGIC.charCodeAt(3);
  hv.setUint16(4, SAVE_VERSION, true);
  hv.setUint16(6, 0, true);
  hv.setUint32(8, payload.length, true);
  hv.setUint32(12, crc, true);
  out.set(payload, SAVE_HEADER_SIZE);

  return out;
}

/** Inspect only the 16-byte header and CRC32 integrity of a binary buffer. */
export function inspectBinarySaveHeader(bytes: Uint8Array): ParsedSaveHeader {
  if (bytes.length < SAVE_HEADER_SIZE) {
    return {
      magic: new TextDecoder().decode(bytes.slice(0, Math.min(4, bytes.length))),
      version: 0,
      flags: 0,
      payloadLength: 0,
      expectedChecksum: 0,
      actualChecksum: 0,
      totalBytes: bytes.length,
      validMagic: false,
      validVersion: false,
      validLength: false,
      validChecksum: false,
    };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const version = view.getUint16(4, true);
  const flags = view.getUint16(6, true);
  const payloadLength = view.getUint32(8, true);
  const expectedChecksum = view.getUint32(12, true);
  const actualPayloadBytes = bytes.length - SAVE_HEADER_SIZE;
  const actualChecksum =
    actualPayloadBytes > 0 ? computeCRC32(bytes, SAVE_HEADER_SIZE, actualPayloadBytes) : 0;

  return {
    magic,
    version,
    flags,
    payloadLength,
    expectedChecksum,
    actualChecksum,
    totalBytes: bytes.length,
    validMagic: magic === SAVE_MAGIC,
    validVersion: version === SAVE_VERSION,
    validLength: payloadLength === actualPayloadBytes,
    validChecksum: expectedChecksum === actualChecksum,
  };
}

/** Safely decode a binary save buffer; never throws on corrupt or truncated input. */
export function decodeGameStateBinary(bytes: Uint8Array): DecodeSaveResult {
  const header = inspectBinarySaveHeader(bytes);

  if (bytes.length < SAVE_HEADER_SIZE) {
    return {
      ok: false,
      header,
      error: `Truncated save file: expected at least ${SAVE_HEADER_SIZE}-byte header, got ${bytes.length} bytes.`,
    };
  }
  if (!header.validMagic) {
    return {
      ok: false,
      header,
      error: `Invalid magic header "${header.magic}" (expected "${SAVE_MAGIC}").`,
    };
  }
  if (!header.validVersion) {
    return {
      ok: false,
      header,
      error: `Unsupported save version v${header.version} (expected v${SAVE_VERSION}).`,
    };
  }
  if (!header.validLength) {
    return {
      ok: false,
      header,
      error: `Payload length mismatch: header declares ${header.payloadLength} bytes, file contains ${bytes.length - SAVE_HEADER_SIZE} bytes.`,
    };
  }
  if (!header.validChecksum) {
    return {
      ok: false,
      header,
      error: `CRC32 checksum failure: expected 0x${header.expectedChecksum.toString(16).padStart(8, '0')}, computed 0x${header.actualChecksum.toString(16).padStart(8, '0')}.`,
    };
  }

  try {
    const r = new BinaryReader(bytes, SAVE_HEADER_SIZE);

    const seed = r.u32();
    const rngState = r.u32();
    const floor = r.u8();
    const turn = r.u32();
    const phase = r.u8() as GamePhase;
    const nextEntityId = r.u32();

    const px = r.i16();
    const py = r.i16();
    const hp = r.u16();
    const maxHp = r.u16();
    const energy = r.u16();
    const maxEnergy = r.u16();
    const baseAtk = r.u16();
    const baseDef = r.u16();
    const level = r.u16();
    const xp = r.u32();
    const nextLevelXp = r.u32();
    const gold = r.u32();
    const oscilloscopeActive = r.u8() === 1;
    const multimeterActive = r.u8() === 1;
    const lastDirX = r.i16();
    const lastDirY = r.i16();
    const energyRegenCounter = r.u8();

    const hasWeapon = r.u8() === 1;
    const equippedWeapon = hasWeapon ? readItem(r) : null;
    const hasArmor = r.u8() === 1;
    const equippedArmor = hasArmor ? readItem(r) : null;

    const invLen = r.u16();
    if (invLen > 64) throw new Error(`Corrupt inventory count: ${invLen}`);
    const inventory: ItemInstance[] = [];
    for (let i = 0; i < invLen; i++) {
      inventory.push(readItem(r));
    }

    const width = r.u16();
    const height = r.u16();
    if (width !== MAP_WIDTH || height !== MAP_HEIGHT) {
      throw new Error(`Unexpected map dimensions ${width}x${height}`);
    }
    const stairsX = r.i16();
    const stairsY = r.i16();
    const tiles = r.sliceBytes(width * height);
    const explored = r.sliceBytes(width * height);
    const visible = new Uint8Array(width * height);

    const roomCount = r.u16();
    const rooms: Room[] = [];
    for (let i = 0; i < roomCount; i++) {
      rooms.push({
        x: r.u8(),
        y: r.u8(),
        w: r.u8(),
        h: r.u8(),
        cx: r.u8(),
        cy: r.u8(),
      });
    }

    const map: DungeonMap = {
      width,
      height,
      tiles,
      visible,
      explored,
      rooms,
      stairsX,
      stairsY,
    };

    const enemyCount = r.u16();
    const enemies: EnemyEntity[] = [];
    for (let i = 0; i < enemyCount; i++) {
      enemies.push({
        id: r.u32(),
        type: r.u8() as EnemyType,
        x: r.i16(),
        y: r.i16(),
        hp: r.i16(),
        maxHp: r.u16(),
        atk: r.u16(),
        def: r.u16(),
        xpValue: r.u16(),
        aiState: r.u8() as AIState,
        lastKnownPlayerX: r.i16(),
        lastKnownPlayerY: r.i16(),
        turnParity: r.u8(),
        teleportCooldown: r.u8(),
        bossPhase: r.u8(),
        alive: r.u8() === 1,
        debugPath: [],
      });
    }

    const groundCount = r.u16();
    const groundItems: ItemInstance[] = [];
    for (let i = 0; i < groundCount; i++) {
      groundItems.push(readItem(r));
    }

    const logCount = r.u16();
    const logEntries: LogEntry[] = [];
    for (let i = 0; i < logCount; i++) {
      logEntries.push({
        turn: r.u32(),
        severity: r.u8() as LogSeverity,
        text: r.str(),
      });
    }

    const stats = {
      kills: r.u32(),
      damageDealt: r.u32(),
      damageTaken: r.u32(),
      itemsUsed: r.u32(),
      surgesFired: r.u32(),
      deepestFloor: r.u8(),
      causeOfDeath: r.str(),
    };

    computeShadowcastFOV(map, px, py, PLAYER_FOV_RADIUS);

    const state: GameState = {
      seed,
      rngState,
      floor,
      turn,
      phase,
      nextEntityId,
      player: {
        x: px,
        y: py,
        hp,
        maxHp,
        energy,
        maxEnergy,
        baseAtk,
        baseDef,
        level,
        xp,
        nextLevelXp,
        gold,
        equippedWeapon,
        equippedArmor,
        inventory,
        oscilloscopeActive,
        multimeterActive,
        lastDirX,
        lastDirY,
        energyRegenCounter,
      },
      map,
      enemies,
      groundItems,
      logEntries,
      stats,
    };

    return { ok: true, state, header };
  } catch (err) {
    return {
      ok: false,
      header,
      error: err instanceof Error ? err.message : 'Unknown binary decode error',
    };
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

/** Persist active run binary bytes into localStorage. */
export function saveGameToStorage(state: GameState): Uint8Array {
  const bytes = encodeGameStateBinary(state);
  try {
    localStorage.setItem(STORAGE_KEY, uint8ToBase64(bytes));
  } catch {
    // Ignore quota errors in restricted sandboxes
  }
  return bytes;
}

/** Retrieve raw binary bytes from localStorage if present. */
export function readRawSaveFromStorage(): Uint8Array | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return base64ToUint8(raw);
  } catch {
    return null;
  }
}

/** Load and validate saved game from localStorage. */
export function loadGameFromStorage(): DecodeSaveResult {
  const bytes = readRawSaveFromStorage();
  if (!bytes) {
    return { ok: false, error: 'No saved run found.' };
  }
  return decodeGameStateBinary(bytes);
}

/** Permadeath wipe: delete saved game from storage upon player death or victory. */
export function deleteSaveFromStorage(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}

/** Format the first N bytes as a crisp classic hex + ASCII dump for the Save Inspector. */
export function formatHexDump(bytes: Uint8Array, maxBytes = 96): string {
  const limit = Math.min(bytes.length, maxBytes);
  const lines: string[] = [];
  for (let offset = 0; offset < limit; offset += 16) {
    const hexParts: string[] = [];
    let ascii = '';
    for (let i = 0; i < 16; i++) {
      if (offset + i < limit) {
        const b = bytes[offset + i];
        hexParts.push(b.toString(16).padStart(2, '0').toUpperCase());
        ascii += b >= 32 && b <= 126 ? String.fromCharCode(b) : '.';
      } else {
        hexParts.push('  ');
        ascii += ' ';
      }
    }
    const addr = offset.toString(16).padStart(4, '0').toUpperCase();
    lines.push(`${addr}  ${hexParts.slice(0, 8).join(' ')}  ${hexParts.slice(8).join(' ')}  |${ascii}|`);
  }
  return lines.join('\n');
}

/** Corruption fuzzer mutations used in unit tests and the interactive Save Inspector. */
export function fuzzCorruptMagic(bytes: Uint8Array): Uint8Array {
  const copy = bytes.slice();
  if (copy.length >= 4) {
    copy[0] = 0x58; // 'X' instead of 'V'
    copy[1] = 0x58;
  }
  return copy;
}

export function fuzzCorruptVersion(bytes: Uint8Array): Uint8Array {
  const copy = bytes.slice();
  if (copy.length >= 6) {
    copy[4] = 99;
    copy[5] = 0;
  }
  return copy;
}

export function fuzzFlipPayloadBit(bytes: Uint8Array): Uint8Array {
  const copy = bytes.slice();
  if (copy.length > SAVE_HEADER_SIZE + 4) {
    copy[SAVE_HEADER_SIZE + 4] ^= 0x04;
  }
  return copy;
}

export function fuzzTruncatePayload(bytes: Uint8Array): Uint8Array {
  return bytes.slice(0, Math.max(SAVE_HEADER_SIZE, Math.floor(bytes.length * 0.5)));
}

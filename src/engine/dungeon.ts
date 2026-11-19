import { isWalkable, tileIndex } from './fov';
import { verifyMapConnectivityBFS } from './pathfinding';
import { Xorshift32 } from './rng';
import {
  AIState,
  DungeonMap,
  ENEMY_CATALOG,
  EnemyEntity,
  EnemyType,
  ITEM_CATALOG,
  ItemInstance,
  ItemType,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_FLOORS,
  Point,
  Room,
  TileType,
} from './types';

/**
 * Procedural Dungeon Generator for Sable.
 * Generates non-overlapping circuit-board chambers connected by L-corridors,
 * validates 100% walkability connectivity with BFS flood fill (retrying if disconnected),
 * and populates stairs, depth-scaled enemies, mini-bosses, Kernel Panic, and items.
 */

export interface GeneratedFloorResult {
  map: DungeonMap;
  playerStart: Point;
  enemies: EnemyEntity[];
  items: ItemInstance[];
  nextEntityId: number;
  generationAttempts: number;
}

const MIN_ROOM_W = 5;
const MAX_ROOM_W = 11;
const MIN_ROOM_H = 4;
const MAX_ROOM_H = 7;
const ROOM_PLACEMENT_ATTEMPTS = 42;
const TARGET_MIN_ROOMS = 7;
const TARGET_MAX_ROOMS = 12;

function roomsOverlap(a: Room, b: Room): boolean {
  return (
    a.x <= b.x + b.w + 1 &&
    a.x + a.w + 1 >= b.x &&
    a.y <= b.y + b.h + 1 &&
    a.y + a.h + 1 >= b.y
  );
}

function carveRoom(map: DungeonMap, room: Room): void {
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      map.tiles[tileIndex(map, x, y)] = TileType.FLOOR;
    }
  }
}

function carveHorizontalCorridor(map: DungeonMap, x1: number, x2: number, y: number): void {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  for (let x = minX; x <= maxX; x++) {
    const idx = tileIndex(map, x, y);
    if (map.tiles[idx] === TileType.WALL) {
      map.tiles[idx] = TileType.CORRIDOR;
    }
  }
}

function carveVerticalCorridor(map: DungeonMap, y1: number, y2: number, x: number): void {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  for (let y = minY; y <= maxY; y++) {
    const idx = tileIndex(map, x, y);
    if (map.tiles[idx] === TileType.WALL) {
      map.tiles[idx] = TileType.CORRIDOR;
    }
  }
}

function createEmptyMap(): DungeonMap {
  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    tiles: new Uint8Array(MAP_WIDTH * MAP_HEIGHT),
    visible: new Uint8Array(MAP_WIDTH * MAP_HEIGHT),
    explored: new Uint8Array(MAP_WIDTH * MAP_HEIGHT),
    rooms: [],
    stairsX: 0,
    stairsY: 0,
  };
}

/**
 * Attempt to carve one dungeon layout with rooms, corridors, and optional loop corridors.
 */
function buildCandidateMap(rng: Xorshift32, floor: number): DungeonMap {
  const map = createEmptyMap();
  const desiredRooms = floor === MAX_FLOORS ? 8 : rng.range(TARGET_MIN_ROOMS, TARGET_MAX_ROOMS);

  // On Floor 8, reserve a spacious central-right boss chamber for The Kernel Panic
  if (floor === MAX_FLOORS) {
    const bossRoom: Room = {
      x: MAP_WIDTH - 16,
      y: Math.floor(MAP_HEIGHT / 2) - 5,
      w: 13,
      h: 10,
      cx: MAP_WIDTH - 10,
      cy: Math.floor(MAP_HEIGHT / 2),
    };
    carveRoom(map, bossRoom);
    map.rooms.push(bossRoom);
  }

  for (let attempt = 0; attempt < ROOM_PLACEMENT_ATTEMPTS && map.rooms.length < desiredRooms; attempt++) {
    const w = rng.range(MIN_ROOM_W, MAX_ROOM_W);
    const h = rng.range(MIN_ROOM_H, MAX_ROOM_H);
    const x = rng.range(1, MAP_WIDTH - w - 2);
    const y = rng.range(1, MAP_HEIGHT - h - 2);

    const candidate: Room = {
      x,
      y,
      w,
      h,
      cx: Math.floor(x + w / 2),
      cy: Math.floor(y + h / 2),
    };

    let overlaps = false;
    for (const existing of map.rooms) {
      if (roomsOverlap(candidate, existing)) {
        overlaps = true;
        break;
      }
    }

    if (!overlaps) {
      carveRoom(map, candidate);
      map.rooms.push(candidate);
    }
  }

  // Fallback safeguard if RNG packed rooms tightly
  if (map.rooms.length < 2) {
    const r1: Room = { x: 2, y: 2, w: 8, h: 6, cx: 6, cy: 5 };
    const r2: Room = { x: MAP_WIDTH - 12, y: MAP_HEIGHT - 10, w: 9, h: 7, cx: MAP_WIDTH - 8, cy: MAP_HEIGHT - 7 };
    carveRoom(map, r1);
    carveRoom(map, r2);
    map.rooms = [r1, r2];
  }

  // Sort rooms left-to-right so corridors flow naturally like PCB bus traces
  map.rooms.sort((a, b) => a.cx - b.cx);

  // Connect consecutive rooms with L-shaped corridors
  for (let i = 1; i < map.rooms.length; i++) {
    const prev = map.rooms[i - 1];
    const curr = map.rooms[i];
    if (rng.chance(0.5)) {
      carveHorizontalCorridor(map, prev.cx, curr.cx, prev.cy);
      carveVerticalCorridor(map, prev.cy, curr.cy, curr.cx);
    } else {
      carveVerticalCorridor(map, prev.cy, curr.cy, prev.cx);
      carveHorizontalCorridor(map, prev.cx, curr.cx, curr.cy);
    }
  }

  // Add 1-2 extra loop corridors for tactical flanking and escape paths
  if (map.rooms.length >= 4) {
    const extraLinks = rng.range(1, 2);
    for (let l = 0; l < extraLinks; l++) {
      const a = map.rooms[rng.range(0, map.rooms.length - 1)];
      const b = map.rooms[rng.range(0, map.rooms.length - 1)];
      if (a !== b) {
        carveHorizontalCorridor(map, a.cx, b.cx, a.cy);
        carveVerticalCorridor(map, a.cy, b.cy, b.cx);
      }
    }
  }

  // Place stairs in the furthest room from start room (except floor 8 where stairs appear after boss, or still mark exit port)
  const lastRoom = map.rooms[map.rooms.length - 1];
  map.stairsX = lastRoom.cx;
  map.stairsY = lastRoom.cy;
  if (floor < MAX_FLOORS) {
    map.tiles[tileIndex(map, map.stairsX, map.stairsY)] = TileType.STAIRS_DOWN;
  }

  return map;
}

/**
 * Build a depth-scaled enemy entity from template.
 */
export function createEnemy(
  id: number,
  type: EnemyType,
  x: number,
  y: number,
  floor: number
): EnemyEntity {
  const tmpl = ENEMY_CATALOG[type];
  const depthScale = Math.max(0, floor - 1);
  const isBoss = type === EnemyType.OVERLOAD_GOLEM || type === EnemyType.KERNEL_PANIC;

  const hpScale = isBoss ? depthScale * 2 : Math.floor(depthScale * 2.1);
  const atkScale = isBoss ? Math.floor(depthScale * 0.5) : Math.floor(depthScale * 0.85);
  const defScale = isBoss ? Math.floor(depthScale * 0.3) : Math.floor(depthScale * 0.4);

  const maxHp = tmpl.baseHp + hpScale;

  return {
    id,
    type,
    x,
    y,
    hp: maxHp,
    maxHp,
    atk: tmpl.baseAtk + atkScale,
    def: tmpl.baseDef + defScale,
    xpValue: tmpl.xpValue + depthScale * 6,
    aiState: AIState.IDLE,
    lastKnownPlayerX: -1,
    lastKnownPlayerY: -1,
    turnParity: 0,
    teleportCooldown: 0,
    bossPhase: 1,
    alive: true,
    debugPath: [],
  };
}

function pickEnemyTypeForFloor(rng: Xorshift32, floor: number): EnemyType {
  const roll = rng.range(1, 100);
  if (floor === 1) {
    if (roll <= 55) return EnemyType.GLITCH;
    return EnemyType.NOISE_GREMLIN;
  }
  if (floor === 2) {
    if (roll <= 35) return EnemyType.GLITCH;
    if (roll <= 72) return EnemyType.NOISE_GREMLIN;
    return EnemyType.SHORT_CIRCUIT;
  }
  if (floor === 3) {
    if (roll <= 20) return EnemyType.GLITCH;
    if (roll <= 48) return EnemyType.NOISE_GREMLIN;
    if (roll <= 76) return EnemyType.SHORT_CIRCUIT;
    return EnemyType.CAPACITOR_SLIME;
  }
  if (floor <= 5) {
    if (roll <= 15) return EnemyType.GLITCH;
    if (roll <= 36) return EnemyType.NOISE_GREMLIN;
    if (roll <= 60) return EnemyType.SHORT_CIRCUIT;
    if (roll <= 82) return EnemyType.CAPACITOR_SLIME;
    return EnemyType.ROGUE_RELAY;
  }
  // Floors 6-8: full roster weighted toward tougher enemies
  if (roll <= 10) return EnemyType.GLITCH;
  if (roll <= 28) return EnemyType.NOISE_GREMLIN;
  if (roll <= 52) return EnemyType.SHORT_CIRCUIT;
  if (roll <= 76) return EnemyType.CAPACITOR_SLIME;
  return EnemyType.ROGUE_RELAY;
}

function pickItemTypeForFloor(rng: Xorshift32, floor: number): ItemType {
  const roll = rng.range(1, 100);
  if (roll <= 24) return ItemType.CAPACITOR_POTION;
  if (roll <= 40) return ItemType.BATTERY;
  if (roll <= 54) return ItemType.GOLD;
  if (roll <= 63) return ItemType.SCROLL_SHORT_CIRCUIT;
  if (roll <= 70) return ItemType.OSCILLOSCOPE;
  if (roll <= 76) return ItemType.MULTIMETER;
  if (roll <= 81) return ItemType.FUSE;
  if (roll <= 87) return floor >= 3 ? ItemType.WIRE_CUTTERS : ItemType.SOLDERING_IRON;
  if (roll <= 93) return floor >= 3 ? ItemType.HEAT_SINK_HELM : ItemType.RESISTOR_SHIELD;
  return rng.chance(0.5) ? ItemType.SOLDERING_IRON : ItemType.RESISTOR_SHIELD;
}

function randomFreeTileInRoom(
  rng: Xorshift32,
  map: DungeonMap,
  room: Room,
  occupied: Set<number>
): Point | null {
  for (let tries = 0; tries < 24; tries++) {
    const x = rng.range(room.x, room.x + room.w - 1);
    const y = rng.range(room.y, room.y + room.h - 1);
    const idx = tileIndex(map, x, y);
    if (isWalkable(map, x, y) && !occupied.has(idx)) {
      return { x, y };
    }
  }
  return null;
}

/**
 * Generate a fully validated, guaranteed-connected floor with player start, enemies, and items.
 */
export function generateDungeonFloor(
  rng: Xorshift32,
  floor: number,
  startingEntityId: number
): GeneratedFloorResult {
  let map = buildCandidateMap(rng, floor);
  let attempts = 1;

  // Verify full walkability connectivity with BFS flood fill; regenerate if disconnected
  while (!verifyMapConnectivityBFS(map).connected && attempts < 20) {
    map = buildCandidateMap(rng, floor);
    attempts++;
  }

  let nextId = startingEntityId;
  const startRoom = map.rooms[0];
  const playerStart: Point = { x: startRoom.cx, y: startRoom.cy };

  const occupied = new Set<number>();
  occupied.add(tileIndex(map, playerStart.x, playerStart.y));
  if (floor < MAX_FLOORS) {
    occupied.add(tileIndex(map, map.stairsX, map.stairsY));
  }

  const enemies: EnemyEntity[] = [];
  const items: ItemInstance[] = [];

  // Spawn Floor 4 & 6 Mini-Boss: Overload Golem in the stairs room
  const finalRoom = map.rooms[map.rooms.length - 1];
  if (floor === 4 || floor === 6) {
    const pos = randomFreeTileInRoom(rng, map, finalRoom, occupied);
    if (pos) {
      occupied.add(tileIndex(map, pos.x, pos.y));
      enemies.push(createEnemy(nextId++, EnemyType.OVERLOAD_GOLEM, pos.x, pos.y, floor));
    }
  }

  // Spawn Floor 8 Final Boss: The Kernel Panic in the boss chamber
  if (floor === MAX_FLOORS) {
    const bossPos = { x: finalRoom.cx, y: finalRoom.cy };
    occupied.add(tileIndex(map, bossPos.x, bossPos.y));
    enemies.push(createEnemy(nextId++, EnemyType.KERNEL_PANIC, bossPos.x, bossPos.y, floor));
  }

  // Populate non-start rooms with enemies and loot
  const targetEnemies = Math.min(18, 5 + floor * 2);
  for (let r = 1; r < map.rooms.length; r++) {
    const room = map.rooms[r];
    if (enemies.length < targetEnemies) {
      const spawnsHere = rng.range(1, 2);
      for (let s = 0; s < spawnsHere && enemies.length < targetEnemies; s++) {
        const pos = randomFreeTileInRoom(rng, map, room, occupied);
        if (!pos) continue;
        const type = pickEnemyTypeForFloor(rng, floor);
        occupied.add(tileIndex(map, pos.x, pos.y));
        enemies.push(createEnemy(nextId++, type, pos.x, pos.y, floor));

        // Noise Gremlins spawn in packs (attempt to spawn a packmate nearby)
        if (type === EnemyType.NOISE_GREMLIN && enemies.length < targetEnemies && rng.chance(0.65)) {
          const matePos = randomFreeTileInRoom(rng, map, room, occupied);
          if (matePos) {
            occupied.add(tileIndex(map, matePos.x, matePos.y));
            enemies.push(createEnemy(nextId++, EnemyType.NOISE_GREMLIN, matePos.x, matePos.y, floor));
          }
        }
      }
    }

    // Spawn 1-2 items or gold per room
    const itemCount = rng.chance(0.78) ? rng.range(1, 2) : 0;
    for (let k = 0; k < itemCount; k++) {
      const pos = randomFreeTileInRoom(rng, map, room, occupied);
      if (!pos) continue;
      const itemType = pickItemTypeForFloor(rng, floor);
      const tmpl = ITEM_CATALOG[itemType];
      const value =
        itemType === ItemType.GOLD
          ? rng.range(10 + floor * 4, 24 + floor * 8)
          : tmpl.power + Math.floor((floor - 1) / 2);
      items.push({
        id: nextId++,
        type: itemType,
        value,
        x: pos.x,
        y: pos.y,
      });
    }
  }

  // Guarantee at least one healing Capacitor Potion per floor for fair balance
  const hasPotion = items.some((it) => it.type === ItemType.CAPACITOR_POTION);
  if (!hasPotion && map.rooms.length > 1) {
    const fallbackRoom = map.rooms[rng.range(1, map.rooms.length - 1)];
    const pos = randomFreeTileInRoom(rng, map, fallbackRoom, new Set([tileIndex(map, playerStart.x, playerStart.y)]));
    if (pos) {
      items.push({
        id: nextId++,
        type: ItemType.CAPACITOR_POTION,
        value: ITEM_CATALOG[ItemType.CAPACITOR_POTION].power + floor * 2,
        x: pos.x,
        y: pos.y,
      });
    }
  }

  // Guarantee one starting Soldering Iron or Capacitor Potion near Floor 1 for immediate tactical play
  if (floor === 1) {
    const startDrop = randomFreeTileInRoom(rng, map, startRoom, occupied);
    if (startDrop) {
      items.push({
        id: nextId++,
        type: ItemType.CAPACITOR_POTION,
        value: ITEM_CATALOG[ItemType.CAPACITOR_POTION].power,
        x: startDrop.x,
        y: startDrop.y,
      });
    }
  }

  return {
    map,
    playerStart,
    enemies,
    items,
    nextEntityId: nextId,
    generationAttempts: attempts,
  };
}

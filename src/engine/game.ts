import { processEnemyTurns } from './ai';
import {
  castScrollOfShortCircuit,
  executeSurgeAbility,
  playerMeleeAttack,
  pushLog,
} from './combat';
import { generateDungeonFloor } from './dungeon';
import { computeShadowcastFOV, isWalkable, revealEntireMap, tileIndex } from './fov';
import { Xorshift32 } from './rng';
import { RingBuffer } from './structures';
import {
  ENERGY_REGEN_TURNS,
  GameEvent,
  GamePhase,
  GameState,
  INVENTORY_CAPACITY,
  ITEM_CATALOG,
  ItemCategory,
  ItemType,
  LOG_BUFFER_CAPACITY,
  LogEntry,
  LogSeverity,
  MAX_FLOORS,
  PLAYER_FOV_RADIUS,
  TileType,
} from './types';

/**
 * Headless Game Session & Turn Orchestrator for Sable.
 * Every player action returns a mutated/updated GameState alongside structured GameEvents
 * so the UI can play audio/visual cues and tests/bots can drive turns identically without a DOM.
 */

export interface TurnResult {
  state: GameState;
  events: GameEvent[];
  turnConsumed: boolean;
}

export interface ScoreBreakdown {
  floorPoints: number;
  killPoints: number;
  goldPoints: number;
  speedBonus: number;
  victoryBonus: number;
  total: number;
}

/** Transparent score formula combining depth, kills, gold, turn efficiency, and victory. */
export function computeScoreBreakdown(state: GameState): ScoreBreakdown {
  const floorPoints = state.stats.deepestFloor * 1000;
  const killPoints = state.stats.kills * 75;
  const goldPoints = state.player.gold * 5;
  const speedBonus = Math.max(0, 1500 - state.turn);
  const victoryBonus = state.phase === GamePhase.VICTORY ? 3000 : 0;
  return {
    floorPoints,
    killPoints,
    goldPoints,
    speedBonus,
    victoryBonus,
    total: floorPoints + killPoints + goldPoints + speedBonus + victoryBonus,
  };
}

/** Sync a RingBuffer with a GameState's log array for O(1) bounded message retention. */
export function trimLogWithRingBuffer(entries: LogEntry[]): LogEntry[] {
  const rb = new RingBuffer<LogEntry>(LOG_BUFFER_CAPACITY);
  for (const entry of entries) {
    rb.push(entry);
  }
  return rb.toArray();
}

/** Create a brand-new deterministic Sable run on Floor 1 from a numeric seed. */
export function createNewGame(seed: number): GameState {
  const normalizedSeed = (seed >>> 0) || 12345;
  const rng = new Xorshift32(normalizedSeed);
  const generated = generateDungeonFloor(rng, 1, 1);

  computeShadowcastFOV(
    generated.map,
    generated.playerStart.x,
    generated.playerStart.y,
    PLAYER_FOV_RADIUS
  );

  const state: GameState = {
    seed: normalizedSeed,
    rngState: rng.getState(),
    floor: 1,
    turn: 0,
    phase: GamePhase.PLAYING,
    nextEntityId: generated.nextEntityId,
    player: {
      x: generated.playerStart.x,
      y: generated.playerStart.y,
      hp: 34,
      maxHp: 34,
      energy: 12,
      maxEnergy: 12,
      baseAtk: 6,
      baseDef: 2,
      level: 1,
      xp: 0,
      nextLevelXp: 50,
      gold: 0,
      equippedWeapon: null,
      equippedArmor: null,
      inventory: [],
      oscilloscopeActive: false,
      multimeterActive: false,
      lastDirX: 1,
      lastDirY: 0,
      energyRegenCounter: 0,
    },
    map: generated.map,
    enemies: generated.enemies,
    groundItems: generated.items,
    logEntries: [],
    stats: {
      kills: 0,
      damageDealt: 0,
      damageTaken: 0,
      itemsUsed: 0,
      surgesFired: 0,
      deepestFloor: 1,
      causeOfDeath: '',
    },
  };

  pushLog(
    state,
    LogSeverity.SYSTEM,
    `Entered Noise Floor 1 (Seed ${normalizedSeed}). Descend to Floor ${MAX_FLOORS} and terminate The Kernel Panic.`
  );
  return state;
}

/** Advance world state after a turn-consuming player action: passive energy regen, enemies, FOV. */
function finalizeTurn(state: GameState, rng: Xorshift32, events: GameEvent[]): void {
  state.turn += 1;

  // Passive energy recharge every ENERGY_REGEN_TURNS
  state.player.energyRegenCounter += 1;
  if (state.player.energyRegenCounter >= ENERGY_REGEN_TURNS) {
    state.player.energyRegenCounter = 0;
    if (state.player.energy < state.player.maxEnergy) {
      state.player.energy += 1;
    }
  }

  if (state.phase === GamePhase.PLAYING) {
    processEnemyTurns(state, rng, events);
  }

  computeShadowcastFOV(state.map, state.player.x, state.player.y, PLAYER_FOV_RADIUS);
  state.logEntries = trimLogWithRingBuffer(state.logEntries);
  state.rngState = rng.getState();
}

function hydrateRng(state: GameState): Xorshift32 {
  const rng = new Xorshift32(state.seed);
  rng.setState(state.rngState);
  return rng;
}

/**
 * Move the Engineer by (dx, dy) or bump-attack an adjacent enemy.
 * Automatically picks up Gold stepped onto.
 */
export function moveOrAttack(state: GameState, dx: number, dy: number): TurnResult {
  const events: GameEvent[] = [];
  if (state.phase !== GamePhase.PLAYING) {
    return { state, events, turnConsumed: false };
  }

  const rng = hydrateRng(state);
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;

  if (dx !== 0 || dy !== 0) {
    state.player.lastDirX = Math.sign(dx);
    state.player.lastDirY = Math.sign(dy);
  }

  // Check for enemy at destination (bump-to-attack)
  const targetEnemy = state.enemies.find((e) => e.alive && e.x === nx && e.y === ny);
  if (targetEnemy) {
    playerMeleeAttack(state, targetEnemy, rng, events);
    finalizeTurn(state, rng, events);
    return { state, events, turnConsumed: true };
  }

  if (!isWalkable(state.map, nx, ny)) {
    events.push({ type: 'BUMP_WALL', x: nx, y: ny });
    return { state, events, turnConsumed: false };
  }

  state.player.x = nx;
  state.player.y = ny;
  events.push({ type: 'STEP', x: nx, y: ny });

  // Auto-collect Gold traces stepped onto
  const goldIndices: number[] = [];
  for (let i = 0; i < state.groundItems.length; i++) {
    const it = state.groundItems[i];
    if (it.x === nx && it.y === ny && it.type === ItemType.GOLD) {
      state.player.gold += it.value;
      goldIndices.push(i);
      events.push({ type: 'PICKUP', x: nx, y: ny, amount: it.value });
      pushLog(state, LogSeverity.LOOT, `Collected ${it.value} Gold traces.`);
    }
  }
  for (let i = goldIndices.length - 1; i >= 0; i--) {
    state.groundItems.splice(goldIndices[i], 1);
  }

  // Hint if stepping onto an item or stairs
  const standingItem = state.groundItems.find((it) => it.x === nx && it.y === ny);
  if (standingItem) {
    const tmpl = ITEM_CATALOG[standingItem.type];
    pushLog(state, LogSeverity.INFO, `You see ${tmpl.name} here (press g to pick up).`);
  } else if (state.map.tiles[tileIndex(state.map, nx, ny)] === TileType.STAIRS_DOWN) {
    pushLog(state, LogSeverity.SYSTEM, `Standing on Descent Port '>' (press > to descend).`);
  }

  finalizeTurn(state, rng, events);
  return { state, events, turnConsumed: true };
}

/** Wait a single turn ('.' or Space), letting enemies move and regenerating energy counter. */
export function waitTurn(state: GameState): TurnResult {
  const events: GameEvent[] = [];
  if (state.phase !== GamePhase.PLAYING) {
    return { state, events, turnConsumed: false };
  }
  const rng = hydrateRng(state);
  finalizeTurn(state, rng, events);
  return { state, events, turnConsumed: true };
}

/** Pick up the item beneath the Engineer's feet ('g'). */
export function pickupItem(state: GameState): TurnResult {
  const events: GameEvent[] = [];
  if (state.phase !== GamePhase.PLAYING) {
    return { state, events, turnConsumed: false };
  }

  const idx = state.groundItems.findIndex(
    (it) => it.x === state.player.x && it.y === state.player.y
  );
  if (idx === -1) {
    pushLog(state, LogSeverity.INFO, `Nothing on the circuit floor to pick up.`);
    return { state, events, turnConsumed: false };
  }

  const item = state.groundItems[idx];
  if (item.type === ItemType.GOLD) {
    state.groundItems.splice(idx, 1);
    state.player.gold += item.value;
    events.push({ type: 'PICKUP', x: state.player.x, y: state.player.y, amount: item.value });
    pushLog(state, LogSeverity.LOOT, `Collected ${item.value} Gold.`);
    const rng = hydrateRng(state);
    finalizeTurn(state, rng, events);
    return { state, events, turnConsumed: true };
  }

  if (state.player.inventory.length >= INVENTORY_CAPACITY) {
    pushLog(state, LogSeverity.INFO, `Inventory full (${INVENTORY_CAPACITY}/${INVENTORY_CAPACITY}). Drop an item first.`);
    return { state, events, turnConsumed: false };
  }

  state.groundItems.splice(idx, 1);
  state.player.inventory.push(item);
  const tmpl = ITEM_CATALOG[item.type];
  events.push({ type: 'PICKUP', x: state.player.x, y: state.player.y });
  pushLog(state, LogSeverity.LOOT, `Picked up ${tmpl.name}.`);

  const rng = hydrateRng(state);
  finalizeTurn(state, rng, events);
  return { state, events, turnConsumed: true };
}

/** Use a consumable item from inventory by index ('u'). */
export function useInventoryItem(state: GameState, invIndex: number): TurnResult {
  const events: GameEvent[] = [];
  if (state.phase !== GamePhase.PLAYING) {
    return { state, events, turnConsumed: false };
  }
  const item = state.player.inventory[invIndex];
  if (!item) return { state, events, turnConsumed: false };

  const tmpl = ITEM_CATALOG[item.type];
  if (tmpl.category === ItemCategory.WEAPON || tmpl.category === ItemCategory.ARMOR) {
    return equipInventoryItem(state, invIndex);
  }
  if (item.type === ItemType.FUSE) {
    pushLog(state, LogSeverity.INFO, `Fuse is passive — keep it in your pack to auto-revive on lethal damage.`);
    return { state, events, turnConsumed: false };
  }

  const rng = hydrateRng(state);
  state.player.inventory.splice(invIndex, 1);
  state.stats.itemsUsed += 1;

  switch (item.type) {
    case ItemType.CAPACITOR_POTION: {
      const healAmount = item.value;
      const before = state.player.hp;
      state.player.hp = Math.min(state.player.maxHp, state.player.hp + healAmount);
      const gained = state.player.hp - before;
      events.push({ type: 'HEAL', x: state.player.x, y: state.player.y, amount: gained });
      pushLog(state, LogSeverity.LOOT, `Drank Capacitor Potion (+${gained} HP).`);
      break;
    }
    case ItemType.BATTERY: {
      const before = state.player.energy;
      state.player.energy = Math.min(state.player.maxEnergy, state.player.energy + item.value);
      const gained = state.player.energy - before;
      events.push({ type: 'ENERGY', x: state.player.x, y: state.player.y, amount: gained });
      pushLog(state, LogSeverity.LOOT, `Slotted Battery (+${gained} Energy).`);
      break;
    }
    case ItemType.OSCILLOSCOPE: {
      state.player.oscilloscopeActive = true;
      revealEntireMap(state.map);
      events.push({ type: 'PICKUP', x: state.player.x, y: state.player.y });
      pushLog(state, LogSeverity.SYSTEM, `Oscilloscope sweep complete — entire Floor ${state.floor} mapped!`);
      break;
    }
    case ItemType.MULTIMETER: {
      state.player.multimeterActive = true;
      events.push({ type: 'PICKUP', x: state.player.x, y: state.player.y });
      pushLog(state, LogSeverity.SYSTEM, `Multimeter calibrated — enemy HP telemetry unlocked on Floor ${state.floor}.`);
      break;
    }
    case ItemType.SCROLL_SHORT_CIRCUIT: {
      castScrollOfShortCircuit(state, rng, events);
      break;
    }
    default:
      break;
  }

  finalizeTurn(state, rng, events);
  return { state, events, turnConsumed: true };
}

/** Equip a weapon or armor item from inventory by index ('e'). */
export function equipInventoryItem(state: GameState, invIndex: number): TurnResult {
  const events: GameEvent[] = [];
  if (state.phase !== GamePhase.PLAYING) {
    return { state, events, turnConsumed: false };
  }
  const item = state.player.inventory[invIndex];
  if (!item) return { state, events, turnConsumed: false };

  const tmpl = ITEM_CATALOG[item.type];
  if (tmpl.category !== ItemCategory.WEAPON && tmpl.category !== ItemCategory.ARMOR) {
    pushLog(state, LogSeverity.INFO, `${tmpl.name} cannot be equipped — use it instead.`);
    return { state, events, turnConsumed: false };
  }

  state.player.inventory.splice(invIndex, 1);

  if (tmpl.category === ItemCategory.WEAPON) {
    const previous = state.player.equippedWeapon;
    state.player.equippedWeapon = item;
    if (previous) state.player.inventory.push(previous);
    pushLog(state, LogSeverity.SYSTEM, `Equipped ${tmpl.name} (+${item.value} ATK).`);
  } else {
    const previous = state.player.equippedArmor;
    state.player.equippedArmor = item;
    if (previous) state.player.inventory.push(previous);
    pushLog(state, LogSeverity.SYSTEM, `Equipped ${tmpl.name} (+${item.value} DEF).`);
  }

  events.push({ type: 'PICKUP', x: state.player.x, y: state.player.y });
  const rng = hydrateRng(state);
  finalizeTurn(state, rng, events);
  return { state, events, turnConsumed: true };
}

/** Drop an item from inventory onto the current floor tile ('d'). */
export function dropInventoryItem(state: GameState, invIndex: number): TurnResult {
  const events: GameEvent[] = [];
  if (state.phase !== GamePhase.PLAYING) {
    return { state, events, turnConsumed: false };
  }
  const item = state.player.inventory[invIndex];
  if (!item) return { state, events, turnConsumed: false };

  state.player.inventory.splice(invIndex, 1);
  item.x = state.player.x;
  item.y = state.player.y;
  state.groundItems.push(item);

  const tmpl = ITEM_CATALOG[item.type];
  pushLog(state, LogSeverity.INFO, `Dropped ${tmpl.name}.`);

  const rng = hydrateRng(state);
  finalizeTurn(state, rng, events);
  return { state, events, turnConsumed: true };
}

/** Fire the Surge directional beam ability ('f' + direction). */
export function fireSurge(state: GameState, dx: number, dy: number): TurnResult {
  const events: GameEvent[] = [];
  if (state.phase !== GamePhase.PLAYING) {
    return { state, events, turnConsumed: false };
  }

  const rng = hydrateRng(state);
  const fired = executeSurgeAbility(state, dx, dy, rng, events);
  if (!fired) {
    return { state, events, turnConsumed: false };
  }

  state.player.lastDirX = Math.sign(dx);
  state.player.lastDirY = Math.sign(dy);
  finalizeTurn(state, rng, events);
  return { state, events, turnConsumed: true };
}

/** Descend stairs ('>') when standing on the Descent Port. */
export function descendStairs(state: GameState): TurnResult {
  const events: GameEvent[] = [];
  if (state.phase !== GamePhase.PLAYING) {
    return { state, events, turnConsumed: false };
  }

  const standingTile = state.map.tiles[tileIndex(state.map, state.player.x, state.player.y)];
  if (standingTile !== TileType.STAIRS_DOWN) {
    pushLog(state, LogSeverity.INFO, `You must stand on the Descent Port '>' to descend.`);
    return { state, events, turnConsumed: false };
  }

  if (state.floor >= MAX_FLOORS) {
    pushLog(state, LogSeverity.BOSS, `Defeat The Kernel Panic to stabilize Floor ${MAX_FLOORS}!`);
    return { state, events, turnConsumed: false };
  }

  const rng = hydrateRng(state);
  state.floor += 1;
  state.stats.deepestFloor = Math.max(state.stats.deepestFloor, state.floor);

  const generated = generateDungeonFloor(rng, state.floor, state.nextEntityId);
  state.map = generated.map;
  state.enemies = generated.enemies;
  state.groundItems = generated.items;
  state.nextEntityId = generated.nextEntityId;
  state.player.x = generated.playerStart.x;
  state.player.y = generated.playerStart.y;
  state.player.oscilloscopeActive = false;
  state.player.multimeterActive = false;

  // Small floor transition recovery
  state.player.hp = Math.min(state.player.maxHp, state.player.hp + 4);
  state.player.energy = Math.min(state.player.maxEnergy, state.player.energy + 3);

  computeShadowcastFOV(state.map, state.player.x, state.player.y, PLAYER_FOV_RADIUS);
  state.rngState = rng.getState();

  events.push({ type: 'STAIRS', x: state.player.x, y: state.player.y });

  if (state.floor === 4 || state.floor === 6) {
    pushLog(
      state,
      LogSeverity.BOSS,
      `Descended to Floor ${state.floor}. High-voltage signature detected: Overload Golem active!`
    );
  } else if (state.floor === MAX_FLOORS) {
    pushLog(
      state,
      LogSeverity.BOSS,
      `Descended to Floor ${MAX_FLOORS} — CORE BUS. The Kernel Panic awaits!`
    );
  } else {
    pushLog(state, LogSeverity.SYSTEM, `Descended to Noise Floor ${state.floor}.`);
  }

  return { state, events, turnConsumed: true };
}

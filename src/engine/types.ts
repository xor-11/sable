/**
 * Core domain types, named constants, and static item/enemy catalogs for Sable.
 * Strictly zero DOM/React dependencies so the engine runs identically in browser and headless tests.
 */

export const MAP_WIDTH = 60;
export const MAP_HEIGHT = 24;
export const MAX_FLOORS = 8;
export const PLAYER_FOV_RADIUS = 8;
export const INVENTORY_CAPACITY = 14;
export const LOG_BUFFER_CAPACITY = 64;
export const SURGE_ENERGY_COST = 4;
export const SURGE_RANGE = 6;
export const ENERGY_REGEN_TURNS = 4;

export enum TileType {
  WALL = 0,
  FLOOR = 1,
  CORRIDOR = 2,
  STAIRS_DOWN = 3,
}

export enum EnemyType {
  GLITCH = 0,
  NOISE_GREMLIN = 1,
  SHORT_CIRCUIT = 2,
  CAPACITOR_SLIME = 3,
  ROGUE_RELAY = 4,
  OVERLOAD_GOLEM = 5,
  KERNEL_PANIC = 6,
}

export enum AIState {
  IDLE = 0,
  WANDER = 1,
  CHASE = 2,
  FLEE = 3,
  ATTACK = 4,
}

export enum ItemType {
  SOLDERING_IRON = 0,
  WIRE_CUTTERS = 1,
  RESISTOR_SHIELD = 2,
  HEAT_SINK_HELM = 3,
  CAPACITOR_POTION = 4,
  BATTERY = 5,
  OSCILLOSCOPE = 6,
  MULTIMETER = 7,
  FUSE = 8,
  SCROLL_SHORT_CIRCUIT = 9,
  GOLD = 10,
}

export enum ItemCategory {
  WEAPON = 'WEAPON',
  ARMOR = 'ARMOR',
  CONSUMABLE = 'CONSUMABLE',
  PASSIVE = 'PASSIVE',
  CURRENCY = 'CURRENCY',
}

export enum LogSeverity {
  INFO = 0,
  COMBAT = 1,
  DANGER = 2,
  LOOT = 3,
  SYSTEM = 4,
  BOSS = 5,
}

export enum GamePhase {
  PLAYING = 0,
  VICTORY = 1,
  DEAD = 2,
}

export interface Point {
  x: number;
  y: number;
}

export interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}

export interface ItemTemplate {
  type: ItemType;
  name: string;
  glyph: string;
  category: ItemCategory;
  color: string;
  power: number;
  description: string;
}

export interface ItemInstance {
  id: number;
  type: ItemType;
  value: number; // Gold amount or bonus tier
  x: number;
  y: number;
}

export interface EnemyTemplate {
  type: EnemyType;
  name: string;
  glyph: string;
  color: string;
  baseHp: number;
  baseAtk: number;
  baseDef: number;
  xpValue: number;
  sightRange: number;
  description: string;
}

export interface EnemyEntity {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  xpValue: number;
  aiState: AIState;
  lastKnownPlayerX: number;
  lastKnownPlayerY: number;
  turnParity: number; // Used by Capacitor Slime (slow) and teleport cooldowns
  teleportCooldown: number;
  bossPhase: number; // 1, 2, or 3 for Kernel Panic
  alive: boolean;
  /** Latest computed path for live A-star and BFS tactical overlay (not persisted in binary save) */
  debugPath: Point[];
}

export interface PlayerState {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  baseAtk: number;
  baseDef: number;
  level: number;
  xp: number;
  nextLevelXp: number;
  gold: number;
  equippedWeapon: ItemInstance | null;
  equippedArmor: ItemInstance | null;
  inventory: ItemInstance[];
  oscilloscopeActive: boolean;
  multimeterActive: boolean;
  lastDirX: number;
  lastDirY: number;
  energyRegenCounter: number;
}

export interface LogEntry {
  turn: number;
  severity: LogSeverity;
  text: string;
}

export interface DungeonMap {
  width: number;
  height: number;
  tiles: Uint8Array;
  visible: Uint8Array;
  explored: Uint8Array;
  rooms: Room[];
  stairsX: number;
  stairsY: number;
}

export interface RunStats {
  kills: number;
  damageDealt: number;
  damageTaken: number;
  itemsUsed: number;
  surgesFired: number;
  deepestFloor: number;
  causeOfDeath: string;
}

export type GameEventType =
  | 'STEP'
  | 'HIT'
  | 'CRIT'
  | 'PLAYER_HIT'
  | 'KILL'
  | 'SURGE'
  | 'EXPLOSION'
  | 'PICKUP'
  | 'HEAL'
  | 'ENERGY'
  | 'LEVEL_UP'
  | 'STAIRS'
  | 'BOSS_PHASE'
  | 'FUSE_REVIVE'
  | 'SCROLL'
  | 'TELEPORT'
  | 'VICTORY'
  | 'DEATH'
  | 'BUMP_WALL';

export interface GameEvent {
  type: GameEventType;
  x?: number;
  y?: number;
  cells?: Point[];
  amount?: number;
}

export interface GameState {
  seed: number;
  rngState: number;
  floor: number;
  turn: number;
  phase: GamePhase;
  nextEntityId: number;
  player: PlayerState;
  map: DungeonMap;
  enemies: EnemyEntity[];
  groundItems: ItemInstance[];
  logEntries: LogEntry[];
  stats: RunStats;
}

export const AI_STATE_NAMES: Record<AIState, string> = {
  [AIState.IDLE]: 'IDLE',
  [AIState.WANDER]: 'WANDER',
  [AIState.CHASE]: 'CHASE',
  [AIState.FLEE]: 'FLEE',
  [AIState.ATTACK]: 'ATTACK',
};

export const ENEMY_CATALOG: Record<EnemyType, EnemyTemplate> = {
  [EnemyType.GLITCH]: {
    type: EnemyType.GLITCH,
    name: 'Glitch',
    glyph: 'g',
    color: '#A78BFA',
    baseHp: 9,
    baseAtk: 4,
    baseDef: 1,
    xpValue: 18,
    sightRange: 7,
    description: 'Weak erratic anomaly. Moves randomly 30% of the time.',
  },
  [EnemyType.NOISE_GREMLIN]: {
    type: EnemyType.NOISE_GREMLIN,
    name: 'Noise Gremlin',
    glyph: 'n',
    color: '#FB923C',
    baseHp: 11,
    baseAtk: 5,
    baseDef: 1,
    xpValue: 22,
    sightRange: 8,
    description: 'Spawns in coordinated packs and chases aggressively by sight.',
  },
  [EnemyType.SHORT_CIRCUIT]: {
    type: EnemyType.SHORT_CIRCUIT,
    name: 'Short Circuit',
    glyph: 's',
    color: '#FACC15',
    baseHp: 8,
    baseAtk: 5,
    baseDef: 0,
    xpValue: 28,
    sightRange: 9,
    description: 'High-voltage spark. Low HP, but acts twice every turn.',
  },
  [EnemyType.CAPACITOR_SLIME]: {
    type: EnemyType.CAPACITOR_SLIME,
    name: 'Capacitor Slime',
    glyph: 'c',
    color: '#34D399',
    baseHp: 22,
    baseAtk: 6,
    baseDef: 3,
    xpValue: 35,
    sightRange: 6,
    description: 'Slow, armored tank. Discharges area blast damage on death.',
  },
  [EnemyType.ROGUE_RELAY]: {
    type: EnemyType.ROGUE_RELAY,
    name: 'Rogue Relay',
    glyph: 'r',
    color: '#38BDF8',
    baseHp: 14,
    baseAtk: 6,
    baseDef: 2,
    xpValue: 38,
    sightRange: 9,
    description: 'Keeps distance via BFS kiting and teleports short range to flank.',
  },
  [EnemyType.OVERLOAD_GOLEM]: {
    type: EnemyType.OVERLOAD_GOLEM,
    name: 'Overload Golem',
    glyph: 'O',
    color: '#F59E0B',
    baseHp: 46,
    baseAtk: 10,
    baseDef: 4,
    xpValue: 110,
    sightRange: 9,
    description: 'Heavy silicon guardian mini-boss patrolling Floors 4 and 6.',
  },
  [EnemyType.KERNEL_PANIC]: {
    type: EnemyType.KERNEL_PANIC,
    name: 'The Kernel Panic',
    glyph: 'K',
    color: '#F87171',
    baseHp: 105,
    baseAtk: 13,
    baseDef: 5,
    xpValue: 400,
    sightRange: 12,
    description: 'Floor 8 final boss. Shifts phases at 66% HP (summons Glitches) and 33% HP (overclocked discharge).',
  },
};

export const ITEM_CATALOG: Record<ItemType, ItemTemplate> = {
  [ItemType.SOLDERING_IRON]: {
    type: ItemType.SOLDERING_IRON,
    name: 'Soldering Iron',
    glyph: '/',
    category: ItemCategory.WEAPON,
    color: '#F97316',
    power: 3,
    description: 'Superheated tip. Equip to gain +3 ATK (scales with floor tier).',
  },
  [ItemType.WIRE_CUTTERS]: {
    type: ItemType.WIRE_CUTTERS,
    name: 'Wire Cutters',
    glyph: ')',
    category: ItemCategory.WEAPON,
    color: '#FBBF24',
    power: 5,
    description: 'Heavy insulated shears. Equip to gain +5 ATK (scales with floor tier).',
  },
  [ItemType.RESISTOR_SHIELD]: {
    type: ItemType.RESISTOR_SHIELD,
    name: 'Resistor Shield',
    glyph: '[',
    category: ItemCategory.ARMOR,
    color: '#60A5FA',
    power: 2,
    description: 'Dissipates current spikes. Equip to gain +2 DEF (scales with floor tier).',
  },
  [ItemType.HEAT_SINK_HELM]: {
    type: ItemType.HEAT_SINK_HELM,
    name: 'Heat Sink Helm',
    glyph: ']',
    category: ItemCategory.ARMOR,
    color: '#93C5FD',
    power: 4,
    description: 'Finned aluminum plating. Equip to gain +4 DEF (scales with floor tier).',
  },
  [ItemType.CAPACITOR_POTION]: {
    type: ItemType.CAPACITOR_POTION,
    name: 'Capacitor Potion',
    glyph: '!',
    category: ItemCategory.CONSUMABLE,
    color: '#34D399',
    power: 18,
    description: 'Restores 18 HP (plus floor bonus) immediately on use.',
  },
  [ItemType.BATTERY]: {
    type: ItemType.BATTERY,
    name: 'Battery',
    glyph: '+',
    category: ItemCategory.CONSUMABLE,
    color: '#38BDF8',
    power: 10,
    description: 'Recharges 10 Energy for Surge attacks.',
  },
  [ItemType.OSCILLOSCOPE]: {
    type: ItemType.OSCILLOSCOPE,
    name: 'Oscilloscope',
    glyph: '%',
    category: ItemCategory.CONSUMABLE,
    color: '#2DD4BF',
    power: 1,
    description: 'Reveals the entire floor layout and stairs location once.',
  },
  [ItemType.MULTIMETER]: {
    type: ItemType.MULTIMETER,
    name: 'Multimeter',
    glyph: '=',
    category: ItemCategory.CONSUMABLE,
    color: '#A78BFA',
    power: 1,
    description: 'Displays exact enemy HP bars and stats for the current floor.',
  },
  [ItemType.FUSE]: {
    type: ItemType.FUSE,
    name: 'Fuse',
    glyph: '&',
    category: ItemCategory.PASSIVE,
    color: '#FDE047',
    power: 1,
    description: 'Held passively. Auto-revives you with 50% HP on fatal blow, then burns out.',
  },
  [ItemType.SCROLL_SHORT_CIRCUIT]: {
    type: ItemType.SCROLL_SHORT_CIRCUIT,
    name: 'Scroll of Short Circuit',
    glyph: '?',
    category: ItemCategory.CONSUMABLE,
    color: '#F472B6',
    power: 16,
    description: 'Arcs across the board, dealing heavy voltage damage to all visible enemies.',
  },
  [ItemType.GOLD]: {
    type: ItemType.GOLD,
    name: 'Gold Trace',
    glyph: '$',
    category: ItemCategory.CURRENCY,
    color: '#F59E0B',
    power: 10,
    description: 'Conductive gold scrap that boosts your final run score.',
  },
};

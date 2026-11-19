import {
  decodeGameStateBinary,
  encodeGameStateBinary,
  fuzzCorruptMagic,
  fuzzCorruptVersion,
  fuzzFlipPayloadBit,
  fuzzTruncatePayload,
} from './binarySave';
import { getPlayerAttack, rollCombatDamage } from './combat';
import { generateDungeonFloor } from './dungeon';
import { isWalkable, tileIndex } from './fov';
import {
  computeScoreBreakdown,
  createNewGame,
  descendStairs,
  equipInventoryItem,
  fireSurge,
  moveOrAttack,
  pickupItem,
  useInventoryItem,
  waitTurn,
} from './game';
import { computeBFSDistanceMap, findPathAStar, verifyMapConnectivityBFS } from './pathfinding';
import { Xorshift32 } from './rng';
import { DynamicArray, MinHeap, RingBuffer } from './structures';
import {
  DungeonMap,
  GamePhase,
  GameState,
  ITEM_CATALOG,
  ItemCategory,
  ItemType,
  MAX_FLOORS,
  SURGE_ENERGY_COST,
  TileType,
} from './types';

/**
 * Headless Unit Test Suite & Autonomous Bot Balance Simulator.
 * Executes directly against the pure game engine with zero DOM dependencies.
 */

export interface UnitTestResult {
  id: string;
  name: string;
  passed: boolean;
  durationMs: number;
  details: string;
}

export function runAllUnitTests(): UnitTestResult[] {
  const results: UnitTestResult[] = [];

  const runTest = (id: string, name: string, fn: () => string): void => {
    const start = performance.now();
    try {
      const details = fn();
      results.push({
        id,
        name,
        passed: true,
        durationMs: Math.max(0.01, performance.now() - start),
        details,
      });
    } catch (err) {
      results.push({
        id,
        name,
        passed: false,
        durationMs: Math.max(0.01, performance.now() - start),
        details: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // 1. Min-Heap Priority Ordering
  runTest('heap', 'Binary Min-Heap Ordering (1,000 random keys)', () => {
    const rng = new Xorshift32(4242);
    const heap = new MinHeap<number>();
    const count = 1000;
    for (let i = 0; i < count; i++) {
      const val = rng.range(-5000, 5000);
      heap.push(val, val);
    }
    let prev = -Infinity;
    let popped = 0;
    while (!heap.isEmpty()) {
      const next = heap.pop()!;
      if (next < prev) {
        throw new Error(`Heap order violated: ${next} came after ${prev}`);
      }
      prev = next;
      popped++;
    }
    if (popped !== count) throw new Error(`Expected ${count} popped items, got ${popped}`);
    return `Popped ${popped} items in strict non-decreasing order.`;
  });

  // 2. DynamicArray & RingBuffer invariants
  runTest('ds', 'DynamicArray Growth & RingBuffer Wrap-Around', () => {
    const arr = new DynamicArray<number>(2);
    for (let i = 0; i < 65; i++) arr.push(i * 3);
    if (arr.length !== 65 || arr.capacity < 65 || arr.get(64) !== 192) {
      throw new Error('DynamicArray capacity growth or indexing failed');
    }
    arr.removeAt(0);
    const remainingLen: number = arr.length;
    if (arr.get(0) !== 3 || remainingLen !== 64) {
      throw new Error('DynamicArray removeAt shift failed');
    }

    const rb = new RingBuffer<number>(4);
    for (let i = 1; i <= 7; i++) rb.push(i);
    const out = rb.toArray();
    if (out.join(',') !== '4,5,6,7') {
      throw new Error(`RingBuffer wrap mismatch: got [${out.join(',')}]`);
    }
    return `DynamicArray grew 2 -> ${arr.capacity}; RingBuffer retained [4,5,6,7].`;
  });

  // 3. Deterministic Xorshift32 PRNG
  runTest('rng', 'Xorshift32 Seed Determinism (500 rolls)', () => {
    const a = new Xorshift32(12345);
    const b = new Xorshift32(12345);
    const c = new Xorshift32(54321);
    let differsFromOtherSeed = false;
    for (let i = 0; i < 500; i++) {
      const va = a.nextUint32();
      const vb = b.nextUint32();
      const vc = c.nextUint32();
      if (va !== vb) throw new Error(`Divergence at roll ${i}: ${va} !== ${vb}`);
      if (va !== vc) differsFromOtherSeed = true;
    }
    if (!differsFromOtherSeed) throw new Error('Different seeds produced identical stream');
    return `500/500 consecutive rolls matched identically for seed 12345.`;
  });

  // 4. A* Shortest Path & Blocked No-Path Handling
  runTest('astar', 'A* Shortest Path & Unreachable Obstacle Handling', () => {
    const w = 10;
    const h = 5;
    const tiles = new Uint8Array(w * h).fill(TileType.FLOOR);
    // Vertical wall at x = 4 with a single gap at y = 4
    for (let y = 0; y < 4; y++) tiles[y * w + 4] = TileType.WALL;
    const map: DungeonMap = {
      width: w,
      height: h,
      tiles,
      visible: new Uint8Array(w * h),
      explored: new Uint8Array(w * h),
      rooms: [],
      stairsX: 9,
      stairsY: 0,
    };

    const path = findPathAStar(map, 0, 0, 9, 0, undefined, false);
    if (path.length === 0) throw new Error('A* failed to find open corridor path');
    const last = path[path.length - 1];
    if (last.x !== 9 || last.y !== 0) throw new Error('A* path did not terminate at goal');
    // Cardinal shortest distance around wall: down 4 (to y=4), right 9 (to x=9), up 4 (to y=0) = 17 steps
    if (path.length !== 17) throw new Error(`Expected optimal 17 steps, got ${path.length}`);

    // Close the gap at y = 4 -> verify no-path returns empty cleanly
    tiles[4 * w + 4] = TileType.WALL;
    const blockedPath = findPathAStar(map, 0, 0, 9, 0, undefined, false);
    if (blockedPath.length !== 0) {
      throw new Error(`Expected [] for sealed map, got length ${blockedPath.length}`);
    }
    return `Optimal 17-step detour verified; sealed map returned [] cleanly.`;
  });

  // 5. 1,000-Seed Procedural Dungeon Connectivity Verification
  runTest('dungeon_1000', 'Dungeon Generator Flood-Fill Connectivity (1,000 Seeds)', () => {
    let totalRooms = 0;
    let maxAttempts = 0;
    for (let s = 1; s <= 1000; s++) {
      const rng = new Xorshift32(s * 7919);
      const floor = ((s - 1) % MAX_FLOORS) + 1;
      const gen = generateDungeonFloor(rng, floor, 1);
      const check = verifyMapConnectivityBFS(gen.map);
      if (!check.connected) {
        throw new Error(
          `Seed ${s * 7919} (Floor ${floor}) disconnected: ${check.reachedWalkable}/${check.totalWalkable}`
        );
      }
      totalRooms += gen.map.rooms.length;
      maxAttempts = Math.max(maxAttempts, gen.generationAttempts);
    }
    const avgRooms = (totalRooms / 1000).toFixed(1);
    return `1,000/1,000 maps 100% BFS-connected (avg ${avgRooms} rooms, max regen attempts: ${maxAttempts}).`;
  });

  // 6. Combat Damage Bounds & Crit Rate
  runTest('combat', 'Combat Damage Bounds & Critical Hit Distribution', () => {
    const rng = new Xorshift32(999);
    let minDmg = Infinity;
    let maxDmg = 0;
    let crits = 0;
    for (let i = 0; i < 500; i++) {
      const { damage, critical } = rollCombatDamage(rng, 10, 4, true);
      if (damage < 1) throw new Error(`Damage below 1 floor: ${damage}`);
      minDmg = Math.min(minDmg, damage);
      maxDmg = Math.max(maxDmg, damage);
      if (critical) crits++;
    }
    if (crits === 0 || crits > 150) {
      throw new Error(`Unexpected crit count in 500 rolls: ${crits}`);
    }
    return `500 rolls within valid bounds [${minDmg}..${maxDmg}] with ${crits} crits (${((crits / 500) * 100).toFixed(1)}%).`;
  });

  // 7. Binary Save/Load Round-Trip Equality + Corruption Fuzzing
  runTest('binary_save', 'Binary Save Round-Trip & 4-Vector Corruption Rejection', () => {
    const original = createNewGame(77777);
    moveOrAttack(original, 1, 0);
    original.player.gold = 245;
    original.player.hp = 27;

    const encoded = encodeGameStateBinary(original);
    const decoded = decodeGameStateBinary(encoded);
    if (!decoded.ok || !decoded.state) {
      throw new Error(`Valid save failed decode: ${decoded.error}`);
    }
    const restored = decoded.state;
    if (
      restored.seed !== original.seed ||
      restored.rngState !== original.rngState ||
      restored.turn !== original.turn ||
      restored.player.gold !== 245 ||
      restored.player.hp !== 27 ||
      restored.enemies.length !== original.enemies.length
    ) {
      throw new Error('Restored state mismatched original state fields');
    }

    // Verify all 4 corruption mutations are safely rejected
    const badMagic = decodeGameStateBinary(fuzzCorruptMagic(encoded));
    const badVer = decodeGameStateBinary(fuzzCorruptVersion(encoded));
    const badBit = decodeGameStateBinary(fuzzFlipPayloadBit(encoded));
    const badTrunc = decodeGameStateBinary(fuzzTruncatePayload(encoded));
    if (badMagic.ok || badVer.ok || badBit.ok || badTrunc.ok) {
      throw new Error('A corrupted binary save unexpectedly passed validation!');
    }

    return `Round-trip exact (${encoded.length} bytes, CRC32 ok); 4/4 corrupt saves safely rejected.`;
  });

  return results;
}

/**
 * Autonomous Tactical Bot for Headless Balance Simulation.
 * Plays full Sable runs from Floor 1 using BFS exploration, item usage, gear upgrades, Surge, and combat.
 */
export interface BotRunSummary {
  seed: number;
  victory: boolean;
  floorReached: number;
  kills: number;
  turns: number;
  gold: number;
  level: number;
  score: number;
  causeOfDeath: string;
}

export interface BotBatchStats {
  totalRuns: number;
  wins: number;
  winRate: number;
  avgFloor: number;
  avgKills: number;
  avgTurns: number;
  avgScore: number;
  maxFloorReached: number;
  crashes: number;
  floorHistogram: number[]; // Index 1..8
  topCausesOfDeath: Array<{ cause: string; count: number }>;
  recentRuns: BotRunSummary[];
}

function chooseBotStep(state: GameState): void {
  const p = state.player;

  // 1. Heal immediately if below 48% HP and carrying a Capacitor Potion
  if (p.hp <= p.maxHp * 0.48) {
    const potIdx = p.inventory.findIndex((i) => i.type === ItemType.CAPACITOR_POTION);
    if (potIdx !== -1) {
      useInventoryItem(state, potIdx);
      return;
    }
  }

  // 2. Equip strictly better weapon or armor in inventory
  for (let i = 0; i < p.inventory.length; i++) {
    const it = p.inventory[i];
    const tmpl = ITEM_CATALOG[it.type];
    if (tmpl.category === ItemCategory.WEAPON && it.value > (p.equippedWeapon?.value ?? 0)) {
      equipInventoryItem(state, i);
      return;
    }
    if (tmpl.category === ItemCategory.ARMOR && it.value > (p.equippedArmor?.value ?? 0)) {
      equipInventoryItem(state, i);
      return;
    }
  }

  // 3. Use Oscilloscope or Multimeter right away if carried
  const utilIdx = p.inventory.findIndex(
    (i) => i.type === ItemType.OSCILLOSCOPE || i.type === ItemType.MULTIMETER
  );
  if (utilIdx !== -1) {
    useInventoryItem(state, utilIdx);
    return;
  }

  // 4. Recharge energy with Battery if low
  if (p.energy <= 2) {
    const batIdx = p.inventory.findIndex((i) => i.type === ItemType.BATTERY);
    if (batIdx !== -1) {
      useInventoryItem(state, batIdx);
      return;
    }
  }

  // 5. Pick up useful item underfoot
  const underfoot = state.groundItems.find((it) => it.x === p.x && it.y === p.y);
  if (underfoot && p.inventory.length < 12) {
    pickupItem(state);
    return;
  }

  // 6. Count visible enemies
  const visibleEnemies = state.enemies.filter(
    (e) => e.alive && state.map.visible[tileIndex(state.map, e.x, e.y)] === 1
  );

  // Use Scroll of Short Circuit when 3+ enemies visible or facing boss
  if (visibleEnemies.length >= 3 || visibleEnemies.some((e) => e.maxHp >= 45)) {
    const scrollIdx = p.inventory.findIndex((i) => i.type === ItemType.SCROLL_SHORT_CIRCUIT);
    if (scrollIdx !== -1) {
      useInventoryItem(state, scrollIdx);
      return;
    }
  }

  // 7. Check for aligned Surge shot on visible enemy within range 5
  if (p.energy >= SURGE_ENERGY_COST && visibleEnemies.length > 0) {
    for (const enemy of visibleEnemies) {
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist >= 2 && dist <= 5 && (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))) {
        const res = fireSurge(state, Math.sign(dx), Math.sign(dy));
        if (res.turnConsumed) return;
      }
    }
  }

  // 8. Attack adjacent enemy
  const adjacent = state.enemies.find(
    (e) => e.alive && Math.max(Math.abs(e.x - p.x), Math.abs(e.y - p.y)) <= 1
  );
  if (adjacent) {
    moveOrAttack(state, Math.sign(adjacent.x - p.x), Math.sign(adjacent.y - p.y));
    return;
  }

  // 9. Descend stairs if standing on them (unless Floor 8 where boss must be killed)
  if (
    state.floor < MAX_FLOORS &&
    state.map.tiles[tileIndex(state.map, p.x, p.y)] === TileType.STAIRS_DOWN
  ) {
    // Only descend if reasonably healthy or no visible immediate upgrades
    if (p.hp >= p.maxHp * 0.45 || visibleEnemies.length === 0) {
      descendStairs(state);
      return;
    }
  }

  // 10. Chase nearest visible enemy if decently armed, else navigate toward items or stairs via A*
  let goalX = state.map.stairsX;
  let goalY = state.map.stairsY;

  if (visibleEnemies.length > 0 && (state.floor === MAX_FLOORS || getPlayerAttack(state) >= 6)) {
    visibleEnemies.sort(
      (a, b) =>
        Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y))
    );
    goalX = visibleEnemies[0].x;
    goalY = visibleEnemies[0].y;
  } else {
    // Seek nearby visible item
    const visibleItem = state.groundItems.find(
      (it) =>
        state.map.visible[tileIndex(state.map, it.x, it.y)] === 1 &&
        (it.type === ItemType.CAPACITOR_POTION ||
          it.type === ItemType.FUSE ||
          it.type === ItemType.WIRE_CUTTERS ||
          it.type === ItemType.HEAT_SINK_HELM ||
          it.type === ItemType.SOLDERING_IRON ||
          it.type === ItemType.RESISTOR_SHIELD)
    );
    if (visibleItem) {
      goalX = visibleItem.x;
      goalY = visibleItem.y;
    } else if (state.floor === MAX_FLOORS) {
      // On Floor 8, head directly toward Kernel Panic
      const boss = state.enemies.find((e) => e.alive);
      if (boss) {
        goalX = boss.x;
        goalY = boss.y;
      }
    }
  }

  const path = findPathAStar(state.map, p.x, p.y, goalX, goalY, undefined, true, 700);
  if (path.length > 0) {
    const step = path[0];
    const res = moveOrAttack(state, step.x - p.x, step.y - p.y);
    if (res.turnConsumed) return;
  }

  // Fallback BFS step toward stairs
  const distMap = computeBFSDistanceMap(state.map, state.map.stairsX, state.map.stairsY, 60);
  let bestDx = 0;
  let bestDy = 0;
  let bestDist = Infinity;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = p.x + dx;
    const ny = p.y + dy;
    if (!isWalkable(state.map, nx, ny)) continue;
    const d = distMap[tileIndex(state.map, nx, ny)];
    if (d !== -1 && d < bestDist) {
      bestDist = d;
      bestDx = dx;
      bestDy = dy;
    }
  }

  if (bestDx !== 0 || bestDy !== 0) {
    moveOrAttack(state, bestDx, bestDy);
  } else {
    waitTurn(state);
  }
}

export function runSingleBotGame(seed: number, maxTurns = 700): BotRunSummary {
  const state = createNewGame(seed);
  while (state.phase === GamePhase.PLAYING && state.turn < maxTurns) {
    chooseBotStep(state);
  }
  const score = computeScoreBreakdown(state).total;
  return {
    seed,
    victory: state.phase === GamePhase.VICTORY,
    floorReached: state.stats.deepestFloor,
    kills: state.stats.kills,
    turns: state.turn,
    gold: state.player.gold,
    level: state.player.level,
    score,
    causeOfDeath:
      state.phase === GamePhase.VICTORY
        ? 'Victory (Escaped Floor 8)'
        : state.stats.causeOfDeath || 'Turn limit reached',
  };
}

export function aggregateBotRuns(runs: BotRunSummary[], crashes: number): BotBatchStats {
  const totalRuns = runs.length;
  const histogram = new Array<number>(MAX_FLOORS + 1).fill(0);
  const causeCounts = new Map<string, number>();

  let wins = 0;
  let sumFloor = 0;
  let sumKills = 0;
  let sumTurns = 0;
  let sumScore = 0;
  let maxFloorReached = 0;

  for (const r of runs) {
    if (r.victory) wins++;
    sumFloor += r.floorReached;
    sumKills += r.kills;
    sumTurns += r.turns;
    sumScore += r.score;
    maxFloorReached = Math.max(maxFloorReached, r.floorReached);
    histogram[Math.min(MAX_FLOORS, Math.max(1, r.floorReached))]++;
    if (!r.victory) {
      const normalized = r.causeOfDeath.replace(/ on Floor \d+/, '');
      causeCounts.set(normalized, (causeCounts.get(normalized) ?? 0) + 1);
    }
  }

  const topCausesOfDeath = Array.from(causeCounts.entries())
    .map(([cause, count]) => ({ cause, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    totalRuns,
    wins,
    winRate: totalRuns > 0 ? (wins / totalRuns) * 100 : 0,
    avgFloor: totalRuns > 0 ? sumFloor / totalRuns : 0,
    avgKills: totalRuns > 0 ? sumKills / totalRuns : 0,
    avgTurns: totalRuns > 0 ? sumTurns / totalRuns : 0,
    avgScore: totalRuns > 0 ? sumScore / totalRuns : 0,
    maxFloorReached,
    crashes,
    floorHistogram: histogram,
    topCausesOfDeath,
    recentRuns: runs.slice(-12).reverse(),
  };
}

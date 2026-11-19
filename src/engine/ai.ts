import { damagePlayer, getPlayerDefense, pushLog, rollCombatDamage } from './combat';
import { createEnemy } from './dungeon';
import { hasLineOfSight, inBounds, isWalkable } from './fov';
import { findBestFleeStepBFS, findPathAStar } from './pathfinding';
import { Xorshift32 } from './rng';
import {
  AIState,
  ENEMY_CATALOG,
  EnemyEntity,
  EnemyType,
  GameEvent,
  GamePhase,
  GameState,
  LogSeverity,
} from './types';

/**
 * Enemy AI Finite State Machine (IDLE, WANDER, CHASE, FLEE, ATTACK).
 * Each enemy archetype configures distinct movement, kiting, teleport, speed, and boss-phase behaviors.
 */

const NEIGHBOR_OFFSETS: ReadonlyArray<[number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

function chebyshevDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

function isTileOccupiedByEnemy(state: GameState, x: number, y: number, ignoreId: number): boolean {
  for (const e of state.enemies) {
    if (e.alive && e.id !== ignoreId && e.x === x && e.y === y) {
      return true;
    }
  }
  return false;
}

function tryRandomWanderStep(state: GameState, enemy: EnemyEntity, rng: Xorshift32): boolean {
  const candidates = NEIGHBOR_OFFSETS.filter(([dx, dy]) => {
    const nx = enemy.x + dx;
    const ny = enemy.y + dy;
    if (!isWalkable(state.map, nx, ny)) return false;
    if (nx === state.player.x && ny === state.player.y) return false;
    if (isTileOccupiedByEnemy(state, nx, ny, enemy.id)) return false;
    return true;
  });

  if (candidates.length === 0) return false;
  const [dx, dy] = rng.pick(candidates);
  enemy.x += dx;
  enemy.y += dy;
  enemy.debugPath = [{ x: enemy.x, y: enemy.y }];
  return true;
}

function enemyAttackPlayer(
  state: GameState,
  enemy: EnemyEntity,
  rng: Xorshift32,
  events: GameEvent[],
  bonusAtk = 0
): void {
  const tmpl = ENEMY_CATALOG[enemy.type];
  const { damage, critical } = rollCombatDamage(
    rng,
    enemy.atk + bonusAtk,
    getPlayerDefense(state),
    true
  );

  pushLog(
    state,
    LogSeverity.DANGER,
    critical
      ? `${tmpl.name} lands a CRITICAL strike for ${damage} dmg!`
      : `${tmpl.name} hits you for ${damage} dmg.`
  );
  damagePlayer(state, damage, tmpl.name, events);
}

/**
 * Attempt short-range teleport (3 to 5 tiles away from current tile, keeping sight of player).
 */
function attemptRogueRelayTeleport(
  state: GameState,
  enemy: EnemyEntity,
  rng: Xorshift32,
  events: GameEvent[]
): boolean {
  const spots: Array<{ x: number; y: number }> = [];
  for (let dy = -5; dy <= 5; dy++) {
    for (let dx = -5; dx <= 5; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist < 3 || dist > 6) continue;
      const nx = enemy.x + dx;
      const ny = enemy.y + dy;
      if (!inBounds(state.map, nx, ny) || !isWalkable(state.map, nx, ny)) continue;
      if (nx === state.player.x && ny === state.player.y) continue;
      if (isTileOccupiedByEnemy(state, nx, ny, enemy.id)) continue;
      const pDist = chebyshevDist(nx, ny, state.player.x, state.player.y);
      if (pDist >= 2 && pDist <= 5) {
        spots.push({ x: nx, y: ny });
      }
    }
  }
  if (spots.length === 0) return false;
  const dest = rng.pick(spots);
  enemy.x = dest.x;
  enemy.y = dest.y;
  enemy.teleportCooldown = 4;
  enemy.debugPath = [{ x: dest.x, y: dest.y }];
  events.push({ type: 'TELEPORT', x: dest.x, y: dest.y });
  pushLog(state, LogSeverity.INFO, `Rogue Relay phase-blinks across the bus!`);
  return true;
}

/**
 * Handle The Kernel Panic's multi-phase transitions at 66% HP (Phase 2) and 33% HP (Phase 3).
 */
function checkKernelPanicPhases(
  state: GameState,
  boss: EnemyEntity,
  rng: Xorshift32,
  events: GameEvent[]
): void {
  const hpRatio = boss.hp / boss.maxHp;

  if (boss.bossPhase === 1 && hpRatio <= 0.66) {
    boss.bossPhase = 2;
    boss.atk += 2;
    events.push({ type: 'BOSS_PHASE', x: boss.x, y: boss.y });
    pushLog(
      state,
      LogSeverity.BOSS,
      `PHASE 2 — The Kernel Panic spawns corrupted Glitches and boosts clock speed!`
    );

    // Spawn 2 Glitches nearby
    let spawned = 0;
    for (const [dx, dy] of NEIGHBOR_OFFSETS) {
      if (spawned >= 2) break;
      const nx = boss.x + dx * 2;
      const ny = boss.y + dy * 2;
      if (
        inBounds(state.map, nx, ny) &&
        isWalkable(state.map, nx, ny) &&
        !(nx === state.player.x && ny === state.player.y) &&
        !isTileOccupiedByEnemy(state, nx, ny, boss.id)
      ) {
        state.enemies.push(createEnemy(state.nextEntityId++, EnemyType.GLITCH, nx, ny, state.floor));
        spawned++;
      }
    }
  } else if (boss.bossPhase <= 2 && hpRatio <= 0.33) {
    boss.bossPhase = 3;
    boss.atk += 3;
    events.push({ type: 'BOSS_PHASE', x: boss.x, y: boss.y });
    pushLog(
      state,
      LogSeverity.BOSS,
      `PHASE 3 — OVERCLOCK! The Kernel Panic surges with lethal arc discharges!`
    );

    // Immediate arc pulse if player is within distance 3
    if (chebyshevDist(boss.x, boss.y, state.player.x, state.player.y) <= 3) {
      const pulseDmg = 8;
      pushLog(state, LogSeverity.DANGER, `Kernel Panic emits a core arc pulse for ${pulseDmg} dmg!`);
      damagePlayer(state, pulseDmg, 'The Kernel Panic pulse', events);
    }
  }
}

/**
 * Execute a single AI action step for an enemy using our 5-state machine with A-star and BFS.
 */
function actSingleEnemyStep(
  state: GameState,
  enemy: EnemyEntity,
  rng: Xorshift32,
  events: GameEvent[]
): void {
  if (!enemy.alive || state.phase !== GamePhase.PLAYING) return;

  const tmpl = ENEMY_CATALOG[enemy.type];
  const distToPlayer = chebyshevDist(enemy.x, enemy.y, state.player.x, state.player.y);
  const canSeePlayer = hasLineOfSight(
    state.map,
    enemy.x,
    enemy.y,
    state.player.x,
    state.player.y,
    tmpl.sightRange
  );

  if (canSeePlayer) {
    enemy.lastKnownPlayerX = state.player.x;
    enemy.lastKnownPlayerY = state.player.y;
  }

  // Boss phase checks
  if (enemy.type === EnemyType.KERNEL_PANIC) {
    checkKernelPanicPhases(state, enemy, rng, events);
    if (state.phase !== GamePhase.PLAYING) return;
  }

  // Determine next AI state
  if (distToPlayer <= 1) {
    enemy.aiState = AIState.ATTACK;
  } else if (enemy.type === EnemyType.ROGUE_RELAY && canSeePlayer) {
    // Rogue Relay prefers distance (2-4 tiles), flees when close or fires arc bolt from range
    if (distToPlayer <= 2) {
      enemy.aiState = AIState.FLEE;
    } else if (distToPlayer <= 4) {
      enemy.aiState = AIState.ATTACK;
    } else {
      enemy.aiState = AIState.CHASE;
    }
  } else if (canSeePlayer) {
    enemy.aiState = AIState.CHASE;
  } else if (enemy.lastKnownPlayerX !== -1 && enemy.lastKnownPlayerY !== -1) {
    // Continue pursuing last known player position briefly
    if (enemy.x === enemy.lastKnownPlayerX && enemy.y === enemy.lastKnownPlayerY) {
      enemy.lastKnownPlayerX = -1;
      enemy.lastKnownPlayerY = -1;
      enemy.aiState = AIState.WANDER;
    } else {
      enemy.aiState = AIState.CHASE;
    }
  } else {
    enemy.aiState = rng.chance(0.45) ? AIState.WANDER : AIState.IDLE;
  }

  // Glitch specialty: 30% erratic random movement even when chasing
  if (enemy.type === EnemyType.GLITCH && enemy.aiState === AIState.CHASE && rng.chance(0.3)) {
    enemy.aiState = AIState.WANDER;
    tryRandomWanderStep(state, enemy, rng);
    return;
  }

  // Execute behavior for resolved state
  switch (enemy.aiState) {
    case AIState.IDLE:
      enemy.debugPath = [];
      break;

    case AIState.WANDER:
      tryRandomWanderStep(state, enemy, rng);
      break;

    case AIState.FLEE: {
      // Rogue Relay: teleport if off cooldown, else kite away via BFS distance map
      if (enemy.type === EnemyType.ROGUE_RELAY && enemy.teleportCooldown <= 0 && rng.chance(0.6)) {
        if (attemptRogueRelayTeleport(state, enemy, rng, events)) {
          return;
        }
      }
      const fleeStep = findBestFleeStepBFS(
        state.map,
        enemy.x,
        enemy.y,
        state.player.x,
        state.player.y,
        (x, y) => isTileOccupiedByEnemy(state, x, y, enemy.id) || (x === state.player.x && y === state.player.y)
      );
      if (fleeStep) {
        enemy.x = fleeStep.x;
        enemy.y = fleeStep.y;
        enemy.debugPath = [fleeStep];
      } else if (distToPlayer <= 1) {
        enemyAttackPlayer(state, enemy, rng, events);
      }
      break;
    }

    case AIState.ATTACK: {
      if (enemy.type === EnemyType.ROGUE_RELAY && distToPlayer > 1) {
        // Ranged relay zap when maintaining distance
        const zapDmg = Math.max(2, enemy.atk - 1 - Math.floor(getPlayerDefense(state) * 0.5) + rng.range(0, 1));
        pushLog(state, LogSeverity.DANGER, `Rogue Relay fires a remote arc bolt for ${zapDmg} dmg!`);
        damagePlayer(state, zapDmg, 'Rogue Relay', events);
        if (enemy.teleportCooldown <= 0 && rng.chance(0.35)) {
          attemptRogueRelayTeleport(state, enemy, rng, events);
        }
        return;
      }
      enemy.debugPath = [{ x: state.player.x, y: state.player.y }];
      enemyAttackPlayer(state, enemy, rng, events);
      break;
    }

    case AIState.CHASE: {
      const targetX = canSeePlayer ? state.player.x : enemy.lastKnownPlayerX;
      const targetY = canSeePlayer ? state.player.y : enemy.lastKnownPlayerY;

      const path = findPathAStar(
        state.map,
        enemy.x,
        enemy.y,
        targetX,
        targetY,
        (x, y) => isTileOccupiedByEnemy(state, x, y, enemy.id),
        true,
        500
      );

      enemy.debugPath = path;

      if (path.length > 0) {
        const nextStep = path[0];
        if (nextStep.x === state.player.x && nextStep.y === state.player.y) {
          enemy.aiState = AIState.ATTACK;
          enemyAttackPlayer(state, enemy, rng, events);
        } else if (!isTileOccupiedByEnemy(state, nextStep.x, nextStep.y, enemy.id)) {
          enemy.x = nextStep.x;
          enemy.y = nextStep.y;
        }
      } else {
        tryRandomWanderStep(state, enemy, rng);
      }
      break;
    }
  }
}

/**
 * Process the full enemy turn across all living entities on the active floor.
 */
export function processEnemyTurns(state: GameState, rng: Xorshift32, events: GameEvent[]): void {
  // Snapshot array so mid-turn summons (Kernel Panic Phase 2) don't act on their spawn turn
  const activeEnemies = state.enemies.filter((e) => e.alive);

  for (const enemy of activeEnemies) {
    if (!enemy.alive || state.phase !== GamePhase.PLAYING) continue;

    enemy.turnParity = (enemy.turnParity + 1) % 2;
    if (enemy.teleportCooldown > 0) {
      enemy.teleportCooldown -= 1;
    }

    // Capacitor Slime is slow: acts every other turn
    if (enemy.type === EnemyType.CAPACITOR_SLIME && enemy.turnParity === 1) {
      continue;
    }

    // Standard action
    actSingleEnemyStep(state, enemy, rng, events);

    // Short Circuit is fast: acts TWICE per turn
    if (enemy.type === EnemyType.SHORT_CIRCUIT && enemy.alive && state.phase === GamePhase.PLAYING) {
      actSingleEnemyStep(state, enemy, rng, events);
    }

    // Kernel Panic Phase 3 overclock: bonus action every other turn
    if (
      enemy.type === EnemyType.KERNEL_PANIC &&
      enemy.bossPhase === 3 &&
      enemy.turnParity === 0 &&
      enemy.alive &&
      state.phase === GamePhase.PLAYING
    ) {
      actSingleEnemyStep(state, enemy, rng, events);
    }
  }

  // Prune dead enemies to keep entity pool compact
  state.enemies = state.enemies.filter((e) => e.alive);
}

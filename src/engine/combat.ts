import { tileIndex, traceBeam } from './fov';
import { Xorshift32 } from './rng';
import {
  ENEMY_CATALOG,
  EnemyEntity,
  EnemyType,
  GameEvent,
  GamePhase,
  GameState,
  ItemType,
  LogSeverity,
  MAX_FLOORS,
  SURGE_ENERGY_COST,
  SURGE_RANGE,
  TileType,
} from './types';

/**
 * Combat, Damage Bounds, XP/Leveling, Special Abilities, and Death/Revive Logic.
 */

export const CRIT_CHANCE = 0.14;
export const CRIT_MULTIPLIER = 1.65;
export const CAPACITOR_BLAST_RADIUS = 1; // 3x3 area around dead slime

export function getPlayerAttack(state: GameState): number {
  return state.player.baseAtk + (state.player.equippedWeapon?.value ?? 0);
}

export function getPlayerDefense(state: GameState): number {
  return state.player.baseDef + (state.player.equippedArmor?.value ?? 0);
}

/**
 * Core combat damage formula:
 * Base = max(1, atk - floor(def * 0.65))
 * Variance = [-1, +2] via deterministic PRNG
 * Optional critical hit multiplier (1.65x).
 */
export function rollCombatDamage(
  rng: Xorshift32,
  atk: number,
  def: number,
  canCrit = true
): { damage: number; critical: boolean } {
  const mitigated = Math.max(1, atk - Math.floor(def * 0.65));
  const variance = rng.range(-1, 2);
  let damage = Math.max(1, mitigated + variance);
  let critical = false;

  if (canCrit && rng.chance(CRIT_CHANCE)) {
    critical = true;
    damage = Math.max(2, Math.round(damage * CRIT_MULTIPLIER));
  }

  return { damage, critical };
}

export function pushLog(state: GameState, severity: LogSeverity, text: string): void {
  state.logEntries.push({
    turn: state.turn,
    severity,
    text,
  });
  if (state.logEntries.length > 64) {
    state.logEntries.shift();
  }
}

/**
 * Award XP and process level-up stat growth (HP, Energy, ATK, DEF).
 */
export function grantExperience(state: GameState, xpAmount: number, events: GameEvent[]): void {
  const p = state.player;
  p.xp += xpAmount;

  while (p.xp >= p.nextLevelXp) {
    p.xp -= p.nextLevelXp;
    p.level += 1;
    p.nextLevelXp = Math.round(p.nextLevelXp * 1.45 + 25);
    p.maxHp += 6;
    p.hp = Math.min(p.maxHp, p.hp + 8);
    p.maxEnergy += 2;
    p.energy = Math.min(p.maxEnergy, p.energy + 4);
    p.baseAtk += 1;
    if (p.level % 2 === 0) {
      p.baseDef += 1;
    }

    events.push({ type: 'LEVEL_UP', x: p.x, y: p.y });
    pushLog(
      state,
      LogSeverity.SYSTEM,
      `Level ${p.level} reached! Max HP ${p.maxHp}, Base ATK ${p.baseAtk}, Base DEF ${p.baseDef}.`
    );
  }
}

/**
 * Apply damage to the player, triggering Fuse auto-revive if held or permadeath otherwise.
 */
export function damagePlayer(
  state: GameState,
  amount: number,
  sourceName: string,
  events: GameEvent[]
): void {
  const p = state.player;
  const dealt = Math.max(1, amount);
  p.hp = Math.max(0, p.hp - dealt);
  state.stats.damageTaken += dealt;
  events.push({ type: 'PLAYER_HIT', x: p.x, y: p.y, amount: dealt });

  if (p.hp <= 0) {
    // Check passive Fuse item in inventory for auto-revive
    const fuseIdx = p.inventory.findIndex((item) => item.type === ItemType.FUSE);
    if (fuseIdx !== -1) {
      p.inventory.splice(fuseIdx, 1);
      p.hp = Math.max(8, Math.ceil(p.maxHp * 0.5));
      p.energy = Math.min(p.maxEnergy, p.energy + 4);
      events.push({ type: 'FUSE_REVIVE', x: p.x, y: p.y });
      pushLog(
        state,
        LogSeverity.SYSTEM,
        `Your Fuse blew to absorb fatal voltage from ${sourceName}! Revived at ${p.hp}/${p.maxHp} HP.`
      );
      return;
    }

    state.phase = GamePhase.DEAD;
    state.stats.causeOfDeath = `Terminated by ${sourceName} on Floor ${state.floor}`;
    events.push({ type: 'DEATH', x: p.x, y: p.y });
    pushLog(state, LogSeverity.DANGER, `Signal lost. ${state.stats.causeOfDeath}.`);
  }
}

/**
 * Handle enemy death: award XP, trigger Capacitor Slime death blast, or unlock victory on Kernel Panic.
 */
export function handleEnemyDeath(
  state: GameState,
  enemy: EnemyEntity,
  rng: Xorshift32,
  events: GameEvent[]
): void {
  if (!enemy.alive) return;
  enemy.alive = false;
  state.stats.kills += 1;

  const tmpl = ENEMY_CATALOG[enemy.type];
  events.push({ type: 'KILL', x: enemy.x, y: enemy.y });
  pushLog(state, LogSeverity.COMBAT, `Destroyed ${tmpl.name} (+${enemy.xpValue} XP).`);
  grantExperience(state, enemy.xpValue, events);

  // Drop a small gold reward on mini-boss kill
  if (enemy.type === EnemyType.OVERLOAD_GOLEM) {
    state.player.gold += 60 + state.floor * 10;
    pushLog(state, LogSeverity.LOOT, `Salvaged ${60 + state.floor * 10} Gold from the Overload Golem core.`);
  }

  // Capacitor Slime explodes for 3x3 area damage on death
  if (enemy.type === EnemyType.CAPACITOR_SLIME) {
    const blastDamage = 7 + state.floor;
    const blastCells = [];
    for (let dy = -CAPACITOR_BLAST_RADIUS; dy <= CAPACITOR_BLAST_RADIUS; dy++) {
      for (let dx = -CAPACITOR_BLAST_RADIUS; dx <= CAPACITOR_BLAST_RADIUS; dx++) {
        blastCells.push({ x: enemy.x + dx, y: enemy.y + dy });
      }
    }
    events.push({ type: 'EXPLOSION', x: enemy.x, y: enemy.y, cells: blastCells });
    pushLog(
      state,
      LogSeverity.DANGER,
      `Capacitor Slime ruptures in an arc blast (${blastDamage} dmg radius 1)!`
    );

    const pDist = Math.max(Math.abs(state.player.x - enemy.x), Math.abs(state.player.y - enemy.y));
    if (pDist <= CAPACITOR_BLAST_RADIUS && state.phase === GamePhase.PLAYING) {
      damagePlayer(state, Math.max(2, blastDamage - Math.floor(getPlayerDefense(state) * 0.4)), 'Capacitor Slime blast', events);
    }

    for (const other of state.enemies) {
      if (!other.alive || other.id === enemy.id) continue;
      const dist = Math.max(Math.abs(other.x - enemy.x), Math.abs(other.y - enemy.y));
      if (dist <= CAPACITOR_BLAST_RADIUS) {
        other.hp -= blastDamage;
        if (other.hp <= 0) {
          handleEnemyDeath(state, other, rng, events);
        }
      }
    }
  }

  // Defeating The Kernel Panic on Floor 8 wins the game!
  if (enemy.type === EnemyType.KERNEL_PANIC && state.floor === MAX_FLOORS) {
    state.map.tiles[tileIndex(state.map, state.map.stairsX, state.map.stairsY)] = TileType.STAIRS_DOWN;
    state.phase = GamePhase.VICTORY;
    events.push({ type: 'VICTORY', x: enemy.x, y: enemy.y });
    pushLog(
      state,
      LogSeverity.BOSS,
      `The Kernel Panic collapses! Noise Floor stabilized — you escaped Floor 8!`
    );
  }
}

/**
 * Execute a player melee bump attack against a target enemy.
 */
export function playerMeleeAttack(
  state: GameState,
  enemy: EnemyEntity,
  rng: Xorshift32,
  events: GameEvent[]
): void {
  const atk = getPlayerAttack(state);
  const { damage, critical } = rollCombatDamage(rng, atk, enemy.def, true);
  enemy.hp -= damage;
  state.stats.damageDealt += damage;

  const tmpl = ENEMY_CATALOG[enemy.type];
  events.push({ type: critical ? 'CRIT' : 'HIT', x: enemy.x, y: enemy.y, amount: damage });

  pushLog(
    state,
    LogSeverity.COMBAT,
    critical
      ? `CRITICAL hit on ${tmpl.name} for ${damage} dmg!`
      : `You strike ${tmpl.name} for ${damage} dmg.`
  );

  if (enemy.hp <= 0) {
    handleEnemyDeath(state, enemy, rng, events);
  }
}

/**
 * Execute player special ability "Surge": costs energy, fires high-voltage line beam piercing enemies.
 */
export function executeSurgeAbility(
  state: GameState,
  dx: number,
  dy: number,
  rng: Xorshift32,
  events: GameEvent[]
): boolean {
  if (state.player.energy < SURGE_ENERGY_COST) {
    pushLog(
      state,
      LogSeverity.INFO,
      `Insufficient Energy for Surge (need ${SURGE_ENERGY_COST}, have ${state.player.energy}).`
    );
    return false;
  }

  const cells = traceBeam(state.map, state.player.x, state.player.y, dx, dy, SURGE_RANGE);
  if (cells.length === 0) {
    pushLog(state, LogSeverity.INFO, `Surge blocked immediately by a wall.`);
    return false;
  }

  state.player.energy -= SURGE_ENERGY_COST;
  state.stats.surgesFired += 1;
  events.push({ type: 'SURGE', x: state.player.x, y: state.player.y, cells });

  const surgeBaseAtk = Math.round(getPlayerAttack(state) * 1.65) + 4;
  let hits = 0;

  for (const cell of cells) {
    const target = state.enemies.find((e) => e.alive && e.x === cell.x && e.y === cell.y);
    if (!target) continue;
    hits++;
    const { damage, critical } = rollCombatDamage(rng, surgeBaseAtk, Math.floor(target.def * 0.5), true);
    target.hp -= damage;
    state.stats.damageDealt += damage;

    const tmpl = ENEMY_CATALOG[target.type];
    pushLog(
      state,
      LogSeverity.COMBAT,
      `Surge arcs through ${tmpl.name} for ${damage} dmg${critical ? ' (CRIT!)' : ''}!`
    );

    if (target.hp <= 0) {
      handleEnemyDeath(state, target, rng, events);
    }
  }

  if (hits === 0) {
    pushLog(state, LogSeverity.INFO, `Surge crackles across ${cells.length} tiles but hits nothing.`);
  }

  return true;
}

/**
 * Scroll of Short Circuit: damages every currently visible enemy on the floor.
 */
export function castScrollOfShortCircuit(
  state: GameState,
  rng: Xorshift32,
  events: GameEvent[]
): number {
  const baseDamage = 14 + state.floor * 2 + state.player.level;
  const hitCells = [];
  let hitCount = 0;

  for (const enemy of [...state.enemies]) {
    if (!enemy.alive) continue;
    if (state.map.visible[tileIndex(state.map, enemy.x, enemy.y)] === 0) continue;

    hitCount++;
    hitCells.push({ x: enemy.x, y: enemy.y });
    const dmg = Math.max(4, baseDamage + rng.range(-2, 3) - Math.floor(enemy.def * 0.3));
    enemy.hp -= dmg;
    state.stats.damageDealt += dmg;

    const tmpl = ENEMY_CATALOG[enemy.type];
    pushLog(state, LogSeverity.COMBAT, `Short Circuit zaps ${tmpl.name} for ${dmg} dmg!`);
    if (enemy.hp <= 0) {
      handleEnemyDeath(state, enemy, rng, events);
    }
  }

  events.push({ type: 'SCROLL', x: state.player.x, y: state.player.y, cells: hitCells });
  if (hitCount === 0) {
    pushLog(state, LogSeverity.INFO, `Scroll of Short Circuit fizzles — no enemies in sight.`);
  }
  return hitCount;
}

/**
 * Deterministic Xorshift32 PRNG.
 * Guarantees 100% reproducible dungeon generation, spawns, and combat rolls for any given seed.
 */
export class Xorshift32 {
  private state: number;

  constructor(seed: number) {
    const normalized = (seed >>> 0) || 0x9e3779b9;
    this.state = normalized;
  }

  /** Restore internal PRNG state directly (used by binary save/load). */
  setState(state: number): void {
    this.state = (state >>> 0) || 0x9e3779b9;
  }

  /** Export internal 32-bit state for deterministic persistence. */
  getState(): number {
    return this.state >>> 0;
  }

  /** Generate next unsigned 32-bit integer using Marsaglia's xorshift32 shifts (13, 17, 5). */
  nextUint32(): number {
    let x = this.state >>> 0;
    x ^= (x << 13) >>> 0;
    x ^= x >>> 17;
    x ^= (x << 5) >>> 0;
    this.state = x >>> 0;
    return this.state;
  }

  /** Return float uniformly distributed in [0, 1). */
  nextFloat(): number {
    return this.nextUint32() / 0x100000000;
  }

  /** Return integer in [min, max] inclusive. */
  range(min: number, max: number): number {
    if (max <= min) return min;
    const span = max - min + 1;
    return min + (this.nextUint32() % span);
  }

  /** Return true with probability p in [0, 1]. */
  chance(probability: number): boolean {
    return this.nextFloat() < probability;
  }

  /** Pick a random element from a non-empty array. */
  pick<T>(items: readonly T[]): T {
    return items[this.range(0, items.length - 1)];
  }
}

/** Generate a fresh non-zero 32-bit numeric seed from system entropy. */
export function generateRandomSeed(): number {
  const now = Date.now() >>> 0;
  const jitter = Math.floor(Math.random() * 0xffffffff) >>> 0;
  return ((now ^ jitter) >>> 0) || 12345;
}

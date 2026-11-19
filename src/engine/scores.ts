import { computeScoreBreakdown } from './game';
import { GamePhase, GameState } from './types';

/**
 * Top-10 Persistent High Score Store for Sable.
 */

const HIGH_SCORES_KEY = 'sable_high_scores_v1';
const MAX_HIGH_SCORES = 10;

export interface HighScoreEntry {
  id: string;
  score: number;
  floor: number;
  kills: number;
  gold: number;
  turns: number;
  level: number;
  seed: number;
  victory: boolean;
  causeOfDeath: string;
  timestamp: number;
}

export function loadHighScores(): HighScoreEntry[] {
  try {
    const raw = localStorage.getItem(HIGH_SCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e) => typeof e?.score === 'number')
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_HIGH_SCORES);
  } catch {
    return [];
  }
}

export function recordHighScore(state: GameState): {
  entry: HighScoreEntry;
  rank: number | null;
  allScores: HighScoreEntry[];
} {
  const breakdown = computeScoreBreakdown(state);
  const entry: HighScoreEntry = {
    id: `${Date.now()}-${state.seed}`,
    score: breakdown.total,
    floor: state.stats.deepestFloor,
    kills: state.stats.kills,
    gold: state.player.gold,
    turns: state.turn,
    level: state.player.level,
    seed: state.seed,
    victory: state.phase === GamePhase.VICTORY,
    causeOfDeath:
      state.phase === GamePhase.VICTORY
        ? 'Defeated The Kernel Panic'
        : state.stats.causeOfDeath || `Fallen on Floor ${state.floor}`,
    timestamp: Date.now(),
  };

  const existing = loadHighScores();
  const merged = [...existing, entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_HIGH_SCORES);

  try {
    localStorage.setItem(HIGH_SCORES_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage errors
  }

  const idx = merged.findIndex((s) => s.id === entry.id);
  return {
    entry,
    rank: idx === -1 ? null : idx + 1,
    allScores: merged,
  };
}

export function clearHighScores(): void {
  try {
    localStorage.removeItem(HIGH_SCORES_KEY);
  } catch {
    // Ignore
  }
}

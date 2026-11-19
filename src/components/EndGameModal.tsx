import React from 'react';
import { computeScoreBreakdown } from '../engine/game';
import { GamePhase, GameState, MAX_FLOORS } from '../engine/types';

interface EndGameModalProps {
  state: GameState;
  rank: number | null;
  onPlayAgain: () => void;
  onRetrySameSeed: () => void;
  onReturnToTitle: () => void;
}

export const EndGameModal: React.FC<EndGameModalProps> = ({
  state,
  rank,
  onPlayAgain,
  onRetrySameSeed,
  onReturnToTitle,
}) => {
  const isVictory = state.phase === GamePhase.VICTORY;
  const breakdown = computeScoreBreakdown(state);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isVictory ? 'Victory' : 'Run Terminated'}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div className="w-full max-w-lg border border-[#232B3A] bg-[#121721] rounded-lg overflow-hidden">
        <div className="px-6 py-5 border-b border-[#232B3A]">
          <p
            className={`font-mono text-xs ${
              isVictory ? 'text-[#34D399]' : 'text-[#F87171]'
            }`}
          >
            {isVictory ? 'Noise Floor Stabilized' : 'Permadeath · Binary Save Purged'}
          </p>
          <h2 className="text-2xl font-bold text-[#E6EDF3] font-display mt-1">
            {isVictory ? 'You Escaped the Noise Floor' : 'Signal Lost'}
          </h2>
          <p className="text-sm text-[#A3B0C2] mt-1.5">
            {isVictory
              ? `The Kernel Panic has been terminated on Floor ${MAX_FLOORS}.`
              : state.stats.causeOfDeath || `Terminated on Floor ${state.floor}.`}
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Score summary */}
          <div className="p-4 rounded-md bg-[#0B0E14] border border-[#232B3A] flex items-baseline justify-between">
            <div>
              <div className="text-xs text-[#768399]">Final Run Score</div>
              <div className="font-mono text-3xl font-bold text-[#F59E0B] mt-0.5">
                {breakdown.total}
              </div>
            </div>
            <div className="text-right font-mono text-xs text-[#A3B0C2]">
              {rank !== null ? `Leaderboard Rank #${rank}` : 'Recorded'}
              <div className="text-[#768399] mt-0.5">Seed {state.seed}</div>
            </div>
          </div>

          {/* Score formula breakdown */}
          <dl className="space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <dt className="text-[#768399]">Deepest Floor (F{state.stats.deepestFloor} × 1000)</dt>
              <dd className="text-[#E6EDF3]">+{breakdown.floorPoints}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#768399]">Anomalies Destroyed ({state.stats.kills} × 75)</dt>
              <dd className="text-[#E6EDF3]">+{breakdown.killPoints}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#768399]">Gold Collected ({state.player.gold} × 5)</dt>
              <dd className="text-[#E6EDF3]">+{breakdown.goldPoints}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-[#768399]">Efficiency Bonus ({state.turn} turns)</dt>
              <dd className="text-[#E6EDF3]">+{breakdown.speedBonus}</dd>
            </div>
            {breakdown.victoryBonus > 0 && (
              <div className="flex justify-between text-[#34D399]">
                <dt>Kernel Panic Victory Bonus</dt>
                <dd>+{breakdown.victoryBonus}</dd>
              </div>
            )}
          </dl>

          {/* Actions */}
          <div className="pt-3 border-t border-[#232B3A] flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={onPlayAgain}
              className="flex-1 px-4 py-2.5 rounded-md bg-[#38BDF8] text-[#07090D] text-xs font-semibold hover:bg-[#7DD3FC] whitespace-nowrap"
            >
              Play Again
            </button>
            <button
              type="button"
              onClick={onRetrySameSeed}
              className="px-4 py-2.5 rounded-md bg-[#171E2B] border border-[#232B3A] text-xs font-medium text-[#E6EDF3] hover:bg-[#1E293B] whitespace-nowrap"
            >
              Retry Seed {state.seed}
            </button>
            <button
              type="button"
              onClick={onReturnToTitle}
              className="px-4 py-2.5 rounded-md bg-[#0B0E14] border border-[#232B3A] text-xs font-medium text-[#A3B0C2] hover:text-[#E6EDF3] whitespace-nowrap"
            >
              Title
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface QuitConfirmModalProps {
  onSaveAndQuit: () => void;
  onQuitWithoutSaving: () => void;
  onCancel: () => void;
}

export const QuitConfirmModal: React.FC<QuitConfirmModalProps> = ({
  onSaveAndQuit,
  onQuitWithoutSaving,
  onCancel,
}) => {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm Quit"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md border border-[#232B3A] bg-[#121721] rounded-lg p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-semibold text-[#E6EDF3]">Leave Active Run?</h2>
          <p className="text-sm text-[#A3B0C2] mt-1">
            Save your current state to binary storage before returning to the title screen, or exit without saving.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3.5 py-2 rounded-md bg-[#0B0E14] border border-[#232B3A] text-xs font-medium text-[#A3B0C2] hover:text-[#E6EDF3] whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onQuitWithoutSaving}
            className="px-3.5 py-2 rounded-md bg-[#2A171C] border border-[#7F1D1D]/70 text-xs font-medium text-[#FCA5A5] hover:bg-[#3A1E25] whitespace-nowrap"
          >
            Quit Without Saving
          </button>
          <button
            type="button"
            onClick={onSaveAndQuit}
            className="px-4 py-2 rounded-md bg-[#38BDF8] text-[#07090D] text-xs font-semibold hover:bg-[#7DD3FC] whitespace-nowrap"
          >
            Save &amp; Quit
          </button>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { HighScoreEntry } from '../engine/scores';

interface HighScoresModalProps {
  scores: HighScoreEntry[];
  onClear: () => void;
  onPlaySeed: (seed: number) => void;
  onClose: () => void;
}

export const HighScoresModal: React.FC<HighScoresModalProps> = ({
  scores,
  onClear,
  onPlaySeed,
  onClose,
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="High Scores"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] flex flex-col border border-[#232B3A] bg-[#121721] rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#232B3A]">
          <div>
            <h2 className="text-lg font-semibold text-[#E6EDF3]">Top 10 High Scores</h2>
            <p className="text-xs font-mono text-[#768399] mt-0.5">
              Score = (Floor × 1000) + (Kills × 75) + (Gold × 5) + max(0, 1500 − Turns) + 3000 Victory Bonus
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close high scores"
            className="p-1.5 rounded-md text-[#768399] hover:text-[#E6EDF3] hover:bg-[#171E2B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {scores.length === 0 ? (
            <div className="p-10 text-center border border-[#232B3A] rounded-md bg-[#0B0E14] text-sm text-[#768399]">
              No completed runs recorded yet. Descend into the Noise Floor to claim the top spot.
            </div>
          ) : (
            <div className="border border-[#232B3A] rounded-md overflow-hidden bg-[#0B0E14]">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="text-[#768399] border-b border-[#232B3A]">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">#</th>
                      <th className="px-4 py-2.5 font-medium">Score</th>
                      <th className="px-4 py-2.5 font-medium">Floor</th>
                      <th className="px-4 py-2.5 font-medium">Kills</th>
                      <th className="px-4 py-2.5 font-medium">Gold</th>
                      <th className="px-4 py-2.5 font-medium">Turns</th>
                      <th className="px-4 py-2.5 font-medium">Seed</th>
                      <th className="px-4 py-2.5 font-medium">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232B3A]/60">
                    {scores.map((entry, idx) => (
                      <tr key={entry.id} className="hover:bg-[#121721]">
                        <td className="px-4 py-2.5 text-[#768399]">{idx + 1}</td>
                        <td className="px-4 py-2.5 text-[#F59E0B] font-semibold">{entry.score}</td>
                        <td className="px-4 py-2.5 text-[#E6EDF3]">F{entry.floor}</td>
                        <td className="px-4 py-2.5 text-[#E6EDF3]">{entry.kills}</td>
                        <td className="px-4 py-2.5 text-[#E6EDF3]">{entry.gold}</td>
                        <td className="px-4 py-2.5 text-[#768399]">{entry.turns}</td>
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() => onPlaySeed(entry.seed)}
                            className="text-[#38BDF8] hover:underline"
                          >
                            {entry.seed}
                          </button>
                        </td>
                        <td
                          className={`px-4 py-2.5 ${
                            entry.victory ? 'text-[#34D399] font-semibold' : 'text-[#A3B0C2]'
                          }`}
                        >
                          {entry.victory ? 'Escaped' : entry.causeOfDeath}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {scores.length > 0 && (
          <div className="px-6 py-3 border-t border-[#232B3A] bg-[#0E131C] flex justify-end">
            <button
              type="button"
              onClick={onClear}
              className="px-3 py-1.5 rounded-md text-xs text-[#F87171] hover:bg-[#2A171C] transition-colors"
            >
              Clear Leaderboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

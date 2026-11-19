import React, { useState } from 'react';
import { generateRandomSeed } from '../engine/rng';
import { GameState, MAX_FLOORS } from '../engine/types';

interface TitleScreenProps {
  isDevMode: boolean;
  savedRunPreview: GameState | null;
  saveError: string | null;
  monochrome: boolean;
  onToggleMonochrome: () => void;
  onStartNewGame: (seed: number) => void;
  onContinueGame: () => void;
  onOpenLab: () => void;
  onOpenSaveInspector: () => void;
  onOpenHighScores: () => void;
  onOpenHelp: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  isDevMode,
  savedRunPreview,
  saveError,
  monochrome,
  onToggleMonochrome,
  onStartNewGame,
  onContinueGame,
  onOpenLab,
  onOpenSaveInspector,
  onOpenHighScores,
  onOpenHelp,
}) => {
  const [seedInput, setSeedInput] = useState<string>('');

  const handleLaunch = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = Number.parseInt(seedInput.trim(), 10);
    const seed = Number.isFinite(parsed) && parsed > 0 ? parsed >>> 0 : generateRandomSeed();
    onStartNewGame(seed);
  };

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left: Primary Title & Run Launcher */}
        <section className="lg:col-span-7 flex flex-col justify-between border border-[#232B3A] bg-[#121721] rounded-lg p-7">
          <div>
            <p className="font-mono text-xs text-[#38BDF8] mb-2">
              8-Floor Circuit Board Roguelike · Turn-Based · Permadeath
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-[#E6EDF3] font-display">
              Sable
            </h1>
            <p className="mt-4 text-sm sm:text-base text-[#A3B0C2] leading-relaxed">
              Descend as the Engineer (<code className="text-[#38BDF8] font-semibold">@</code>) through 8 procedural floors of the corrupted Noise Floor. Scavenge tools, manage Surge energy, outsmart hostile anomalies, and stop <span className="text-[#F87171] font-medium">The Kernel Panic</span> on Floor {MAX_FLOORS}.
            </p>

            {savedRunPreview && (
              <div className="mt-6 p-4 rounded-md bg-[#0B0E14] border border-[#232B3A] flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-[#E6EDF3]">Saved Run Available</div>
                  <div className="text-xs font-mono text-[#768399] mt-1">
                    Floor {savedRunPreview.floor}/{MAX_FLOORS} · Level {savedRunPreview.player.level} · HP {savedRunPreview.player.hp}/{savedRunPreview.player.maxHp} · Seed {savedRunPreview.seed}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onContinueGame}
                  className="px-4 py-2 rounded-md bg-[#34D399] text-[#07090D] text-xs font-semibold hover:bg-[#6EE7B7] transition-colors whitespace-nowrap shrink-0"
                >
                  Continue Run
                </button>
              </div>
            )}

            {saveError && !savedRunPreview && (
              <div className="mt-5 p-3.5 rounded-md bg-[#1B1318] border border-[#7F1D1D]/70 text-xs font-mono text-[#FCA5A5]">
                Corrupt saved file rejected safely: {saveError}
              </div>
            )}
          </div>

          <form onSubmit={handleLaunch} className="mt-7 pt-6 border-t border-[#232B3A] space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label htmlFor="seed-input" className="block text-xs text-[#768399] mb-1.5">
                  Run Seed (optional, leave blank for random)
                </label>
                <input
                  id="seed-input"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 12345"
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                  className="w-full px-3.5 py-2.5 rounded-md bg-[#0B0E14] border border-[#232B3A] text-sm font-mono text-[#E6EDF3] placeholder-[#546178] focus:outline-none focus:border-[#38BDF8]"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="w-full sm:w-auto px-6 py-2.5 rounded-md bg-[#38BDF8] text-[#07090D] text-sm font-semibold hover:bg-[#7DD3FC] transition-colors whitespace-nowrap"
                >
                  Start New Run
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs text-[#768399]">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none hover:text-[#E6EDF3]">
                <input
                  type="checkbox"
                  checked={monochrome}
                  onChange={onToggleMonochrome}
                  className="accent-[#38BDF8] rounded"
                />
                <span>Monochrome terminal mode</span>
              </label>

              <button
                type="button"
                onClick={() => setSeedInput('12345')}
                className="font-mono text-[#38BDF8] hover:underline whitespace-nowrap"
              >
                Use seed 12345
              </button>
            </div>
          </form>
        </section>

        {/* Right: Field Overview & Quick Links */}
        <aside className="lg:col-span-5 flex flex-col justify-between border border-[#232B3A] bg-[#121721] rounded-lg p-7">
          <div>
            <h2 className="text-base font-semibold text-[#E6EDF3]">Expedition Brief</h2>
            <p className="text-xs text-[#768399] mt-1">
              Every turn counts. When your integrity hits zero without a Fuse, the save is erased.
            </p>

            <dl className="mt-5 space-y-3 text-xs">
              <div className="flex justify-between gap-4 border-b border-[#232B3A]/70 pb-2.5">
                <dt className="text-[#768399]">Depth</dt>
                <dd className="font-mono text-[#E6EDF3] text-right">8 Procedural Floors</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[#232B3A]/70 pb-2.5">
                <dt className="text-[#768399]">Movement</dt>
                <dd className="font-mono text-[#E6EDF3] text-right">Arrows / WASD / vi keys</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[#232B3A]/70 pb-2.5">
                <dt className="text-[#768399]">Special Ability</dt>
                <dd className="font-mono text-[#E6EDF3] text-right">Surge Beam [f]</dd>
              </div>
              <div className="flex justify-between gap-4 border-b border-[#232B3A]/70 pb-2.5">
                <dt className="text-[#768399]">Threats</dt>
                <dd className="font-mono text-[#E6EDF3] text-right">7 Anomaly Types + Boss</dd>
              </div>
              <div className="flex justify-between gap-4 pb-1">
                <dt className="text-[#768399]">Objective</dt>
                <dd className="font-mono text-[#E6EDF3] text-right">Defeat Kernel Panic (F8)</dd>
              </div>
            </dl>
          </div>

          <div className="mt-6 pt-5 border-t border-[#232B3A] space-y-2.5">
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={onOpenHighScores}
                className="px-3.5 py-2.5 rounded-md bg-[#171E2B] border border-[#232B3A] text-xs font-medium text-[#E6EDF3] hover:bg-[#1E293B] transition-colors whitespace-nowrap"
              >
                High Scores
              </button>
              <button
                type="button"
                onClick={onOpenHelp}
                className="px-3.5 py-2.5 rounded-md bg-[#171E2B] border border-[#232B3A] text-xs font-medium text-[#E6EDF3] hover:bg-[#1E293B] transition-colors whitespace-nowrap"
              >
                Controls &amp; Guide
              </button>
            </div>

            {isDevMode && (
              <div className="pt-2.5 border-t border-[#232B3A]/80 space-y-2">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={onOpenLab}
                    className="px-3.5 py-2 rounded-md bg-[#0B0E14] border border-[#38BDF8]/40 text-xs font-medium text-[#38BDF8] hover:bg-[#171E2B] transition-colors whitespace-nowrap"
                  >
                    Tests &amp; Bot Lab
                  </button>
                  <button
                    type="button"
                    onClick={onOpenSaveInspector}
                    className="px-3.5 py-2 rounded-md bg-[#0B0E14] border border-[#38BDF8]/40 text-xs font-medium text-[#38BDF8] hover:bg-[#171E2B] transition-colors whitespace-nowrap"
                  >
                    Save Fuzzer
                  </button>
                </div>
                <a
                  href="./sable-github-release.zip"
                  download="sable-github-release.zip"
                  className="block w-full text-center px-3.5 py-2 rounded-md bg-[#171E2B] border border-[#232B3A] text-xs font-mono text-[#34D399] hover:bg-[#1E293B] transition-colors whitespace-nowrap"
                >
                  Download GitHub Release ZIP
                </a>
              </div>
            )}
          </div>
        </aside>
      </div>
    </main>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  aggregateBotRuns,
  BotBatchStats,
  BotRunSummary,
  runAllUnitTests,
  runSingleBotGame,
  UnitTestResult,
} from '../engine/testsAndBot';
import { MAX_FLOORS } from '../engine/types';

interface EngineeringLabModalProps {
  onClose: () => void;
  onPlaySeed: (seed: number) => void;
}

export const EngineeringLabModal: React.FC<EngineeringLabModalProps> = ({
  onClose,
  onPlaySeed,
}) => {
  const [activeTab, setActiveTab] = useState<'tests' | 'bot'>('tests');

  // Unit tests state
  const [testResults, setTestResults] = useState<UnitTestResult[]>([]);
  const [runningTests, setRunningTests] = useState(false);

  // Bot simulator state
  const [batchSize, setBatchSize] = useState<number>(100);
  const [baseSeed, setBaseSeed] = useState<number>(10000);
  const [botRunning, setBotRunning] = useState(false);
  const [botProgress, setBotProgress] = useState(0);
  const [botStats, setBotStats] = useState<BotBatchStats | null>(null);
  const cancelBotRef = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelBotRef.current = true;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const handleRunTests = () => {
    setRunningTests(true);
    // Defer 1 frame so UI updates cleanly before 1,000-seed connectivity check
    window.setTimeout(() => {
      const results = runAllUnitTests();
      setTestResults(results);
      setRunningTests(false);
    }, 20);
  };

  const handleRunBotBatch = () => {
    cancelBotRef.current = false;
    setBotRunning(true);
    setBotProgress(0);
    setBotStats(null);

    const summaries: BotRunSummary[] = [];
    let crashes = 0;
    let completed = 0;
    const chunk = 5;

    const runSlice = () => {
      if (cancelBotRef.current) {
        setBotRunning(false);
        return;
      }

      const end = Math.min(batchSize, completed + chunk);
      for (let i = completed; i < end; i++) {
        try {
          summaries.push(runSingleBotGame(baseSeed + i));
        } catch {
          crashes++;
        }
      }
      completed = end;
      setBotProgress(completed);
      setBotStats(aggregateBotRuns(summaries, crashes));

      if (completed < batchSize) {
        window.requestAnimationFrame(runSlice);
      } else {
        setBotRunning(false);
      }
    };

    window.requestAnimationFrame(runSlice);
  };

  const handleStopBot = () => {
    cancelBotRef.current = true;
    setBotRunning(false);
  };

  const passCount = testResults.filter((t) => t.passed).length;
  const maxHist = botStats ? Math.max(1, ...botStats.floorHistogram.slice(1)) : 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Engineering Lab"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] flex flex-col border border-[#232B3A] bg-[#121721] rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#232B3A]">
          <div>
            <h2 className="text-lg font-semibold text-[#E6EDF3]">Headless Engineering Lab</h2>
            <p className="text-xs text-[#768399] mt-0.5">
              Execute deterministic unit assertions and autonomous multi-run balance simulations directly against the pure game engine.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close lab"
            className="p-1.5 rounded-md text-[#768399] hover:text-[#E6EDF3] hover:bg-[#171E2B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Segmented Tab Switcher */}
        <div className="px-6 py-3 border-b border-[#232B3A] bg-[#0E131C] flex items-center justify-between gap-4">
          <div className="inline-flex p-1 bg-[#0B0E14] border border-[#232B3A] rounded-md gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('tests')}
              className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'tests'
                  ? 'bg-[#171E2B] text-[#E6EDF3]'
                  : 'text-[#768399] hover:text-[#E6EDF3]'
              }`}
            >
              Unit Test Suite
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bot')}
              className={`px-3.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === 'bot'
                  ? 'bg-[#171E2B] text-[#E6EDF3]'
                  : 'text-[#768399] hover:text-[#E6EDF3]'
              }`}
            >
              Bot Balance Simulator
            </button>
          </div>

          {activeTab === 'tests' && testResults.length > 0 && (
            <div className="text-xs font-mono text-[#A3B0C2]">
              {passCount}/{testResults.length} passed ·{' '}
              {testResults.reduce((acc, t) => acc + t.durationMs, 0).toFixed(1)} ms total
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'tests' ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="text-sm text-[#A3B0C2]">
                  Verifies Min-Heap ordering, DynamicArray &amp; RingBuffer invariants, Xorshift32 determinism, A* optimal routing, 1,000-seed BFS dungeon connectivity, combat bounds, and binary save round-trip integrity.
                </p>
                <button
                  type="button"
                  onClick={handleRunTests}
                  disabled={runningTests}
                  className="px-4 py-2 rounded-md bg-[#38BDF8] text-[#07090D] text-xs font-semibold hover:bg-[#7DD3FC] disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {runningTests ? 'Running Suite...' : 'Run All Unit Tests'}
                </button>
              </div>

              {testResults.length === 0 ? (
                <div className="p-8 text-center border border-[#232B3A] rounded-md bg-[#0B0E14] text-sm text-[#768399]">
                  Click <strong className="text-[#E6EDF3]">Run All Unit Tests</strong> to execute all 7 headless verification suites (including 1,000 procedural floor connectivity checks).
                </div>
              ) : (
                <div className="border border-[#232B3A] rounded-md divide-y divide-[#232B3A] bg-[#0B0E14]">
                  {testResults.map((res) => (
                    <div key={res.id} className="px-4 py-3 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2.5 text-sm">
                          <span
                            className={`font-mono text-xs font-semibold ${
                              res.passed ? 'text-[#34D399]' : 'text-[#F87171]'
                            }`}
                          >
                            {res.passed ? 'PASS' : 'FAIL'}
                          </span>
                          <span className="font-medium text-[#E6EDF3]">{res.name}</span>
                        </div>
                        <p className="text-xs font-mono text-[#768399] mt-1">{res.details}</p>
                      </div>
                      <span className="font-mono text-xs text-[#768399] shrink-0">
                        {res.durationMs.toFixed(1)} ms
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Controls */}
              <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-[#232B3A]">
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label className="block text-xs text-[#768399] mb-1.5">Batch Size</label>
                    <div className="inline-flex p-1 bg-[#0B0E14] border border-[#232B3A] rounded-md gap-1">
                      {[50, 100, 250].map((n) => (
                        <button
                          key={n}
                          type="button"
                          disabled={botRunning}
                          onClick={() => setBatchSize(n)}
                          className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                            batchSize === n
                              ? 'bg-[#171E2B] text-[#E6EDF3]'
                              : 'text-[#768399] hover:text-[#E6EDF3]'
                          }`}
                        >
                          {n} runs
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label htmlFor="bot-seed" className="block text-xs text-[#768399] mb-1.5">
                      Starting Seed
                    </label>
                    <input
                      id="bot-seed"
                      type="number"
                      disabled={botRunning}
                      value={baseSeed}
                      onChange={(e) => setBaseSeed(Math.max(1, Number(e.target.value) || 1))}
                      className="w-32 px-3 py-1.5 rounded-md bg-[#0B0E14] border border-[#232B3A] text-xs font-mono text-[#E6EDF3]"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {botRunning ? (
                    <button
                      type="button"
                      onClick={handleStopBot}
                      className="px-4 py-2 rounded-md bg-[#F87171] text-[#07090D] text-xs font-semibold whitespace-nowrap"
                    >
                      Stop ({botProgress}/{batchSize})
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleRunBotBatch}
                      className="px-4 py-2 rounded-md bg-[#38BDF8] text-[#07090D] text-xs font-semibold hover:bg-[#7DD3FC] whitespace-nowrap"
                    >
                      Start Simulation
                    </button>
                  )}
                </div>
              </div>

              {botStats ? (
                <div className="space-y-6">
                  {/* KPI Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="p-3.5 rounded-md bg-[#0B0E14] border border-[#232B3A]">
                      <div className="text-xs text-[#768399]">Completed</div>
                      <div className="font-mono text-lg font-semibold text-[#E6EDF3] mt-1">
                        {botStats.totalRuns}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-md bg-[#0B0E14] border border-[#232B3A]">
                      <div className="text-xs text-[#768399]">Avg Floor</div>
                      <div className="font-mono text-lg font-semibold text-[#38BDF8] mt-1">
                        {botStats.avgFloor.toFixed(2)}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-md bg-[#0B0E14] border border-[#232B3A]">
                      <div className="text-xs text-[#768399]">Win Rate</div>
                      <div className="font-mono text-lg font-semibold text-[#34D399] mt-1">
                        {botStats.winRate.toFixed(1)}%
                      </div>
                    </div>
                    <div className="p-3.5 rounded-md bg-[#0B0E14] border border-[#232B3A]">
                      <div className="text-xs text-[#768399]">Avg Kills</div>
                      <div className="font-mono text-lg font-semibold text-[#E6EDF3] mt-1">
                        {botStats.avgKills.toFixed(1)}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-md bg-[#0B0E14] border border-[#232B3A]">
                      <div className="text-xs text-[#768399]">Crashes</div>
                      <div
                        className={`font-mono text-lg font-semibold mt-1 ${
                          botStats.crashes === 0 ? 'text-[#34D399]' : 'text-[#F87171]'
                        }`}
                      >
                        {botStats.crashes}
                      </div>
                    </div>
                  </div>

                  {/* Floor Distribution Chart + Top Causes of Death */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 rounded-md bg-[#0B0E14] border border-[#232B3A] space-y-3">
                      <h3 className="text-xs font-semibold text-[#E6EDF3]">
                        Deepest Floor Reached Distribution
                      </h3>
                      <div className="space-y-2">
                        {Array.from({ length: MAX_FLOORS }, (_, i) => i + 1).map((fl) => {
                          const count = botStats.floorHistogram[fl] ?? 0;
                          const pct = (count / maxHist) * 100;
                          return (
                            <div key={fl} className="flex items-center gap-3 text-xs font-mono">
                              <span className="w-10 text-[#768399]">F{fl}</span>
                              <div className="flex-1 h-2 bg-[#121721] rounded-sm overflow-hidden">
                                <div
                                  className={`h-full ${fl === MAX_FLOORS ? 'bg-[#34D399]' : 'bg-[#38BDF8]'}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="w-8 text-right text-[#A3B0C2]">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="p-4 rounded-md bg-[#0B0E14] border border-[#232B3A] space-y-3">
                      <h3 className="text-xs font-semibold text-[#E6EDF3]">
                        Primary Termination Causes
                      </h3>
                      {botStats.topCausesOfDeath.length === 0 ? (
                        <p className="text-xs text-[#768399]">No deaths recorded in batch.</p>
                      ) : (
                        <div className="space-y-2 text-xs font-mono">
                          {botStats.topCausesOfDeath.map((row) => (
                            <div
                              key={row.cause}
                              className="flex items-center justify-between gap-2 pb-1.5 border-b border-[#232B3A]/60"
                            >
                              <span className="text-[#A3B0C2] truncate">{row.cause}</span>
                              <span className="text-[#F87171] shrink-0">{row.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Recent Runs Table */}
                  <div className="border border-[#232B3A] rounded-md overflow-hidden bg-[#0B0E14]">
                    <div className="px-4 py-2.5 border-b border-[#232B3A] text-xs font-semibold text-[#E6EDF3]">
                      Sample Simulated Runs (click a seed to play it yourself)
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs font-mono">
                        <thead className="text-[#768399] border-b border-[#232B3A]">
                          <tr>
                            <th className="px-4 py-2 font-medium">Seed</th>
                            <th className="px-4 py-2 font-medium">Outcome</th>
                            <th className="px-4 py-2 font-medium">Floor</th>
                            <th className="px-4 py-2 font-medium">Kills</th>
                            <th className="px-4 py-2 font-medium">Turns</th>
                            <th className="px-4 py-2 font-medium text-right">Score</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#232B3A]/60">
                          {botStats.recentRuns.map((run) => (
                            <tr key={run.seed} className="hover:bg-[#121721]">
                              <td className="px-4 py-2">
                                <button
                                  type="button"
                                  onClick={() => onPlaySeed(run.seed)}
                                  className="text-[#38BDF8] hover:underline"
                                >
                                  {run.seed}
                                </button>
                              </td>
                              <td
                                className={`px-4 py-2 ${
                                  run.victory ? 'text-[#34D399]' : 'text-[#A3B0C2]'
                                }`}
                              >
                                {run.victory ? 'Escaped' : run.causeOfDeath}
                              </td>
                              <td className="px-4 py-2 text-[#E6EDF3]">F{run.floorReached}</td>
                              <td className="px-4 py-2 text-[#E6EDF3]">{run.kills}</td>
                              <td className="px-4 py-2 text-[#768399]">{run.turns}</td>
                              <td className="px-4 py-2 text-right text-[#F59E0B]">{run.score}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center border border-[#232B3A] rounded-md bg-[#0B0E14] text-sm text-[#768399]">
                  Run an autonomous bot batch to stress-test dungeon generation, AI combat balance, average floor depth, and zero-crash stability across sequential seeds.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

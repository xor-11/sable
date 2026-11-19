import { aggregateBotRuns, runAllUnitTests, runSingleBotGame } from './testsAndBot';

/**
 * Standalone CLI test runner for Sable (executed via `npm test`).
 * Runs all deterministic engine unit assertions and a 25-run headless bot check.
 */
function main(): void {
  const results = runAllUnitTests();
  let failed = 0;

  console.log('Sable Headless Engine Test Suite');
  console.log('--------------------------------');
  for (const res of results) {
    const tag = res.passed ? 'PASS' : 'FAIL';
    console.log(`[${tag}] ${res.name} (${res.durationMs.toFixed(1)} ms)`);
    console.log(`       ${res.details}`);
    if (!res.passed) failed++;
  }

  const runs = [];
  let crashes = 0;
  for (let i = 0; i < 25; i++) {
    try {
      runs.push(runSingleBotGame(10000 + i));
    } catch {
      crashes++;
    }
  }
  const summary = aggregateBotRuns(runs, crashes);
  console.log('--------------------------------');
  console.log(
    `Bot Simulation (25 runs): avg floor ${summary.avgFloor.toFixed(2)}, win rate ${summary.winRate.toFixed(1)}%, crashes ${summary.crashes}`
  );

  if (failed > 0 || crashes > 0) {
    process.exit(1);
  }
}

main();

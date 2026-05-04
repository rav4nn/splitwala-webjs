#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const path     = require('path');
const TGClient = require('./client');
const { Harness } = require('./harness');
const Reporter = require('./reporter');

// ── CLI args ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}

const scenarioFilter = arg('--scenario', 'all');
const reportPath     = arg('--report', path.resolve(__dirname, 'report.json'));
const mdPath         = arg('--md',     path.resolve(__dirname, 'report.md'));
const timeoutMs      = Number(arg('--timeout', '10000'));

// ── Scenario registry ─────────────────────────────────────────────────────────

const ALL_SCENARIOS = [
  require('./scenarios/01-smoke'),
  require('./scenarios/02-split-equal'),
  require('./scenarios/03-split-unequal'),
  require('./scenarios/04-settlement'),
  require('./scenarios/05-history-delete'),
  require('./scenarios/06-reset'),
  require('./scenarios/07-mentions'),
  require('./scenarios/08-errors'),
];

const scenarios = scenarioFilter === 'all'
  ? ALL_SCENARIOS
  : ALL_SCENARIOS.filter(s => s.id === scenarioFilter || s.name.toLowerCase() === scenarioFilter.toLowerCase());

if (scenarios.length === 0) {
  console.error(`No scenario matched: "${scenarioFilter}"`);
  console.error('Available:', ALL_SCENARIOS.map(s => s.id).join(', '));
  process.exit(1);
}

// ── Env validation ────────────────────────────────────────────────────────────

const required = ['TG_API_ID', 'TG_API_HASH', 'TG_USER_SESSION', 'TG_TEST_GROUP', 'TG_BOT_USERNAME'];
const missing  = required.filter(k => !process.env[k]);
if (missing.length) {
  console.error('[run] Missing required env vars:', missing.join(', '));
  console.error('See tg/test-harness/README.md for setup instructions.');
  process.exit(1);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = new TGClient({
    apiId:         process.env.TG_API_ID,
    apiHash:       process.env.TG_API_HASH,
    sessionString: process.env.TG_USER_SESSION,
    botUsername:   process.env.TG_BOT_USERNAME,
    chatId:        process.env.TG_TEST_GROUP,
  });

  const reporter = new Reporter({
    botUsername: process.env.TG_BOT_USERNAME,
    chatId:      process.env.TG_TEST_GROUP,
  });

  console.log(`[run] Connecting to Telegram…`);
  await client.connect();
  console.log(`[run] Running ${scenarios.length} scenario(s)\n`);

  for (const scenario of scenarios) {
    // Drain any leftover messages from the previous scenario, then pause
    // briefly to let Telegram's per-user rate limit recover.
    client.drainQueue();
    await new Promise(r => setTimeout(r, 1500));

    const h = new Harness(client, { timeout: timeoutMs });
    reporter.beginScenario(scenario.id, scenario.name);
    process.stdout.write(`  ${scenario.name}… `);

    try {
      await scenario.run(h);
      reporter.passScenario();
      console.log('[PASS]');
    } catch (err) {
      reporter.failScenario(err, h.captured());
      console.log(`[FAIL] at step "${err.ctx?.step || '?'}"`);
      console.error(`       ${err.message.split('\n')[0]}`);
    }
  }

  await client.disconnect();

  const report = reporter.writeJson(reportPath);
  reporter.writeMd(mdPath, report);

  const { summary } = report;
  console.log(`\n[run] ${summary.passed}/${summary.total} passed — ${(report.durationMs / 1000).toFixed(1)}s`);
  console.log(`[run] report → ${reportPath}`);
  console.log(`[run] summary → ${mdPath}`);

  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[run] Fatal:', err.message);
  if (process.env.HARNESS_DEBUG) console.error(err.stack);
  process.exit(1);
});

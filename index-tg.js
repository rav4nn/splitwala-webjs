'use strict';
/**
 * index-tg.js — SplitWala Telegram bot entry point.
 *
 * Run with:  npm run start:tg     (or via PM2 — see ecosystem.config.js)
 * Requires TELEGRAM_BOT_TOKEN in .env (or env).
 */

require('dotenv').config();
const { Bot } = require('grammy');
require('./tg/db-tg');           // initialise SQLite first

const handlers = require('./handlers-tg');
const memberCache = require('./tg/member-cache');
const store = require('./tg/store-tg');
const { handleSplitCallback, handleWizardText } = require('./tg/split-wizard');

// Track which @username keys have already been migrated this session.
// On restart the migration re-runs harmlessly (0 rows if already done).
const migratedUsernames = new Set();

// ── Process-level safety nets ───────────────────────────────────────────────
process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));
process.on('uncaughtException',  (err)    => console.error('[uncaughtException]',  err));

// ── Bot init ────────────────────────────────────────────────────────────────
const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('❌ TELEGRAM_BOT_TOKEN is missing. See .env.example.');
  process.exit(1);
}

const bot = new Bot(token);

// ── Healthchecks.io heartbeat ────────────────────────────────────────────────
const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL_TG;
let healthInterval = null;
function startHeartbeat() {
  if (!HEALTHCHECK_URL || healthInterval) return;
  const ping = () => fetch(HEALTHCHECK_URL).catch(e => console.error('[health-tg] ping failed:', e.message));
  ping();
  healthInterval = setInterval(ping, 60_000);
}
function notifyFail(msg) {
  if (!HEALTHCHECK_URL) return;
  fetch(`${HEALTHCHECK_URL}/fail`, { method: 'POST', body: String(msg) }).catch(() => {});
}

// ── Always pollinate the member cache from any incoming update ──────────────
bot.use(async (ctx, next) => {
  if (ctx.chat?.id && ctx.from && !memberCache.isAnonBot(ctx.from.id)) {
    memberCache.recordMember(ctx.chat.id, ctx.from);
    // First time we see this user's real ID: migrate any @username ledger entries
    if (ctx.from.username) {
      const key = `@${ctx.from.username.toLowerCase()}`;
      if (!migratedUsernames.has(key)) {
        migratedUsernames.add(key);
        store.migrateUsernameToId(key, String(ctx.from.id));
      }
    }
  }
  if (ctx.message?.reply_to_message?.from)
    memberCache.recordMember(ctx.chat.id, ctx.message.reply_to_message.from);
  for (const e of (ctx.message?.entities || [])) {
    if (e.type === 'text_mention' && e.user) memberCache.recordMember(ctx.chat.id, e.user);
  }
  await next();
});

// ── Command routing ─────────────────────────────────────────────────────────
bot.command('help',     handlers.handleHelp);
bot.command('start',    handlers.handleStart);
bot.command('split',    handlers.handleSplit);
bot.command('balances', handlers.handleBalances);
bot.command('summary',  handlers.handleSummary);
bot.command('paid',     handlers.handlePaid);
bot.command('got',      handlers.handleGot);
bot.command('history',  handlers.handleHistory);
bot.command('delete',   handlers.handleDelete);
bot.command('resetall', handlers.handleResetAll);

// ── Callback query routing ───────────────────────────────────────────────────
bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data || '';
  if (data.startsWith('s:') && await handleSplitCallback(ctx)) return;
  if (data.startsWith('d:') && await handlers.handleDeleteCallback(ctx)) return;
  await ctx.answerCallbackQuery();
});

// ── Text message routing ─────────────────────────────────────────────────────
bot.on('message', async (ctx) => {
  // In group chats, let active split wizards intercept text first (amount step)
  if (ctx.chat.type !== 'private' && ctx.message?.text) {
    if (await handleWizardText(ctx)) return;
  }
  if (ctx.chat.type === 'private') {
    await handlers.handleStart(ctx);
  }
});

bot.catch((err) => {
  console.error('[bot-tg] handler error:', err.error || err);
  notifyFail(`handler-error: ${(err.error && err.error.message) || err.message || 'unknown'}`);
});

// ── Start polling ───────────────────────────────────────────────────────────
bot.start({
  onStart: async (info) => {
    console.log(`✅ SplitWala-TG ready as @${info.username}`);
    await bot.api.deleteMyCommands().catch(e => console.error('[deleteMyCommands]', e.message));
    startHeartbeat();
  },
});

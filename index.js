/**
 * index.js — SplitWala bot entry point
 *
 * Responsibilities:
 *   1. Start the whatsapp-web.js client (QR login, session restore)
 *   2. Route incoming slash commands to the correct handler
 *
 * Business logic lives in handlers.js / adminHandlers.js.
 * All state lives in store.js.
 *
 * Run with: npm start
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode                = require('qrcode-terminal');
const fs                    = require('fs');
const path                  = require('path');

// Initialise SQLite database before anything else
require('./db');

const { cacheNames, stripSuffix, saveData, findCanonicalPhone, discoverAndRegisterMappings } = require('./store');
const { handleSplit, handleBalances, handlePaid, handleGot, handleHelp, handleSummary } = require('./handlers');
const { handleResetAll, handleHistory, handleDelete }    = require('./adminHandlers');

// ─── Process-level safety nets ────────────────────────────────────────────────
// A single rejected promise in a deep handler used to crash the whole bot.
// Log and keep running — the WhatsApp client itself recovers via its own events.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});


// ─── Stale session lock cleanup ───────────────────────────────────────────────
// If Chromium didn't shut down cleanly (Windows kill, machine sleep, AV),
// SingletonLock/Cookie/Socket can stay behind and block the next launch.
const sessionDir = path.join(__dirname, '.wwebjs_auth', 'session');
for (const f of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
  try {
    fs.unlinkSync(path.join(sessionDir, f));
    console.log(`[startup] Removed stale ${f}`);
  } catch (_) { /* not present — normal */ }
}


// ─── Healthchecks.io heartbeat ────────────────────────────────────────────────
// Set HEALTHCHECK_URL in the environment to a unique check URL from
// https://healthchecks.io. The bot pings it every 60 s while WhatsApp is
// connected; if pings stop for the grace period you configure on healthchecks.io
// (e.g. 5 min), it emails / pushes / Telegrams you that the bot is down.
const HEALTHCHECK_URL = process.env.HEALTHCHECK_URL;
let healthInterval = null;

function startHeartbeat() {
  if (!HEALTHCHECK_URL || healthInterval) return;
  const ping = () => fetch(HEALTHCHECK_URL).catch(err =>
    console.error('[health] ping failed:', err.message));
  ping();
  healthInterval = setInterval(ping, 60_000);
}

function stopHeartbeat() {
  if (healthInterval) {
    clearInterval(healthInterval);
    healthInterval = null;
  }
}

function notifyFail(msg) {
  if (!HEALTHCHECK_URL) return;
  fetch(`${HEALTHCHECK_URL}/fail`, { method: 'POST', body: String(msg) })
    .catch(() => {});
}


// ─── WhatsApp client ──────────────────────────────────────────────────────────

// LocalAuth persists the session in .wwebjs_auth/ so the QR scan is only needed once.
// webVersionCache 'remote' bypasses the local .wwebjs_cache/ that goes stale every
// time WhatsApp Web rolls out an update — pulls the matching HTML fresh from the
// wppconnect-team/wa-version archive instead.
const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html',
  },
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', qr => {
  console.log('\nScan this QR code with WhatsApp to log in:\n');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ SplitWala is ready!');
  console.log('   Commands: /split  /balances  /paid  /got  /help  /summary  /history  /delete  /resetall');
  startHeartbeat();
});

client.on('auth_failure', msg => {
  console.error('[auth] Authentication failed:', msg);
  notifyFail(`auth_failure: ${msg}`);
});

let reconnecting = false;
client.on('disconnected', async (reason) => {
  console.warn('[client] Disconnected:', reason);
  stopHeartbeat();
  notifyFail(`disconnected: ${reason}`);

  if (reconnecting) return;
  reconnecting = true;

  try {
    await client.destroy();
  } catch (err) {
    console.error('[client] destroy failed:', err.message);
  }

  setTimeout(() => {
    reconnecting = false;
    console.log('[client] Reinitializing after disconnect...');
    client.initialize().catch(err =>
      console.error('[client] Reinit failed:', err.message));
  }, 5000);
});


// ─── Group participant name caching ───────────────────────────────────────────

// Track which groups have had their participant names cached this session.
// cacheNames() already skips already-known phones, so repeat calls are safe
// but the Set avoids the chat.getParticipants() overhead on every command.
const cachedGroups = new Set();

async function ensureGroupCached(msg, client) {
  const groupId = msg.from;
  if (cachedGroups.has(groupId)) return;
  cachedGroups.add(groupId);
  try {
    const chat = await msg.getChat();
    const phones = (chat.participants || [])
      .filter(p => p.id._serialized.endsWith('@c.us'))
      .map(p => stripSuffix(p.id._serialized));
    if (phones.length > 0) {
      await cacheNames(phones, client);
      saveData();
    }

    // Resolve @lid participants → canonical phone so LIDs never land in
    // transactions as unknown users.  Runs in parallel; failures are silently
    // ignored (LID stays unresolved — no worse than before this change).
    const lidParticipants = (chat.participants || [])
      .filter(p => p.id._serialized.endsWith('@lid'));
    await Promise.all(lidParticipants.map(async (p) => {
      const lidPhone = stripSuffix(p.id._serialized);
      if (findCanonicalPhone(lidPhone)) return; // already mapped — skip API call
      try {
        const contact = await client.getContactById(p.id._serialized);
        await discoverAndRegisterMappings(lidPhone, contact);
      } catch (_) {}
    }));
  } catch (_) {}
}


// ─── Command router ───────────────────────────────────────────────────────────

const ROUTES = [
  ['/split',    handleSplit],
  ['/balances', handleBalances],
  ['/paid',     handlePaid],
  ['/got',      handleGot],
  ['/help',     handleHelp],
  ['/summary',  handleSummary],
  ['/history',  handleHistory],
  ['/delete',   handleDelete],
  ['/resetall', handleResetAll],
];

const USAGE =
  '❌ I could not recognize that command.\n' +
  '✅ Use one of the supported slash commands.\n' +
  '📝 Example: /help';

client.on('message', async msg => {
  if (msg.isStatus || msg.fromMe) return;

  // Ignore DMs silently; bot only works in groups.
  if (!msg.from.endsWith('@g.us')) return;

  const text  = msg.body.trim();
  if (!text.startsWith('/')) return;

  const lower = text.toLowerCase();
  const route = ROUTES.find(([prefix]) => lower.startsWith(prefix));

  // Eagerly cache all group member names on first command per session
  await ensureGroupCached(msg, client);

  try {
    if (route) {
      await route[1](msg, client);
    } else {
      await client.sendMessage(msg.from, USAGE);
    }
  } catch (err) {
    console.error('[bot] Error handling message:', err.message);
  }
});


client.initialize();


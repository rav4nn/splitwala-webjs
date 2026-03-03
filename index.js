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

// Initialise SQLite database before anything else
require('./db');

const { cacheNames, stripSuffix, saveData, findCanonicalPhone, discoverAndRegisterMappings } = require('./store');
const { handleSplit, handleBalances, handlePaid, handleGot, handleHelp, handleSummary } = require('./handlers');
const { handleResetAll, handleHistory, handleDelete }    = require('./adminHandlers');

// ─── WhatsApp client ──────────────────────────────────────────────────────────

// LocalAuth persists the session in .wwebjs_auth/ so the QR scan is only needed once.
const client = new Client({
  authStrategy: new LocalAuth(),
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
});

client.on('auth_failure', msg => {
  console.error('[auth] Authentication failed:', msg);
});

client.on('disconnected', reason => {
  console.warn('[client] Disconnected:', reason);
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


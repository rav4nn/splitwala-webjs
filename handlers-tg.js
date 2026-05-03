'use strict';
/**
 * handlers-tg.js — Telegram command handlers (grammy).
 *
 * Imports core/* for all transport-agnostic logic and tg/* for Telegram-specific bits.
 */

const { InlineKeyboard } = require('grammy');
const store        = require('./tg/store-tg');
const memberCache  = require('./tg/member-cache');
const { createResolver } = require('./tg/tg-resolver');
const { startSplitWizard } = require('./tg/split-wizard');

const {
  parsePaidCommand, parseGotCommand, parseHistoryArgs,
  parseDeleteArgs, parseLabel, parseResetAllArgs, parseBalancesArgs,
} = require('./core/parser');

const {
  formatError, formatBalanceLine, formatSettlementLine,
  formatHelpText, formatNoBalancesMessage,
} = require('./core/format');

const { formatCurrency, generateId } = require('./core/identity');

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Render a mentionRef from the resolver as Telegram-flavored HTML. */
function renderMention(name, mentionRef) {
  if (!mentionRef) return escapeHtml(name);
  if (mentionRef.type === 'username') return `@${mentionRef.username}`;
  // text_mention or self → tg://user?id=
  return `<a href="tg://user?id=${mentionRef.userId}">${escapeHtml(name)}</a>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Pull every user object out of a ctx.message (sender, reply target, mentions) into the cache. */
function pollinateCache(ctx) {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  if (ctx.from)                    memberCache.recordMember(chatId, ctx.from);
  if (ctx.message?.reply_to_message?.from)
                                   memberCache.recordMember(chatId, ctx.message.reply_to_message.from);
  for (const e of (ctx.message?.entities || [])) {
    if (e.type === 'text_mention' && e.user) memberCache.recordMember(chatId, e.user);
  }
  for (const u of (ctx.message?.new_chat_members || [])) memberCache.recordMember(chatId, u);
}

async function reply(ctx, text, opts = {}) {
  await ctx.reply(text, { parse_mode: 'HTML', ...opts });
}

// ── /start (DM welcome) ─────────────────────────────────────────────────────

const START_DM_TEXT = [
  '<b>SplitWala</b> — split expenses in Telegram groups.',
  '',
  'Add me to a group and I\'ll track who owes whom.',
  '',
  '<b>How to get started:</b>',
  '1. Add me to a group chat',
  '2. Send /split 600 @alice @bob — I\'ll split it equally',
  '3. Use /balances to see who owes what',
  '4. Use /paid 200 to @alice when someone pays up',
  '',
  'That\'s it — no sign-up, no app install.',
  '',
  '<b>All commands:</b>',
].join('\n');

async function handleStart(ctx) {
  pollinateCache(ctx);
  if (ctx.chat.type === 'private') {
    const botInfo = ctx.me;
    const addUrl = `https://t.me/${botInfo.username}?startgroup=true`;
    await reply(ctx, START_DM_TEXT + '\n' + escapeHtml(formatHelpText()), {
      reply_markup: {
        inline_keyboard: [[
          { text: 'Add me to a group', url: addUrl },
        ]],
      },
    });
    return;
  }
  await reply(ctx, escapeHtml(formatHelpText()));
}

// ── /help ────────────────────────────────────────────────────────────────────

async function handleHelp(ctx) {
  pollinateCache(ctx);
  await reply(ctx, escapeHtml(formatHelpText()));
}

// ── /balances ────────────────────────────────────────────────────────────────

async function handleBalances(ctx) {
  pollinateCache(ctx);
  const r = createResolver(ctx);
  const groupId = String(ctx.chat.id);

  const { targetToken } = parseBalancesArgs(ctx.message.text || '');

  if (targetToken) {
    const target = await r.resolveByText(targetToken);
    if (!target) {
      await reply(ctx, formatError(`Couldn't find user "${targetToken}" in this group.`,
        'Mention them with @username or reply to one of their messages.', '/balances @alice'));
      return;
    }
    const net = store.getNetBetween(groupId, r.senderId, target.id);
    if (net.settled) { await reply(ctx, '✅ All settled with that person.'); return; }
    const otherName = store.getName(target.id);
    const line = net.owes === r.senderId
      ? `You owe ${renderMention(otherName, target.mentionRef)} ${formatCurrency(net.amount)}`
      : `${renderMention(otherName, target.mentionRef)} owes you ${formatCurrency(net.amount)}`;
    await reply(ctx, line);
    return;
  }

  const lines = store.getBalanceSummary(groupId, r.senderId);
  if (lines.length === 0) {
    await reply(ctx, '✅ All settled up!');
    return;
  }
  const rendered = lines.map(l => formatBalanceLine(l));
  await reply(ctx, escapeHtml(rendered.join('\n')));
}

// ── /summary ─────────────────────────────────────────────────────────────────

async function handleSummary(ctx) {
  pollinateCache(ctx);
  const groupId = String(ctx.chat.id);
  const simplified = store.getSimplifiedBalances(groupId);
  if (simplified.length === 0) {
    const empty = store.getParticipants(groupId).length === 0;
    await reply(ctx, formatNoBalancesMessage(empty));
    return;
  }
  const lines = simplified.map(t => formatSettlementLine({
    fromName: store.getName(t.from),
    toName:   store.getName(t.to),
    amount:   t.amount,
  }));
  await reply(ctx, '💰 Final Summary:\n\n' + escapeHtml(lines.join('\n')));
}

// ── /paid and /got ───────────────────────────────────────────────────────────

async function handleSettlementCommand(ctx, parsed) {
  pollinateCache(ctx);
  const r = createResolver(ctx);
  const groupId = String(ctx.chat.id);

  if (parsed.error) {
    await reply(ctx, formatError(parsed.error,
      'Use: /paid <amount> [to/from @person]', '/paid 200 to @alice'));
    return;
  }

  // Resolve from / to: defaults are (from = sender, to = ?)
  const fromId = parsed.fromToken
    ? (await r.resolveByText(parsed.fromToken))?.id
    : r.senderId;
  const toId   = parsed.toToken
    ? (await r.resolveByText(parsed.toToken))?.id
    : (parsed.fromToken ? r.senderId : null);

  if (!fromId || !toId) {
    await reply(ctx, formatError('Could not resolve sender or recipient.',
      'Tag the person with @username or reply to a message of theirs.', '/paid 100 to @alice'));
    return;
  }
  if (fromId === toId) {
    await reply(ctx, formatError('Sender and recipient are the same person.',
      'Pick two different people.', '/paid 100 to @alice'));
    return;
  }
  if (!parsed.amount || !(parsed.amount > 0)) {
    await reply(ctx, formatError('Amount must be a positive number.',
      'Use: /paid <amount> to @person', '/paid 200 to @alice'));
    return;
  }

  store.recordSettlement(groupId, fromId, toId, parsed.amount);
  const fromName = store.getName(fromId);
  const toName   = store.getName(toId);
  await reply(ctx, `✅ Recorded: ${escapeHtml(fromName)} paid ${escapeHtml(toName)} ${formatCurrency(parsed.amount)}`);
}

async function handlePaid(ctx) {
  await handleSettlementCommand(ctx, parsePaidCommand(ctx.message.text || ''));
}

async function handleGot(ctx) {
  const g = parseGotCommand(ctx.message.text || '');
  // /got X from Y  ≡  /paid X from Y to me
  const equiv = { amount: g.amount, fromToken: g.fromToken, toToken: 'me', error: g.error };
  await handleSettlementCommand(ctx, equiv);
}

// ── /split ───────────────────────────────────────────────────────────────────
// Sprint 3: routes into the NLP-powered split wizard (tg/split-wizard.js).
// The wizard handles LLM parsing, guided inline-keyboard questions, and
// confirmation before committing anything to the store.

async function handleSplit(ctx) {
  pollinateCache(ctx);
  if (ctx.chat.type === 'private') {
    await reply(ctx, 'Add me to a group to start splitting expenses!');
    return;
  }
  await startSplitWizard(ctx);
}

// ── /history ─────────────────────────────────────────────────────────────────

async function handleHistory(ctx) {
  pollinateCache(ctx);
  const r = createResolver(ctx);
  const groupId = String(ctx.chat.id);
  const { count, filterToken, error } = parseHistoryArgs(ctx.message.text || '');
  if (error) { await reply(ctx, formatError(error, 'Use: /history [N] [@person]', '/history 10 @alice')); return; }

  let filterId = null;
  if (filterToken) {
    const found = await r.resolveByText(filterToken);
    if (!found) { await reply(ctx, formatError(`Couldn't find user "${filterToken}".`,
      'Tag with @username or reply.', '/history 10 @alice')); return; }
    filterId = found.id;
  }

  let txs = store.getGroupTransactions(groupId);
  if (filterId) txs = txs.filter(t => t.participants.includes(filterId));
  txs = txs.slice(-count).reverse();
  if (txs.length === 0) { await reply(ctx, 'No matching transactions.'); return; }

  const lines = txs.map((t, idx) => {
    const date = new Date(t.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' });
    if (t.type === 'settlement') {
      return `${idx + 1}. [${date}] ${escapeHtml(store.getName(t.from))} → ${escapeHtml(store.getName(t.to))}: ${formatCurrency(t.amount)}`;
    }
    const payer = Object.keys(t.contributions)[0];
    const labelTxt = t.label ? ` (${escapeHtml(t.label)})` : '';
    return `${idx + 1}. [${date}] ${escapeHtml(store.getName(payer))} paid ${formatCurrency(t.amount)}${labelTxt}`;
  });
  await reply(ctx, lines.join('\n'));
}

// ── /delete ──────────────────────────────────────────────────────────────────
// Sprint 3: both modes now use inline keyboards for confirmation.

function txLabel(t) {
  if (t.type === 'settlement') {
    return `${store.getName(t.from)} → ${store.getName(t.to)}: ${formatCurrency(t.amount)}`;
  }
  const payer = Object.keys(t.contributions)[0];
  return `${store.getName(payer)} paid ${formatCurrency(t.amount)}${t.label ? ` (${t.label})` : ''}`;
}

function deleteSelectKeyboard(txs, userId) {
  const kb = new InlineKeyboard();
  txs.slice(0, 5).forEach((t, i) => {
    kb.row().text(`${i + 1}. ${txLabel(t)}`, `d:sel:${t.id}:${userId}`);
  });
  kb.row().text('✗ Cancel', `d:cx::${userId}`);
  return kb;
}

function deleteConfirmKeyboard(txId, userId) {
  return new InlineKeyboard()
    .text('🗑 Yes, delete', `d:ok:${txId}:${userId}`)
    .text('✗ Keep',        `d:cx::${userId}`);
}

async function handleDelete(ctx) {
  pollinateCache(ctx);
  const groupId  = String(ctx.chat.id);
  const userId   = String(ctx.from.id);
  const { mode, index, error } = parseDeleteArgs(ctx.message.text || '');
  if (error) { await reply(ctx, formatError(error, 'Use: /delete N (1–N)', '/delete 2')); return; }

  const txs = store.getGroupTransactions(groupId).slice(-20).reverse();

  if (mode === 'list') {
    if (txs.length === 0) { await reply(ctx, 'No transactions to delete.'); return; }
    const kb = deleteSelectKeyboard(txs, userId);
    await reply(ctx, 'Which transaction do you want to delete?', { reply_markup: kb });
    return;
  }

  if (index < 1 || index > txs.length) {
    await reply(ctx, formatError(`No transaction #${index}.`, 'Use /delete to see the list.', '/delete'));
    return;
  }
  const target = txs[index - 1];
  const kb = deleteConfirmKeyboard(target.id, userId);
  await reply(ctx,
    `Delete this transaction?\n<b>${escapeHtml(txLabel(target))}</b>`,
    { parse_mode: 'HTML', reply_markup: kb });
}

// ── Delete callback handler (called from index-tg.js) ────────────────────────

async function handleDeleteCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith('d:')) return false;

  const parts    = data.split(':');
  const action   = parts[1];            // sel | ok | cx
  const value    = parts[2] || '';      // txId (for sel/ok)
  const ownerId  = parts[parts.length - 1];

  if (String(ctx.from.id) !== ownerId) {
    await ctx.answerCallbackQuery({ text: '🚫 Not your action.' });
    return true;
  }

  const groupId = String(ctx.chat.id);

  if (action === 'sel') {
    // User picked a transaction from the list → show confirm keyboard
    const tx = store.getGroupTransactions(groupId).find(t => t.id === value);
    if (!tx) {
      await ctx.answerCallbackQuery({ text: 'Transaction not found.' });
      return true;
    }
    const kb = deleteConfirmKeyboard(tx.id, ownerId);
    try {
      await ctx.editMessageText(
        `Delete this transaction?\n<b>${escapeHtml(txLabel(tx))}</b>`,
        { parse_mode: 'HTML', reply_markup: kb }
      );
    } catch (_) {}
    await ctx.answerCallbackQuery();
    return true;
  }

  if (action === 'ok') {
    store.deleteTransaction(value, groupId);
    try { await ctx.editMessageText('🗑 Transaction deleted.'); } catch (_) {}
    await ctx.answerCallbackQuery({ text: 'Deleted.' });
    return true;
  }

  if (action === 'cx') {
    try { await ctx.deleteMessage(); } catch (_) {}
    await ctx.answerCallbackQuery({ text: 'Cancelled.' });
    return true;
  }

  return false;
}

// ── /resetall ────────────────────────────────────────────────────────────────

async function handleResetAll(ctx) {
  pollinateCache(ctx);
  const groupId = String(ctx.chat.id);
  const { confirmed } = parseResetAllArgs(ctx.message.text || '');

  if (!confirmed) {
    const txs = store.getGroupTransactions(groupId);
    await reply(ctx,
      `⚠️ This will permanently delete ${txs.length} transaction(s) and all balances for this group.\n` +
      `Send <code>/resetall confirm</code> to proceed.`);
    return;
  }
  store.resetAllGroupData(groupId);
  await reply(ctx, '🧹 All group data wiped.');
}

module.exports = {
  handleStart, handleHelp, handleBalances, handleSummary,
  handlePaid, handleGot, handleSplit,
  handleHistory, handleDelete, handleDeleteCallback, handleResetAll,
};

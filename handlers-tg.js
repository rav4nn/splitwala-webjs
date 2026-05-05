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
  formatBox, formatError, formatHelpText, formatNoBalancesMessage,
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

/** Render a user as a clickable tg://user deep link. */
function renderUserLink(userId) {
  const id = String(userId);
  const name = store.getName(id);
  if (id.startsWith('@')) return escapeHtml(name);
  return `<a href="tg://user?id=${id}">${escapeHtml(name)}</a>`;
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
  'Add me to a group and type naturally:',
  '<i>"split 600 dinner with alice and bob"</i>',
  '',
  'I handle the rest — no sign-up needed.',
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
    if (net.settled) {
      await reply(ctx, formatBox('All Settled', [`Nothing owed with ${renderMention(store.getName(target.id), target.mentionRef)}`]));
      return;
    }
    const otherName = store.getName(target.id);
    const line = net.owes === r.senderId
      ? `You owe ${renderMention(otherName, target.mentionRef)}  ${formatCurrency(net.amount)}`
      : `${renderMention(otherName, target.mentionRef)} owes you  ${formatCurrency(net.amount)}`;
    await reply(ctx, formatBox('Balance', [line]));
    return;
  }

  const lines = store.getBalanceSummary(groupId, r.senderId);
  if (lines.length === 0) {
    await reply(ctx, formatBox('All Settled', ['Everyone is squared up.']));
    return;
  }
  const rendered = lines.map(l => {
    const link = renderUserLink(l.otherId);
    if (l.direction === 'iOwe') return `You owe ${link}  ${formatCurrency(l.amount)}`;
    return `${link} owes you  ${formatCurrency(l.amount)}`;
  });
  await reply(ctx, formatBox('Balances', rendered));
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
  const lines = simplified.map(t =>
    `${renderUserLink(t.from)} → ${renderUserLink(t.to)}  ${formatCurrency(t.amount)}`
  );
  await reply(ctx, formatBox('Settlement Summary', lines, 'Minimum transfers to settle up'));
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
  await reply(ctx, formatBox('Payment Recorded', [`${renderUserLink(fromId)} → ${renderUserLink(toId)}  ${formatCurrency(parsed.amount)}`], '/balances to check totals'));
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
    await reply(ctx, '┌ Groups Only\n│\n│  Add me to a group to start splitting.\n└');
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
  if (txs.length === 0) {
    await reply(ctx, formatBox('History', ['No matching transactions.']));
    return;
  }

  const lines = txs.map((t, idx) => {
    const date = new Date(t.timestamp).toLocaleString('en-IN', { dateStyle: 'short' });
    if (t.type === 'settlement') {
      return `${idx + 1}. ${renderUserLink(t.from)} → ${renderUserLink(t.to)}  ${formatCurrency(t.amount)}  <i>${date}</i>`;
    }
    const payer = Object.keys(t.contributions)[0];
    const labelTxt = t.label ? `  ${escapeHtml(t.label)}` : '';
    return `${idx + 1}. ${renderUserLink(payer)} paid ${formatCurrency(t.amount)}${labelTxt}  <i>${date}</i>`;
  });
  await reply(ctx, formatBox('History', lines, '/delete N to remove one'));
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
    if (txs.length === 0) { await reply(ctx, formatBox('Delete', ['No transactions to delete.'])); return; }
    const kb = deleteSelectKeyboard(txs, userId);
    await reply(ctx, '┌ Delete Transaction\n│\n│  Select one to remove:', { reply_markup: kb });
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
    const msg = '┌ Deleted\n│\n│  Transaction removed and balances updated.\n└';
    try {
      await ctx.editMessageText(msg);
    } catch (_) {
      await ctx.reply(msg);
    }
    await ctx.answerCallbackQuery({ text: 'Deleted.' });
    return true;
  }

  if (action === 'cx') {
    try {
      await ctx.deleteMessage();
    } catch (_) {
      try { await ctx.editMessageText('└ Cancelled.'); } catch (_e) {}
    }
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
    await reply(ctx, formatBox('Reset Warning', [
      `This will permanently delete ${txs.length} transaction(s)`,
      'and all balances for this group.',
      '',
      'Send /resetall confirm to proceed.',
    ]));
    return;
  }
  store.resetAllGroupData(groupId);
  await reply(ctx, formatBox('Reset Complete', ['All group data wiped. Starting fresh.']));
}

module.exports = {
  handleStart, handleHelp, handleBalances, handleSummary,
  handlePaid, handleGot, handleSplit,
  handleHistory, handleDelete, handleDeleteCallback, handleResetAll,
};

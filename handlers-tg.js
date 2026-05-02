'use strict';
/**
 * handlers-tg.js — Telegram command handlers (grammy).
 *
 * Imports core/* for all transport-agnostic logic and tg/* for Telegram-specific bits.
 */

const store        = require('./tg/store-tg');
const memberCache  = require('./tg/member-cache');
const { createResolver } = require('./tg/tg-resolver');

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
//
// MVP: equal split among everyone mentioned, or @all if no mentions.
// The full WhatsApp /split grammar (custom contributions, "owes" clauses,
// "by", "between") is sprint-3 work — for sprint 2, the Telegram split
// supports: /split <amount> [@A @B ...] [for <label>]

async function handleSplit(ctx) {
  pollinateCache(ctx);
  const r = createResolver(ctx);
  const groupId = String(ctx.chat.id);
  const text = ctx.message.text || '';

  // 1. Parse label (and strip it from text for amount/mention parsing)
  const { label, error: labelErr } = parseLabel(text);
  if (labelErr) {
    await reply(ctx, formatError(labelErr, 'Use: for <description> (max 40 chars)', '/split 600 for dinner'));
    return;
  }
  // Strip the label so it doesn't pollute mention parsing.
  // - Newline label: drop any line whose trimmed content starts with "for "
  // - Inline label: drop the trailing " for ..." segment from line 1
  const textWithoutLabel = label
    ? text.split('\n')
        .map((line, idx) => {
          if (idx > 0 && /^for\s+/i.test(line.trim())) return '';
          if (idx === 0) return line.replace(/\s+for\s+.*$/i, '');
          return line;
        })
        .join('\n')
        .trim()
    : text;

  // 2. Extract amount
  const body = textWithoutLabel.replace(/^\/split(?:@\w+)?\s*/i, '').trim();
  const amountMatch = body.match(/^(\d+(?:\.\d+)?)/);
  if (!amountMatch) {
    await reply(ctx, formatError('Missing amount.',
      'Use: /split <amount> [@person ...] [for <label>]', '/split 600 @alice @bob for dinner'));
    return;
  }
  const amount = parseFloat(amountMatch[1]);
  if (!(amount > 0)) {
    await reply(ctx, formatError('Amount must be positive.',
      'Use: /split <amount> [@person ...]', '/split 600 @alice'));
    return;
  }

  // 3. Build participants list from mentions / @all / sender
  const after = body.slice(amountMatch[0].length).trim();
  const tokens = after.split(/\s+/).filter(Boolean);
  let participants;

  if (tokens.includes('@all') || tokens.length === 0) {
    participants = await r.listAllParticipants();
  } else {
    participants = [];
    const seen = new Set();
    for (const tok of tokens) {
      const res = await r.resolveByText(tok);
      if (!res) {
        await reply(ctx, formatError(`Couldn't find user "${tok}".`,
          'Mention with @username or reply to a message.', '/split 600 @alice @bob'));
        return;
      }
      if (!seen.has(res.id)) { seen.add(res.id); participants.push(res); }
    }
    // Always include sender
    if (!seen.has(r.senderId)) {
      participants.push({ id: r.senderId, mentionRef: { type: 'self', userId: Number(r.senderId) } });
    }
  }

  if (participants.length < 2) {
    await reply(ctx, formatError('Need at least 2 participants for a split.',
      'Tag at least one other person, or use @all.', '/split 600 @alice'));
    return;
  }

  // 4. Compute shares (equal split)
  const share = Math.round((amount / participants.length) * 100) / 100;
  const payerId = r.senderId;

  const contributions = { [payerId]: amount };
  const liabilities   = {};
  const balanceDeltas = [];
  for (const p of participants) {
    liabilities[p.id] = share;
    if (p.id !== payerId) {
      store.updateBalance(groupId, p.id, payerId, share);
      balanceDeltas.push({ debtor: p.id, creditor: payerId, amount: share });
    }
  }

  // 5. Persist
  store.addTransaction({
    id:        generateId(),
    type:      'expense',
    groupId,
    timestamp: new Date().toISOString(),
    amount,
    label,
    contributions,
    liabilities,
    participants:  participants.map(p => p.id),
    balanceDeltas,
    message_id: String(ctx.message.message_id),
  });

  const payerName = store.getName(payerId);
  const memberLines = participants.map(p => `• ${escapeHtml(store.getName(p.id))}: ${formatCurrency(share)}`);
  const labelText   = label ? ` for ${escapeHtml(label)}` : '';
  await reply(ctx,
    `✅ ${escapeHtml(payerName)} paid ${formatCurrency(amount)}${labelText}\nSplit:\n${memberLines.join('\n')}`);
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

async function handleDelete(ctx) {
  pollinateCache(ctx);
  const groupId = String(ctx.chat.id);
  const { mode, index, error } = parseDeleteArgs(ctx.message.text || '');
  if (error) { await reply(ctx, formatError(error, 'Use: /delete N (1–N)', '/delete 2')); return; }

  const txs = store.getGroupTransactions(groupId).slice(-20).reverse();
  if (mode === 'list') {
    if (txs.length === 0) { await reply(ctx, 'No transactions to delete.'); return; }
    const lines = txs.map((t, idx) => {
      if (t.type === 'settlement')
        return `${idx + 1}. ${escapeHtml(store.getName(t.from))} → ${escapeHtml(store.getName(t.to))}: ${formatCurrency(t.amount)}`;
      const payer = Object.keys(t.contributions)[0];
      const labelTxt = t.label ? ` (${escapeHtml(t.label)})` : '';
      return `${idx + 1}. ${escapeHtml(store.getName(payer))} paid ${formatCurrency(t.amount)}${labelTxt}`;
    });
    await reply(ctx, 'Recent transactions (use /delete N):\n' + lines.join('\n'));
    return;
  }

  if (index < 1 || index > txs.length) {
    await reply(ctx, formatError(`No transaction #${index}.`, 'Use /delete to see the list.', '/delete'));
    return;
  }
  const target = txs[index - 1];
  store.deleteTransaction(target.id, groupId);
  await reply(ctx, `🗑 Deleted transaction #${index}.`);
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
  handleHelp, handleBalances, handleSummary,
  handlePaid, handleGot, handleSplit,
  handleHistory, handleDelete, handleResetAll,
};

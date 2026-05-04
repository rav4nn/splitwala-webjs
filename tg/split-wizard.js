'use strict';

const { InlineKeyboard } = require('grammy');
const memberCache  = require('./member-cache');
const store        = require('./store-tg');
const { parseSplitIntent } = require('./llm-parser');
const { generateId, formatCurrency } = require('../core/identity');

// ── Wizard state store ────────────────────────────────────────────────────────
// Keyed by "chatId:userId" — one active wizard per user per chat.

const wizards = new Map();
const WIZARD_TTL = 5 * 60 * 1000; // 5 minutes

function wizardKey(chatId, userId) { return `${chatId}:${userId}`; }

function getWizard(chatId, userId) {
  const w = wizards.get(wizardKey(chatId, userId));
  if (!w) return null;
  if (Date.now() - w.createdAt > WIZARD_TTL) {
    wizards.delete(wizardKey(chatId, userId));
    return null;
  }
  return w;
}

function setWizard(chatId, userId, state) {
  wizards.set(wizardKey(chatId, userId), { ...state, createdAt: Date.now() });
}

function clearWizard(chatId, userId) {
  wizards.delete(wizardKey(chatId, userId));
}

// ── Callback data encoding ────────────────────────────────────────────────────
// Format: s:<action>:<value>:<senderId>
// senderId is embedded so the guard check doesn't need sessions.
// All parts fit within Telegram's 64-byte callback_data limit.

function cd(action, value, senderId) {
  return `s:${action}:${value}:${senderId}`;
}

function parseCallbackData(data) {
  if (!data || !data.startsWith('s:')) return null;
  const parts = data.split(':');
  if (parts.length < 3) return null;
  const senderId = parts[parts.length - 1];
  const action   = parts[1];
  const value    = parts.slice(2, -1).join(':'); // handles colons in value
  return { action, value, senderId };
}

// ── Keyboard builders ─────────────────────────────────────────────────────────

function buildPayerKeyboard(members, senderId) {
  const kb = new InlineKeyboard();
  kb.text('You (I paid)', cd('payer', senderId, senderId));
  let col = 1;
  for (const m of members) {
    if (m.userId === senderId) continue;
    if (col % 3 === 0) kb.row();
    kb.text(m.firstName, cd('payer', m.userId, senderId));
    col++;
  }
  return kb;
}

function buildParticipantKeyboard(members, selected, senderId) {
  const kb = new InlineKeyboard();
  let col = 0;
  for (const m of members) {
    if (col > 0 && col % 3 === 0) kb.row();
    const tick = selected.has(m.userId) ? '✓ ' : '';
    kb.text(`${tick}${m.firstName}`, cd('toggle', m.userId, senderId));
    col++;
  }
  kb.row();
  if (selected.size >= 2) {
    kb.text(`Done (${selected.size} people) ✓`, cd('done', '', senderId));
  } else {
    kb.text('Select at least 2 people', cd('noop', '', senderId));
  }
  return kb;
}

function buildConfirmKeyboard(senderId) {
  return new InlineKeyboard()
    .text('✅ Add expense', cd('confirm', '', senderId))
    .text('✗ Cancel',      cd('cancel',  '', senderId));
}

// ── Display helpers ───────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function displayName(userId, chatId) {
  const stored = store.getName(userId);
  if (stored && !stored.startsWith('…')) return stored;
  const m = memberCache.getKnownMembers(chatId).find(k => k.userId === userId);
  return m ? (m.name || m.firstName) : stored;
}

function buildConfirmText(w) {
  const label    = w.label ? `<b>${escHtml(w.label)}</b> — ` : '';
  const payerN   = escHtml(displayName(w.payer, w.chatId));
  const count    = w.participants.length;
  const share    = Math.round((w.amount / count) * 100) / 100;
  const lines    = w.participants.map(uid => `• ${escHtml(displayName(uid, w.chatId))}: ${formatCurrency(share)}`);
  return [
    `${label}${formatCurrency(w.amount)}`,
    `Paid by: ${payerN}`,
    `Split equally (${count} people):`,
    ...lines,
    '',
    'Confirm?',
  ].join('\n');
}

// ── Participant resolution from LLM output ────────────────────────────────────

function resolveParticipants(llmParticipants, senderId, chatId) {
  if (!llmParticipants || llmParticipants === 'ALL') return null; // needs keyboard

  const resolved = [];
  for (const p of llmParticipants) {
    if (!p) continue;
    const lp = String(p).toLowerCase();
    if (lp === 'sender' || lp === 'me' || lp === 'i' || lp === 'mera' || lp === 'main' || lp === 'mai') {
      resolved.push(senderId);
      continue;
    }
    const uname = String(p).replace(/^@/, '');
    const byUsername = memberCache.lookupByUsername(chatId, uname);
    if (byUsername) { resolved.push(byUsername.id); continue; }
    const byName = memberCache.lookupByName(chatId, p);
    if (byName) { resolved.push(byName.id); continue; }
    return null; // unresolvable → fall back to keyboard
  }

  const deduped = [...new Set(resolved)];
  if (!deduped.includes(senderId)) deduped.push(senderId);
  return deduped;
}

// ── Core wizard stepper ───────────────────────────────────────────────────────

async function advanceSplitWizard(ctx, w) {
  const { chatId, userId: senderId } = w;

  // Step 1 — need amount
  if (w.amount === null || w.amount === undefined) {
    w.step = 'amount';
    const msg = await ctx.reply('💬 How much was it? Reply with the amount (e.g. 1500).');
    w.questionMsgIds.push(msg.message_id);
    setWizard(chatId, senderId, w);
    return;
  }

  // Step 2 — need payer
  if (!w.payer) {
    w.step = 'payer';
    const members = memberCache.getKnownMembers(chatId);
    if (members.length === 0) {
      // No cached members yet; default payer to sender
      w.payer = senderId;
      setWizard(chatId, senderId, w);
      return advanceSplitWizard(ctx, w);
    }
    const kb  = buildPayerKeyboard(members, senderId);
    const msg = await ctx.reply('Who paid?', { reply_markup: kb });
    w.questionMsgIds.push(msg.message_id);
    setWizard(chatId, senderId, w);
    return;
  }

  // Step 3 — need participants
  if (!w.participants) {
    w.step = 'participants';
    const members = memberCache.getKnownMembers(chatId);
    if (members.length < 2) {
      // Cache too sparse to show a useful toggle keyboard.
      // Only proceed if payer and sender are different people (2 participants).
      const fallback = [...new Set([w.payer, senderId])];
      if (fallback.length < 2) {
        await ctx.reply(
          "I don't know anyone else in this group yet.\n" +
          'Tag people with @username in your /split message, or have others send a message first.'
        );
        clearWizard(chatId, senderId);
        return;
      }
      w.participants = fallback;
      setWizard(chatId, senderId, w);
      return advanceSplitWizard(ctx, w);
    }

    if (!w.participantsToggle) {
      // Pre-select all if LLM said "ALL", otherwise only sender
      w.participantsToggle = w.llmWasAll
        ? members.map(m => m.userId)
        : [senderId];
    }

    const selected = new Set(w.participantsToggle);
    const kb  = buildParticipantKeyboard(members, selected, senderId);
    const note = w.llmWasAll
      ? '\n<i>These are all the members I know. Tap to adjust.</i>'
      : '\n<i>Tap names to select, then tap Done.</i>';
    const msg = await ctx.reply(`Who\'s splitting?${note}`, { parse_mode: 'HTML', reply_markup: kb });
    w.questionMsgIds.push(msg.message_id);
    setWizard(chatId, senderId, w);
    return;
  }

  // All info gathered — show confirmation
  if (w.participants.length < 2) {
    await cleanupQuestions(ctx, w);
    await ctx.reply('❌ Need at least 2 people to split. Use /split to try again.');
    clearWizard(chatId, senderId);
    return;
  }

  w.step = 'confirm';
  const confirmText = buildConfirmText(w);
  const kb  = buildConfirmKeyboard(senderId);
  const msg = await ctx.reply(confirmText, { parse_mode: 'HTML', reply_markup: kb });
  w.confirmMsgId = msg.message_id;
  setWizard(chatId, senderId, w);
}

// ── Cleanup helpers ───────────────────────────────────────────────────────────

async function cleanupQuestions(ctx, w) {
  for (const id of w.questionMsgIds) {
    try { await ctx.api.deleteMessage(w.chatId, id); } catch (_) {}
  }
  w.questionMsgIds = [];
}

// ── Text message handler (intercepts amount replies) ──────────────────────────

async function handleWizardText(ctx) {
  const chatId   = String(ctx.chat.id);
  const senderId = String(ctx.from.id);
  const w = getWizard(chatId, senderId);
  if (!w || w.step !== 'amount') return false;

  // Remove the "how much?" prompt
  const lastPromptId = w.questionMsgIds.at(-1);
  if (lastPromptId) {
    try { await ctx.api.deleteMessage(chatId, lastPromptId); } catch (_) {}
    w.questionMsgIds = w.questionMsgIds.slice(0, -1);
  }

  const raw    = (ctx.message.text || '').replace(/[,₹\s]/g, '');
  const amount = parseFloat(raw);
  if (!amount || amount <= 0) {
    const msg = await ctx.reply('❌ Couldn\'t parse that as an amount. Reply with a number (e.g. 1500):');
    w.questionMsgIds.push(msg.message_id);
    setWizard(chatId, senderId, w);
    return true;
  }

  w.amount = amount;
  w.step   = null;
  setWizard(chatId, senderId, w);
  await advanceSplitWizard(ctx, w);
  return true;
}

// ── Callback query handler ────────────────────────────────────────────────────

async function handleSplitCallback(ctx) {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith('s:')) return false;

  const parsed = parseCallbackData(data);
  if (!parsed) return false;

  const { action, value, senderId } = parsed;

  // Guard: only the wizard owner interacts
  if (String(ctx.from.id) !== senderId) {
    await ctx.answerCallbackQuery({ text: '🚫 Not your split — start one with /split' });
    return true;
  }

  const chatId = String(ctx.chat.id);
  const w = getWizard(chatId, senderId);

  if (!w) {
    await ctx.answerCallbackQuery({ text: '⏱ Wizard expired. Start again with /split' });
    try { await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() }); } catch (_) {}
    return true;
  }

  // ── Payer selected ──────────────────────────────────────────────────────────
  if (action === 'payer') {
    w.payer = value;
    w.step  = null;
    setWizard(chatId, senderId, w);
    try { await ctx.deleteMessage(); } catch (_) {}
    w.questionMsgIds = w.questionMsgIds.filter(id => id !== ctx.callbackQuery.message?.message_id);
    await ctx.answerCallbackQuery();
    await advanceSplitWizard(ctx, w);
    return true;
  }

  // ── Participant toggled ─────────────────────────────────────────────────────
  if (action === 'toggle') {
    const sel = new Set(w.participantsToggle || []);
    if (sel.has(value)) sel.delete(value);
    else sel.add(value);
    w.participantsToggle = [...sel];
    setWizard(chatId, senderId, w);
    const members = memberCache.getKnownMembers(chatId);
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: buildParticipantKeyboard(members, sel, senderId) });
    } catch (_) {}
    await ctx.answerCallbackQuery();
    return true;
  }

  // ── Participants done ───────────────────────────────────────────────────────
  if (action === 'done') {
    const sel = w.participantsToggle || [];
    if (sel.length < 2) {
      await ctx.answerCallbackQuery({ text: 'Select at least 2 people first.' });
      return true;
    }
    w.participants = sel;
    w.step = null;
    setWizard(chatId, senderId, w);
    try { await ctx.deleteMessage(); } catch (_) {}
    w.questionMsgIds = w.questionMsgIds.filter(id => id !== ctx.callbackQuery.message?.message_id);
    await ctx.answerCallbackQuery();
    await advanceSplitWizard(ctx, w);
    return true;
  }

  // ── Noop (disabled Done button) ─────────────────────────────────────────────
  if (action === 'noop') {
    await ctx.answerCallbackQuery({ text: 'Select at least 2 people first.' });
    return true;
  }

  // ── Confirmed ───────────────────────────────────────────────────────────────
  if (action === 'confirm') {
    await ctx.answerCallbackQuery();
    clearWizard(chatId, senderId);

    // Register names so future store.getName() works
    for (const m of memberCache.getKnownMembers(chatId)) {
      if (w.participants.includes(m.userId) || m.userId === w.payer) {
        store.registerName(m.userId, m.name || m.firstName);
      }
    }

    const participants  = w.participants;
    const count         = participants.length;
    const share         = Math.round((w.amount / count) * 100) / 100;
    const contributions = { [w.payer]: w.amount };
    const liabilities   = {};
    const balanceDeltas = [];

    for (const uid of participants) {
      liabilities[uid] = share;
      if (uid !== w.payer) {
        store.updateBalance(w.groupId, uid, w.payer, share);
        balanceDeltas.push({ debtor: uid, creditor: w.payer, amount: share });
      }
    }

    store.addTransaction({
      id:           generateId(),
      type:         'expense',
      groupId:      w.groupId,
      timestamp:    new Date().toISOString(),
      amount:       w.amount,
      label:        w.label,
      contributions,
      liabilities,
      participants,
      balanceDeltas,
      message_id:   String(w.originalMsgId),
    });

    // Render a tg://user inline mention for known numeric IDs; fall back to
    // @username plain text (Telegram auto-links it) for username-only entries.
    const allMembers = memberCache.getKnownMembers(chatId);
    const renderName = (uid) => {
      if (String(uid).startsWith('@')) return escHtml(String(uid));
      const m    = allMembers.find(k => k.userId === uid);
      const name = m ? escHtml(m.name || m.firstName) : escHtml(store.getName(uid));
      return `<a href="tg://user?id=${uid}">${name}</a>`;
    };

    const labelTxt = w.label ? ` for <b>${escHtml(w.label)}</b>` : '';
    const payerN   = renderName(w.payer);
    const lines    = participants.map(uid => `• ${renderName(uid)}: ${formatCurrency(share)}`);
    const result   = `✅ ${payerN} paid ${formatCurrency(w.amount)}${labelTxt}\nSplit:\n${lines.join('\n')}`;

    // Edit confirm message → final result (removes buttons)
    try { await ctx.editMessageText(result, { parse_mode: 'HTML' }); } catch (_) {
      await ctx.reply(result, { parse_mode: 'HTML' });
    }
    // Delete wizard question messages
    await cleanupQuestions(ctx, w);
    return true;
  }

  // ── Cancelled ───────────────────────────────────────────────────────────────
  if (action === 'cancel') {
    await ctx.answerCallbackQuery();
    clearWizard(chatId, senderId);
    try { await ctx.editMessageText('❌ Split cancelled.'); } catch (_) {}
    await cleanupQuestions(ctx, w);
    return true;
  }

  return false;
}

// ── Entry point: start a new split wizard ─────────────────────────────────────

async function startSplitWizard(ctx) {
  const chatId   = String(ctx.chat.id);
  const senderId = String(ctx.from.id);
  const text     = ctx.message?.text || '';

  clearWizard(chatId, senderId);

  // ── Step A: extract explicit @mentions from Telegram entities ───────────────
  // This is more reliable than LLM for participant resolution — Telegram gives
  // us the exact username even if the user has never sent a message (not cached).
  const entityParticipantIds = [];
  for (const e of (ctx.message?.entities || [])) {
    if (e.type === 'mention') {
      const uname = text.slice(e.offset + 1, e.offset + e.length).toLowerCase();
      if (!uname) continue;
      const cached = memberCache.lookupByUsername(chatId, uname);
      const uid = cached ? cached.id : `@${uname}`;
      // Register a placeholder name so store.getName() shows something readable
      if (!cached) store.registerName(uid, `@${uname}`);
      entityParticipantIds.push(uid);
    } else if (e.type === 'text_mention' && e.user) {
      memberCache.recordMember(chatId, e.user);
      entityParticipantIds.push(String(e.user.id));
    }
  }
  // Always include sender
  if (!entityParticipantIds.includes(senderId)) entityParticipantIds.push(senderId);
  const hasExplicitMentions = entityParticipantIds.length >= 2;

  // ── Step B: LLM parse for amount, label, payer intent ──────────────────────
  let intent = { amount: null, payer: null, participants: null, label: null, confidence: 'low' };
  try {
    intent = await parseSplitIntent(text, memberCache.getKnownMembers(chatId));
  } catch (err) {
    console.error('[split-wizard] LLM error:', err.message);
  }

  // Resolve payer
  let payer = null;
  if (intent.payer === 'SENDER') {
    payer = senderId;
  } else if (intent.payer && intent.payer.startsWith('@')) {
    const m = memberCache.lookupByUsername(chatId, intent.payer.slice(1));
    payer = m ? m.id : null;
  }

  // ── Step C: decide participants ─────────────────────────────────────────────
  // Prefer entity mentions (Telegram-verified) over LLM guesses.
  let participants = null;
  let llmWasAll   = false;
  if (hasExplicitMentions) {
    participants = [...new Set(entityParticipantIds)];
  } else {
    llmWasAll    = intent.participants === 'ALL';
    participants = resolveParticipants(intent.participants, senderId, chatId);
  }

  const w = {
    userId:             senderId,
    chatId,
    groupId:            chatId,
    originalMsgId:      ctx.message.message_id,
    step:               null,
    amount:             typeof intent.amount === 'number' && intent.amount > 0 ? intent.amount : null,
    label:              intent.label || null,
    payer,
    participants,
    participantsToggle: null,
    llmWasAll,
    questionMsgIds:     [],
    confirmMsgId:       null,
  };

  setWizard(chatId, senderId, w);
  await advanceSplitWizard(ctx, w);
}

module.exports = { startSplitWizard, handleSplitCallback, handleWizardText, getWizard };

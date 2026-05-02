/**
 * adminHandlers.js — Admin/utility command handlers: /history /delete /resetall
 */

const {
  stripSuffix,
  getName,
  formatCurrency,
  getMentionedPhones,
  cacheNames,
  getCachedDisplayNames,
  getSimplifiedBalances,
  getParticipants,
  normalizeUserId,
  getGroupTransactions,
  deleteTransaction,
  resetAllGroupData,
} = require('./store');
const { parseHistoryArgs, parseDeleteArgs, parseResetAllArgs } = require('./core/parser');

const LID_RESOLUTION_NOTE =
  'The numerical ID will auto-resolve to actual group member once they interact in the group.';

function appendLidResolutionNote(text) {
  if (!text || text.includes(LID_RESOLUTION_NOTE)) return text;
  // LID-like IDs are long numeric tokens that can appear as "@123..." or plain "123..."
  if (!/(?:^|[\s@])\d{13,}(?!\d)/.test(text)) return text;
  return `${text}\n\n${LID_RESOLUTION_NOTE}`;
}


// ─── Pending confirmations ────────────────────────────────────────────────────
//
// Destructive commands (/delete, /resetall) require a follow-up "confirm"
// within 60 seconds to prevent accidental data loss.

const pending      = new Map();
const CONFIRM_TTL  = 60_000;

function setPending(userPhone, groupId, data) {
  pending.set(`${userPhone}_${groupId}`, { ...data, expiresAt: Date.now() + CONFIRM_TTL });
}

function getPending(userPhone, groupId) {
  const key   = `${userPhone}_${groupId}`;
  const entry = pending.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    pending.delete(key);
    return null;
  }
  return entry;
}

function clearPending(userPhone, groupId) {
  pending.delete(`${userPhone}_${groupId}`);
}

function cleanExpired() {
  const now = Date.now();
  for (const [key, entry] of pending) {
    if (now > entry.expiresAt) pending.delete(key);
  }
}

/**
 * Get transaction statistics for a group
 * Returns { count: number, totalVolume: number }
 */
function getGroupTransactionStats(groupId) {
  const groupTransactions = getGroupTransactions(groupId);
  
  const count = groupTransactions.length;
  const totalVolume = groupTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  
  return {
    count,
    totalVolume: Math.round(totalVolume * 100) / 100
  };
}

/**
 * Check if a reset is already pending for a group (any user)
 * Returns the pending entry if exists, null otherwise
 */
function getPendingResetForGroup(groupId) {
  for (const [key, entry] of pending) {
    if (key.endsWith(`_${groupId}`) && entry.type === 'resetall') {
      return entry;
    }
  }
  return null;
}


// ─── Display helpers ──────────────────────────────────────────────────────────

function formatTimestamp(isoString) {
  const d      = new Date(isoString);
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  const pad    = n => String(n).padStart(2, '0');
  const hours  = d.getHours() % 12 || 12;
  const ampm   = d.getHours() >= 12 ? 'PM' : 'AM';
  return `${d.getDate()} ${months[d.getMonth()]}, ${hours}:${pad(d.getMinutes())} ${ampm}`;
}

/**
 * Get display name for a user ID with caching
 * Returns clean display name (no @ prefix, no phone numbers)
 */
async function getDisplayName(client, userId) {
  const phone = userId.split("@")[0];
  try {
    const contact = await client.getContactById(userId);
    return contact.pushname || contact.name || getName(phone);
  } catch {
    return getName(phone);
  }
}


/**
 * Format transaction for clean display (no mentions, no IDs)
 * Returns formatted string in new UX format
 */
async function formatTransactionClean(client, tx, index) {
  const date = formatTimestamp(tx.timestamp);
  
  // Use label if exists, otherwise use description (for backward compatibility)
  const label = tx.label || tx.description || null;
  const amountStr = formatCurrency(tx.amount);
  const header = label ? `${amountStr} — ${label}` : amountStr;

  if (tx.type === 'expense') {
    // Get all user IDs involved
    const allUserIds = getTxPhones(tx).map(phone => `${phone}@c.us`);
    const nameCache = await getCachedDisplayNames(client, allUserIds);

    // Get payer(s)
    let payerText = '';
    if (tx.contributions) {
      const payers = Object.entries(tx.contributions);
      if (payers.length === 1) {
        const [payerPhone] = payers[0];
        const payerId = `${payerPhone}@c.us`;
        const payerName = nameCache.get(payerId) || payerPhone;
        payerText = `Paid by: ${payerName}`;
      } else {
        const payerNames = payers.map(([p]) => {
          const payerId = `${p}@c.us`;
          return nameCache.get(payerId) || p;
        });
        payerText = `Paid by: ${payerNames.join(', ')}`;
      }
    } else {
      // Legacy schema
      const payerId = `${tx.paidBy}@c.us`;
      const payerName = nameCache.get(payerId) || tx.paidBy;
      payerText = `Paid by: ${payerName}`;
    }

    // Get participants (excluding payers)
    const participants = (tx.participants || []).filter(p => {
      if (tx.contributions) {
        return !Object.keys(tx.contributions).includes(p);
      }
      return p !== tx.paidBy;
    });

    let participantsText = '';
    if (participants.length > 0) {
      const participantNames = participants.map(p => {
        const participantId = `${p}@c.us`;
        return nameCache.get(participantId) || p;
      });
      participantsText = `Split between: ${participantNames.join(', ')}`;
    } else {
      participantsText = 'No other participants';
    }

    return `[${index}] 💸 ${header} — ${date}\n${payerText}\n${participantsText}`;
  }

  // Payment transaction
  const from = tx.from || tx.paidBy;
  const to = tx.to || (tx.participants || []).find(p => p !== tx.paidBy);

  const fromId = `${from}@c.us`;
  const toId = `${to}@c.us`;
  const nameCache = await getCachedDisplayNames(client, [fromId, toId]);

  const fromName = nameCache.get(fromId) || from;
  const toName = nameCache.get(toId) || to;

  return `[${index}] 💸 ${amountStr} — Payment — ${date}\nPaid by: ${fromName}\nReceived by: ${toName}`;
}

/**
 * Format a transaction for display in /history.
 * Handles both the current schema (with balanceDeltas/contributions) and the
 * legacy schema (paidBy/participants/perShare) for backwards compatibility.
 */
function formatTransaction(tx, index) {
  const date    = formatTimestamp(tx.timestamp);
  
  // Use label if exists, otherwise use description (for backward compatibility)
  const label = tx.label || tx.description || null;
  const labelStr = label ? ` — ${label}` : '';

  if (tx.type === 'expense') {
    let paidStr;
    if (tx.contributions) {
      const payers = Object.entries(tx.contributions);
      paidStr = payers.length === 1
        ? `${getName(payers[0][0])} paid ${formatCurrency(tx.amount)}`
        : payers.map(([p, a]) => `${getName(p)} (${formatCurrency(a)})`).join(', ')
            + ` paid ${formatCurrency(tx.amount)} total`;
    } else {
      // Legacy schema
      paidStr = `${getName(tx.paidBy)} paid ${formatCurrency(tx.amount)}`;
    }
    
    // Choose emoji based on label presence
    const emoji = label ? '🍽️' : '📤';
    return `[${index}] ${emoji} Expense${labelStr} — ${date}\n    ${paidStr}\n    ID: ${tx.id}`;
  }

  // Payment
  const from = tx.from || tx.paidBy;
  const to   = tx.to   || (tx.participants || []).find(p => p !== tx.paidBy);
  return `[${index}] 💸 Payment — ${date}\n    ${getName(from)} → ${getName(to)} ${formatCurrency(tx.amount)}\n    ID: ${tx.id}`;
}

/** All phone numbers involved in a transaction. */
function getTxPhones(tx) {
  return [...new Set([
    ...(tx.participants || []),
    tx.paidBy, tx.from, tx.to,
  ].filter(Boolean))];
}

/**
 * Get transaction by index (1-based) for a group
 * Returns transaction or null if index is invalid
 * Uses most-recent-first ordering (same as /history)
 */
function getTransactionByIndex(groupId, index) {
  const groupTxs = getGroupTransactions(groupId);
  if (index < 1 || index > groupTxs.length) {
    return null;
  }
  // Most recent first (reverse order)
  const reversedTxs = [...groupTxs].reverse();
  return reversedTxs[index - 1];
}

/**
 * Format transaction for enhanced delete list display
 * Returns formatted string without ID
 */
function formatTransactionForDeleteList(tx, index) {
  const date = formatTimestamp(tx.timestamp);
  
  // Use label if exists, otherwise use description (for backward compatibility)
  const label = tx.label || tx.description || null;
  
  // Choose emoji based on label presence
  const emoji = label ? '🍽️' : '💸';
  const labelText = label ? ` ${label}` : ' Expense';
  
  if (tx.type === 'expense') {
    // Get payer(s)
    let payerText = '';
    if (tx.contributions) {
      const payers = Object.entries(tx.contributions);
      if (payers.length === 1) {
        payerText = `Paid by: @${payers[0][0]}`;
      } else {
        payerText = `Paid by: ${payers.map(([p]) => `@${p}`).join(', ')}`;
      }
    } else {
      // Legacy schema
      payerText = `Paid by: @${tx.paidBy}`;
    }
    
    // Get participants (excluding payers)
    const participants = (tx.participants || []).filter(p => {
      if (tx.contributions) {
        return !Object.keys(tx.contributions).includes(p);
      }
      return p !== tx.paidBy;
    });
    
    let participantsText = '';
    if (participants.length > 0) {
      participantsText = `Split between: ${participants.map(p => `@${p}`).join(', ')}`;
    } else {
      participantsText = 'No other participants';
    }
    
    return `[${index}] ${emoji}${labelText} — ${date}\n${payerText}\n${participantsText}`;
  }

  // Payment transaction
  const from = tx.from || tx.paidBy;
  const to = tx.to || (tx.participants || []).find(p => p !== tx.paidBy);
  return `[${index}] 💸 Payment — ${date}\nPaid by: @${from}\nReceived by: @${to}`;
}

/**
 * Format transaction for delete confirmation preview
 * Returns formatted string without ID
 */
function formatTransactionForDeletePreview(tx, index) {
  const date = formatTimestamp(tx.timestamp);
  
  // Use label if exists, otherwise use description (for backward compatibility)
  const label = tx.label || tx.description || null;
  
  // Choose emoji based on label presence
  const emoji = label ? '🍽️' : '💸';
  const labelText = label ? ` ${label}` : ' Expense';
  
  if (tx.type === 'expense') {
    // Get payer(s)
    let payerText = '';
    if (tx.contributions) {
      const payers = Object.entries(tx.contributions);
      if (payers.length === 1) {
        payerText = `Paid by: @${payers[0][0]}`;
      } else {
        payerText = `Paid by: ${payers.map(([p]) => `@${p}`).join(', ')}`;
      }
    } else {
      // Legacy schema
      payerText = `Paid by: @${tx.paidBy}`;
    }
    
    // Get participants (excluding payers)
    const participants = (tx.participants || []).filter(p => {
      if (tx.contributions) {
        return !Object.keys(tx.contributions).includes(p);
      }
      return p !== tx.paidBy;
    });
    
    let participantsText = '';
    if (participants.length > 0) {
      participantsText = `Split between: ${participants.map(p => `@${p}`).join(', ')}`;
    } else {
      participantsText = 'No other participants';
    }
    
    return `[${index}] ${emoji}${labelText} — ${date}\n${payerText}\n${participantsText}`;
  }

  // Payment transaction
  const from = tx.from || tx.paidBy;
  const to = tx.to || (tx.participants || []).find(p => p !== tx.paidBy);
  return `[${index}] 💸 Payment — ${date}\nPaid by: @${from}\nReceived by: @${to}`;
}



// ─── /resetall ────────────────────────────────────────────────────────────────

async function handleResetAll(msg, client) {
  const chatId   = msg.from;
  const senderId = stripSuffix(msg.author || msg.from);
  const { confirmed } = parseResetAllArgs(msg.body);

  cleanExpired();
  
  if (!confirmed) {
    // INITIATE RESET REQUEST
    
    // Check if a reset is already pending for this group
    const existingPending = getPendingResetForGroup(chatId);
    if (existingPending) {
      await client.sendMessage(chatId, '⚠️ A reset request is already pending for this group.');
      return;
    }
    
    // Get transaction statistics
    const stats = getGroupTransactionStats(chatId);
    
    // Store pending reset with initiator ID
    setPending(senderId, chatId, { 
      type: 'resetall',
      initiatorId: senderId,
      stats: stats
    });
    
    // Format confirmation message
    const confirmationMessage = 
`⚠️ *DANGER: RESET ALL DATA*

This will permanently delete ALL transactions and balances for this group.

Transactions: ${stats.count}
Total volume: ${formatCurrency(stats.totalVolume)}

To confirm, type exactly:

/resetall confirm

⏳ This will expire in 60 seconds.`;
    
    await client.sendMessage(chatId, confirmationMessage);
    return;
  }
  
  // CONFIRMATION HANDLING
  
  // Get pending reset
  const pendingReset = getPending(senderId, chatId);
  
  // Edge case 1: No pending reset found
  if (!pendingReset) {
    await client.sendMessage(chatId, '❌ No reset request found. Use /resetall first.');
    return;
  }
  
  // Edge case 2: Wrong type
  if (pendingReset.type !== 'resetall') {
    await client.sendMessage(chatId, '❌ No reset request found. Use /resetall first.');
    return;
  }
  
  // Edge case 3: Expired
  if (Date.now() > pendingReset.expiresAt) {
    clearPending(senderId, chatId);
    await client.sendMessage(chatId, '❌ Reset request expired. Please run /resetall again.');
    return;
  }
  
  // Edge case 4: Different user trying to confirm
  if (pendingReset.initiatorId !== senderId) {
    await client.sendMessage(chatId, '❌ Only the user who initiated the reset can confirm this action.');
    return;
  }
  
  // All checks passed - proceed with reset
  
  // Clear pending reset
  clearPending(senderId, chatId);

  // Build summary with @mentions BEFORE clearing data (same approach as /summary)
  const chat = await msg.getChat();
  const simplified = getSimplifiedBalances(chatId);

  // Build participantMap for mentions — same canonical-key logic as /summary
  const participantMap = {};
  for (const p of (chat.participants || [])) {
    if (!p.id._serialized.endsWith('@c.us')) continue;
    const phone = stripSuffix(p.id._serialized);
    const canonical = normalizeUserId(phone);
    if (!participantMap[phone])    participantMap[phone]    = p.id._serialized;
    if (canonical !== phone && !participantMap[canonical]) participantMap[canonical] = p.id._serialized;
  }

  // Clear all transactions and balances for this group (atomic)
  resetAllGroupData(chatId);

  // Send response with summary and confirmation
  const suffix = '\n\n🗑️ All transactions and balances for this group have been cleared.';

  if (simplified.length === 0) {
    const hadParticipants = getParticipants(chatId).length > 0;
    const response = hadParticipants
      ? `✅ All settled up!${suffix}`
      : `✅ No balances to settle.${suffix}`;
    await client.sendMessage(chatId, response);
    return;
  }

  const lines = [];
  const mentions = [];
  for (const tx of simplified) {
    const fromPhone  = normalizeUserId(tx.from);
    const toPhone    = normalizeUserId(tx.to);
    const fromFullId = participantMap[tx.from] || participantMap[fromPhone];
    const toFullId   = participantMap[tx.to]   || participantMap[toPhone];
    const fromText   = fromFullId ? `@${fromPhone}` : getName(tx.from);
    const toText     = toFullId   ? `@${toPhone}`   : getName(tx.to);
    lines.push(`${fromText} owes ${toText} ${formatCurrency(tx.amount)}`);
    if (fromFullId && !mentions.includes(fromFullId)) mentions.push(fromFullId);
    if (toFullId   && !mentions.includes(toFullId))   mentions.push(toFullId);
  }

  const response = `💰 Final Summary before reset:\n\n${lines.join('\n')}${suffix}`;
  await client.sendMessage(chatId, appendLidResolutionNote(response), mentions.length > 0 ? { mentions } : {});
}


// ─── /history ─────────────────────────────────────────────────────────────────

async function handleHistory(msg, client) {
  const chatId   = msg.from;
  const senderId = stripSuffix(msg.author || msg.from);
  cleanExpired();

  const { count, filterToken, error: histErr } = parseHistoryArgs(msg.body);
  if (histErr) {
    await client.sendMessage(chatId, `❌ ${histErr}`);
    return;
  }

  let targetPhone = null;

  if (filterToken) {
    if (filterToken.toLowerCase() === 'me') {
      targetPhone = senderId;
    } else if (filterToken.startsWith('@')) {
      targetPhone = filterToken.slice(1);
    }
  }

  // @mention overrides any text-based target
  const mentioned = getMentionedPhones(msg);
  if (mentioned.length > 0) targetPhone = mentioned[0];

  let txs = getGroupTransactions(chatId);

  if (targetPhone) {
    txs = txs.filter(tx => (tx.participants || []).includes(targetPhone));
  }

  if (txs.length === 0) {
    await client.sendMessage(chatId, 'No transactions found.');
    return;
  }

  const lastN = txs.slice(-count).reverse();
  
  // Format transactions with clean display names (no mentions)
  const blocks = [];
  for (let i = 0; i < lastN.length; i++) {
    const tx = lastN[i];
    const formatted = await formatTransactionClean(client, tx, i + 1);
    blocks.push(formatted);
  }
  
  await client.sendMessage(chatId, appendLidResolutionNote(blocks.join('\n\n')));
}


// ─── /delete ──────────────────────────────────────────────────────────────────

async function handleDelete(msg, client) {
  const chatId   = msg.from;
  const senderId = stripSuffix(msg.author || msg.from);
  cleanExpired();

  const { mode, index, error: delErr } = parseDeleteArgs(msg.body);
  if (delErr) {
    await client.sendMessage(chatId, `❌ ${delErr}`);
    return;
  }

  // Step 1: Show transaction list (no arguments)
  if (mode === 'list') {
    // Get all transactions for this group
    const groupTxs = getGroupTransactions(chatId);
    
    if (groupTxs.length === 0) {
      await client.sendMessage(chatId, 'No transactions found.');
      return;
    }
    
    // Show last 10 transactions (most recent first)
    const lastN = groupTxs.slice(-10).reverse();
    
    // Format transactions with clean display names (no mentions)
    const blocks = [];
    for (let i = 0; i < lastN.length; i++) {
      const tx = lastN[i];
      const formatted = await formatTransactionClean(client, tx, i + 1);
      blocks.push(formatted);
    }
    
    const reply = `📋 Recent transactions:\n\n${blocks.join('\n\n')}\n\nTo delete a transaction, type:\n/delete <number>\n\nExample: /delete 2`;
    
    await client.sendMessage(chatId, appendLidResolutionNote(reply));
    return;
  }

  // Step 2: Direct delete when index is provided
  if (mode === 'delete') {
    // Get transaction by index
    const tx = getTransactionByIndex(chatId, index);
    if (!tx) {
      await client.sendMessage(chatId, '❌ Invalid selection. Use /delete to view transactions.');
      return;
    }
    
    // Format transaction preview for deletion confirmation
    const formattedTx = await formatTransactionClean(client, tx, index);
    
    // Reverse balance deltas and remove from DB (atomic)
    deleteTransaction(tx.id, chatId);
    
    // Send deletion confirmation with required format
    const deletionMessage = 
`⚠️ *DELETED TRANSACTION*

${formattedTx}

✅ Transaction has been removed.`;
    
    await client.sendMessage(chatId, appendLidResolutionNote(deletionMessage));
    return;
  }

}

module.exports = { handleResetAll, handleHistory, handleDelete };

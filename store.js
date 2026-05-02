'use strict';
/**
 * store.js — Business-logic data layer backed by SQLite (via db.js)
 *
 * Public API is identical to the original JSON-backed version so that
 * handlers.js needs no changes at all.  adminHandlers.js requires only
 * minimal updates to replace direct `store.transactions` access with the
 * three new helpers exported at the bottom: getGroupTransactions,
 * deleteTransaction, resetAllGroupData.
 */

const {
  setUserName, getUserName,
  registerAlias, resolveAlias, getAliases,
  writeTransaction, getTransaction: dbGetTx,
  getGroupTransactions: dbGetGroupTxs,
  removeTransaction,
  getBalanceAmount, setBalance, getGroupBalances,
  resetGroup: dbResetGroup,
} = require('./db');
const { formatCurrency, generateId } = require('./core/identity');
const { simplifyDebts, roundCurrency } = require('./core/balance');

// ── Identity helpers ───────────────────────────────────────────────────────────

/** Strip the @c.us / @g.us / @lid suffix from a WhatsApp JID. */
function stripSuffix(waId) {
  return waId ? waId.split('@')[0] : waId;
}

/** Extract phone numbers from all @-mentions on a message, normalized to canonical phones. */
function getMentionedPhones(msg) {
  return (msg.mentionedIds || []).map(id => normalizeUserId(stripSuffix(id)));
}

// ── Name cache ─────────────────────────────────────────────────────────────────

function registerName(phone, name) {
  if (name && name.trim()) setUserName(phone, name.trim());
}

function getName(phone) {
  const canonical = normalizeUserId(phone);
  return getUserName(canonical) || `...${String(canonical).slice(-4)}`;
}

// ── User-ID alias system ───────────────────────────────────────────────────────
//
// WhatsApp multi-device assigns Linked-Device IDs (LIDs) that look like phone
// numbers but are NOT real phones.  We map LID → canonical phone so that all
// balance and name lookups use a single stable identifier per person.

/**
 * Register an alias → canonical mapping.
 * aliasType: 'phone' | 'lid' | 'name'
 */
function registerUserMapping(canonicalPhone, aliasId, aliasType) {
  registerAlias(aliasId, canonicalPhone, aliasType || 'phone');
  // Also ensure the canonical itself is registered so findCanonicalPhone
  // returns it when passed the canonical directly.
  registerAlias(canonicalPhone, canonicalPhone, 'phone');
}

/**
 * Return the canonical phone for any user ID (phone, LID, display name).
 * Returns null if no mapping exists.
 */
function findCanonicalPhone(userId) {
  // 1. Direct alias lookup (covers LIDs, alternate phones, name aliases)
  const resolved = resolveAlias(userId);
  if (resolved) return resolved;

  // 2. Check if userId IS already a canonical (has entries as canonical)
  const asCanonical = getAliases(userId);
  if (asCanonical.length > 0) return userId;

  return null;
}

/**
 * Return all known IDs for a canonical phone.
 * Shape: { canonical, phones: [], lids: [], groups: [], names: [] }
 */
function getUserIds(canonicalPhone) {
  const result = {
    canonical: canonicalPhone,
    phones:    [canonicalPhone],
    lids:      [],
    groups:    [],
    names:     [],
  };

  for (const { alias, type } of getAliases(canonicalPhone)) {
    if (alias === canonicalPhone) continue;
    switch (type) {
      case 'phone': result.phones.push(alias); break;
      case 'lid':   result.lids.push(alias);   break;
      case 'group': result.groups.push(alias); break;
      case 'name':  result.names.push(alias);  break;
    }
  }

  return result;
}

/**
 * Normalise any user ID to its canonical phone.
 * Returns the input unchanged if no mapping is found.
 */
function normalizeUserId(userId) {
  return findCanonicalPhone(userId) || userId;
}

/**
 * Auto-discover mappings from a WhatsApp contact object.
 * Works in two modes depending on `phone`:
 *   - phone is a regular @c.us phone  → stays canonical; if contact.id differs,
 *     register contactPhone as an alternate alias of phone.
 *   - phone is a LID (≥15 digits)     → the @c.us contactId is the canonical;
 *     register phone (LID) as alias of contactPhone.
 * Called by cacheNames() and by the @lid resolution loop in ensureGroupCached().
 */
async function discoverAndRegisterMappings(phone, contact) {
  if (!contact) return;

  const name = contact.pushname || contact.name;
  const contactId = contact.id?._serialized;

  let canonicalPhone = phone;
  if (contactId && contactId.endsWith('@c.us')) {
    const contactPhone = stripSuffix(contactId);
    if (phone !== contactPhone) {
      if (/^\d{15,}$/.test(phone)) {
        // Input is a LID — the @c.us contact JID is the real canonical phone
        canonicalPhone = contactPhone;
        registerUserMapping(canonicalPhone, phone, 'lid');
      } else {
        // Input is a @c.us phone — keep it canonical; contactPhone is an alternate
        registerUserMapping(phone, contactPhone, 'phone');
      }
    }
  }

  if (name) {
    // If this name already mapped to a DIFFERENT canonical (stale data from a previous
    // session), register the old canonical as a 'phone' alias of the new one.
    // This lets getNetBetween (which traverses getUserIds().phones) find balances stored
    // under the old key, and makes normalizeUserId(oldPhone) = newPhone so that
    // handleBalances deduplicates the two entries into one.
    const prevCanonical = resolveAlias(name.toLowerCase());
    if (prevCanonical && prevCanonical !== canonicalPhone) {
      registerUserMapping(canonicalPhone, prevCanonical, 'phone');
    }
    registerName(canonicalPhone, name);
    registerAlias(name.toLowerCase(), canonicalPhone, 'name');
  }
}

/**
 * Populate the name cache and refresh alias mappings for a list of phones.
 * Always calls discoverAndRegisterMappings (even if name already cached) so that
 * stale name→canonical aliases are updated whenever the bot encounters a user.
 * Errors are silently ignored.
 */
async function cacheNames(phones, client) {
  for (const phone of phones) {
    try {
      const contact = await client.getContactById(`${phone}@c.us`);
      await discoverAndRegisterMappings(phone, contact);
    } catch (_) {}
  }
}

/**
 * Get display names for multiple user IDs, trying @c.us then @lid JIDs.
 * Persists any found name to SQLite. Falls back to getName() cache.
 * Returns Map<userId, displayName>
 */
async function getCachedDisplayNames(client, userIds) {
  const nameCache = new Map();
  const uniqueIds = [...new Set(userIds.filter(Boolean))];

  await Promise.all(uniqueIds.map(async (userId) => {
    const phone = userId.split('@')[0];
    const canonicalPhone = normalizeUserId(phone);

    const jidsToTry = [
      ...(canonicalPhone !== phone ? [`${canonicalPhone}@c.us`] : []),
      `${phone}@c.us`,
      `${phone}@lid`,
    ];

    for (const jid of jidsToTry) {
      try {
        const contact = await client.getContactById(jid);
        const name = contact.pushname || contact.name;
        if (name) {
          registerName(canonicalPhone, name);
          nameCache.set(userId, name);
          return;
        }
      } catch (_) {}
    }

    nameCache.set(userId, getName(phone));
  }));

  return nameCache;
}

// ── Balance helpers ────────────────────────────────────────────────────────────

/**
 * Adjust the signed balance between two people.
 * Positive amount means debtor owes creditor more; negative reduces debt.
 * Always stores the net in canonical direction only (no mirrored rows).
 */
function updateBalance(groupId, debtorPhone, creditorPhone, amount) {
  const normDebtor   = normalizeUserId(debtorPhone);
  const normCreditor = normalizeUserId(creditorPhone);
  if (normDebtor === normCreditor) return;

  const fwd = getBalanceAmount(groupId, normDebtor,   normCreditor);
  const rev = getBalanceAmount(groupId, normCreditor, normDebtor);
  const net = roundCurrency(fwd - rev + amount);

  if (net > 0) {
    setBalance(groupId, normDebtor,   normCreditor, net);
    setBalance(groupId, normCreditor, normDebtor,   0);
  } else if (net < 0) {
    setBalance(groupId, normCreditor, normDebtor,   -net);
    setBalance(groupId, normDebtor,   normCreditor, 0);
  } else {
    setBalance(groupId, normDebtor,   normCreditor, 0);
    setBalance(groupId, normCreditor, normDebtor,   0);
  }
}

/**
 * Net balance between phone1 and phone2, aggregated across all aliases.
 * Returns { settled: true } when square, or { owes, owedTo, amount }.
 */
function getNetBetween(groupId, phone1, phone2) {
  const norm1    = normalizeUserId(phone1);
  const norm2    = normalizeUserId(phone2);
  const aliases1 = getUserIds(norm1).phones;
  const aliases2 = getUserIds(norm2).phones;

  let p1owesP2 = 0;
  let p2owesP1 = 0;

  for (const a1 of aliases1) {
    for (const a2 of aliases2) {
      if (a1 === a2) continue;
      p1owesP2 += getBalanceAmount(groupId, a1, a2);
      p2owesP1 += getBalanceAmount(groupId, a2, a1);
    }
  }

  const net = roundCurrency(p1owesP2 - p2owesP1);
  if (Math.abs(net) < 0.005) return { settled: true };
  return net > 0
    ? { owes: norm1, owedTo: norm2, amount: net }
    : { owes: norm2, owedTo: norm1, amount: -net };
}

/** Human-readable balance lines for userPhone vs all others in the group. */
function getBalanceSummary(groupId, userPhone, nameFormatter) {
  const fmt     = nameFormatter || getName;
  const others  = new Set();
  const rows    = getGroupBalances(groupId);

  for (const { debtor, creditor } of rows) {
    if (debtor   === userPhone) others.add(creditor);
    if (creditor === userPhone) others.add(debtor);
  }
  others.delete(userPhone);

  return [...others].flatMap(other => {
    const result = getNetBetween(groupId, userPhone, other);
    if (result.settled) return [];
    return result.owes === userPhone
      ? [`• You owe ${fmt(other)} ${formatCurrency(result.amount)}`]
      : [`• ${fmt(other)} owes you ${formatCurrency(result.amount)}`];
  });
}

/** Net amount owed TO userPhone across the group (positive = others owe you). */
function getOverallNet(groupId, userPhone) {
  const normUser    = normalizeUserId(userPhone);
  const userAliases = getUserIds(normUser).phones;
  const rows        = getGroupBalances(groupId);

  let total = 0;
  for (const { debtor, creditor, amount } of rows) {
    if (userAliases.includes(creditor)) total += amount;   // others owe user
    if (userAliases.includes(debtor))   total -= amount;   // user owes others
  }
  return roundCurrency(total);
}

/** All unique phones that have ever appeared in balance rows for this group. */
function getParticipants(groupId) {
  const phones = new Set();
  for (const { debtor, creditor } of getGroupBalances(groupId)) {
    phones.add(normalizeUserId(debtor));
    phones.add(normalizeUserId(creditor));
  }
  return Array.from(phones);
}

/**
 * Compute simplified pairwise balances using a greedy debt-reduction algorithm.
 * Returns [{ from, to, amount }] — the minimal set of payments to settle up.
 */
function getSimplifiedBalances(groupId) {
  const participants = getParticipants(groupId);
  const entries = participants
    .map(phone => ({ id: phone, net: getOverallNet(groupId, phone) }));
  const result = simplifyDebts(entries);
  return result.map(t => ({ from: t.from, to: t.to, amount: t.amount }));
}

/** Returns [{ phone, net }] sorted descending; positive net = owed money. */
function getGroupSummary(groupId) {
  return getParticipants(groupId)
    .map(phone => ({ phone, net: getOverallNet(groupId, phone) }))
    .filter(s => Math.abs(s.net) > 0.005)
    .sort((a, b) => b.net - a.net);
}

/** Ready-to-send summary string for a group. */
function getFormattedSummary(groupId) {
  const simplified = getSimplifiedBalances(groupId);
  if (simplified.length === 0) {
    return getParticipants(groupId).length === 0
      ? 'No expenses recorded yet.'
      : '✅ All settled up!';
  }
  const lines = simplified.map(tx => `@${tx.from} owes @${tx.to} ${formatCurrency(tx.amount)}`);
  return `💰 Final Summary:\n\n${lines.join('\n')}`;
}

// ── Transaction helpers ────────────────────────────────────────────────────────

/**
 * Persist a transaction to SQLite.
 * tx shape matches the existing in-code object produced by /split, /paid, /got.
 */
function addTransaction(tx) {
  writeTransaction({
    id:           tx.id,
    group_id:     tx.groupId,
    type:         tx.type,
    amount:       tx.amount,
    label:        tx.label || tx.description || null,
    timestamp:    tx.timestamp,
    message_id:   tx.message_id || null,
    contributions: tx.contributions || {},
    liabilities:   tx.liabilities  || {},
    participants:  tx.participants  || [],
    balanceDeltas: tx.balanceDeltas || [],
    from:          tx.from,
    to:            tx.to,
  });
}

/**
 * Record a settlement payment (/paid / /got).
 * Updates balances and writes a 'settlement' transaction to history.
 */
function recordSettlement(groupId, fromPhone, toPhone, amount, description) {
  if (fromPhone === toPhone) throw new Error('Cannot record settlement to self');
  if (amount <= 0)           throw new Error('Settlement amount must be positive');

  const normFrom = normalizeUserId(fromPhone);
  const normTo   = normalizeUserId(toPhone);

  updateBalance(groupId, normFrom, normTo, -amount);

  const tx = {
    id:           generateId(),
    type:         'settlement',
    groupId,
    timestamp:    new Date().toISOString(),
    amount,
    description:  description || null,
    from:         normFrom,
    to:           normTo,
    participants: [normFrom, normTo],
    balanceDeltas: [{ debtor: normFrom, creditor: normTo, amount: -amount }],
  };

  addTransaction(tx);
  return tx;
}

// ── Admin helpers (used by adminHandlers.js) ───────────────────────────────────

/**
 * Return all transactions for a group as enriched JS objects (oldest first).
 * Replaces direct `store.transactions.filter(tx => tx.groupId === groupId)`.
 */
function getGroupTransactions(groupId) {
  return dbGetGroupTxs(groupId);
}

/**
 * Reverse a transaction's balance deltas then delete it.
 * Replaces `reverseTransaction(tx)` + `store.transactions.splice(...)` + `saveData()`.
 * Returns the deleted tx object, or null if not found.
 */
function deleteTransaction(txId, groupId) {
  const tx = dbGetTx(txId);
  if (!tx) return null;

  for (const { debtor, creditor, amount } of (tx.balanceDeltas || [])) {
    updateBalance(groupId || tx.groupId, debtor, creditor, -amount);
  }

  removeTransaction(txId);   // CASCADE removes all child rows
  return tx;
}

/**
 * Delete ALL transactions and balances for a group in one atomic operation.
 * Replaces `store.transactions = store.transactions.filter(...)` + `delete store.balances[...]`.
 */
function resetAllGroupData(groupId) {
  dbResetGroup(groupId);
}

// ── Persistence no-ops ─────────────────────────────────────────────────────────
//
// SQLite writes are immediate — no manual flush needed.
// These stubs preserve call sites in index.js without errors.

function loadData() {}
function saveData() {}

// ── Compatibility shim ─────────────────────────────────────────────────────────
//
// `store` is no longer a live object.  adminHandlers.js is updated to use
// the function helpers above, so nothing accesses this object any more.

const store = {};

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  // Kept for backward compat (adminHandlers.js no longer uses it)
  store,

  // Persistence stubs
  loadData, saveData,

  // Identity / formatting
  stripSuffix, getMentionedPhones, formatCurrency, generateId,

  // Name cache
  registerName, getName, cacheNames, getCachedDisplayNames,

  // Alias / ID mapping
  registerUserMapping, findCanonicalPhone, getUserIds,
  normalizeUserId, discoverAndRegisterMappings,

  // Balances
  updateBalance, getNetBetween, getBalanceSummary,
  getOverallNet, getGroupSummary, getSimplifiedBalances, getFormattedSummary,

  // Participants
  getParticipants,

  // Transactions
  addTransaction, recordSettlement,

  // Admin helpers (new — used by adminHandlers.js)
  getGroupTransactions, deleteTransaction, resetAllGroupData,

  // Kept for any callers that import getTransaction directly
  getTransaction: dbGetTx,
};

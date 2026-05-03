'use strict';
/**
 * tg/store-tg.js — Business-logic data layer for the Telegram bot.
 *
 * Same conceptual API as store.js but keyed by Telegram numeric user_id (as a
 * string). NO alias / LID system — Telegram user_ids are stable and unique.
 */

const db = require('./db-tg');
const { simplifyDebts, roundCurrency } = require('../core/balance');
const { formatCurrency, generateId }    = require('../core/identity');

function registerName(userId, name) {
  if (name && name.trim()) db.setUserName(String(userId), name.trim());
}

function getName(userId) {
  const id = String(userId);
  return db.getUserName(id) || `…${id.slice(-4)}`;
}

// ── Balance helpers ──────────────────────────────────────────────────────────

function updateBalance(groupId, debtorId, creditorId, amount) {
  const a = String(debtorId);
  const b = String(creditorId);
  if (a === b) return;
  const fwd = db.getBalanceAmount(groupId, a, b);
  const rev = db.getBalanceAmount(groupId, b, a);
  const net = roundCurrency(fwd - rev + amount);
  if (net > 0) {
    db.setBalance(groupId, a, b, net);
    db.setBalance(groupId, b, a, 0);
  } else if (net < 0) {
    db.setBalance(groupId, b, a, -net);
    db.setBalance(groupId, a, b, 0);
  } else {
    db.setBalance(groupId, a, b, 0);
    db.setBalance(groupId, b, a, 0);
  }
}

function getNetBetween(groupId, idA, idB) {
  const a = String(idA), b = String(idB);
  const aOwesB = db.getBalanceAmount(groupId, a, b);
  const bOwesA = db.getBalanceAmount(groupId, b, a);
  const net = roundCurrency(aOwesB - bOwesA);
  if (Math.abs(net) < 0.005) return { settled: true };
  return net > 0
    ? { owes: a, owedTo: b, amount: net }
    : { owes: b, owedTo: a, amount: -net };
}

function getParticipants(groupId) {
  const set = new Set();
  for (const r of db.getGroupBalances(groupId)) {
    set.add(r.debtor); set.add(r.creditor);
  }
  return [...set];
}

function getOverallNet(groupId, userId) {
  const id = String(userId);
  let total = 0;
  for (const { debtor, creditor, amount } of db.getGroupBalances(groupId)) {
    if (creditor === id) total += amount;
    if (debtor   === id) total -= amount;
  }
  return roundCurrency(total);
}

function getSimplifiedBalances(groupId) {
  const entries = getParticipants(groupId).map(id => ({ id, net: getOverallNet(groupId, id) }));
  return simplifyDebts(entries);
}

function getBalanceSummary(groupId, userId) {
  const id = String(userId);
  const others = new Set();
  for (const { debtor, creditor } of db.getGroupBalances(groupId)) {
    if (debtor === id) others.add(creditor);
    if (creditor === id) others.add(debtor);
  }
  others.delete(id);
  const lines = [];
  for (const other of others) {
    const result = getNetBetween(groupId, id, other);
    if (result.settled) continue;
    lines.push(result.owes === id
      ? { direction: 'iOwe', otherName: getName(other), amount: result.amount, otherId: other }
      : { direction: 'owedToMe', otherName: getName(other), amount: result.amount, otherId: other });
  }
  return lines;
}

// ── Transaction helpers ──────────────────────────────────────────────────────

function addTransaction(tx) {
  db.writeTransaction({
    id: tx.id, group_id: tx.groupId, type: tx.type, amount: tx.amount,
    label: tx.label || tx.description || null,
    timestamp: tx.timestamp, message_id: tx.message_id || null,
    contributions: tx.contributions || {},
    liabilities:   tx.liabilities  || {},
    participants:  tx.participants  || [],
    balanceDeltas: tx.balanceDeltas || [],
    from: tx.from, to: tx.to,
  });
}

function recordSettlement(groupId, fromId, toId, amount, description) {
  if (String(fromId) === String(toId)) throw new Error('Cannot record settlement to self');
  if (!(amount > 0))                   throw new Error('Settlement amount must be positive');
  const a = String(fromId), b = String(toId);
  updateBalance(groupId, a, b, -amount);
  const tx = {
    id: generateId(), type: 'settlement', groupId,
    timestamp: new Date().toISOString(),
    amount, description: description || null,
    from: a, to: b, participants: [a, b],
    balanceDeltas: [{ debtor: a, creditor: b, amount: -amount }],
  };
  addTransaction(tx);
  return tx;
}

function getGroupTransactions(groupId) { return db.getGroupTransactions(groupId); }

function deleteTransaction(txId, groupId) {
  const tx = db.getTransaction(txId);
  if (!tx) return null;
  for (const { debtor, creditor, amount } of (tx.balanceDeltas || [])) {
    updateBalance(groupId || tx.groupId, debtor, creditor, -amount);
  }
  db.removeTransaction(txId);
  return tx;
}

function resetAllGroupData(groupId) { db.resetGroup(groupId); }

// Called the first time a user sends a message so we can unify any balance
// entries stored under their @username key with their real Telegram userId.
function migrateUsernameToId(usernameKey, realId) {
  try { db.migrateUserId(usernameKey, realId); } catch (e) {
    console.error('[store-tg] migrateUsernameToId failed:', e.message);
  }
}

module.exports = {
  registerName, getName,
  updateBalance, getNetBetween, getParticipants, getOverallNet,
  getSimplifiedBalances, getBalanceSummary,
  addTransaction, recordSettlement,
  getGroupTransactions, deleteTransaction, resetAllGroupData,
  migrateUsernameToId,
  formatCurrency,
};

'use strict';
/**
 * tg/db-tg.js — SQLite persistence for the Telegram bot.
 *
 * Mirrors db.js (the WhatsApp DB) minus user_aliases / LID migration.
 * Default file: <repo>/data/splitwala-tg.db
 * Override for tests with env var SPLITWALA_TG_DB_PATH.
 */

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.SPLITWALA_TG_DB_PATH || path.join(dataDir, 'splitwala-tg.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout  = 5000');
db.pragma('foreign_keys  = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    name    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id         TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL,
    type       TEXT NOT NULL,
    amount     REAL NOT NULL,
    label      TEXT,
    timestamp  TEXT NOT NULL,
    message_id TEXT UNIQUE
  );
  CREATE INDEX IF NOT EXISTS idx_tx_group ON transactions(group_id);

  CREATE TABLE IF NOT EXISTS contributions (
    tx_id  TEXT NOT NULL,
    phone  TEXT NOT NULL,            -- "phone" col name kept for parity with WA db
    amount REAL NOT NULL,
    PRIMARY KEY (tx_id, phone),
    FOREIGN KEY (tx_id) REFERENCES transactions(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS liabilities (
    tx_id  TEXT NOT NULL,
    phone  TEXT NOT NULL,
    amount REAL NOT NULL,
    PRIMARY KEY (tx_id, phone),
    FOREIGN KEY (tx_id) REFERENCES transactions(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS tx_participants (
    tx_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    PRIMARY KEY (tx_id, phone),
    FOREIGN KEY (tx_id) REFERENCES transactions(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS balance_deltas (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_id    TEXT NOT NULL,
    debtor   TEXT NOT NULL,
    creditor TEXT NOT NULL,
    amount   REAL NOT NULL,
    FOREIGN KEY (tx_id) REFERENCES transactions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_bd_tx ON balance_deltas(tx_id);
  CREATE TABLE IF NOT EXISTS settlements (
    tx_id      TEXT PRIMARY KEY,
    from_phone TEXT NOT NULL,
    to_phone   TEXT NOT NULL,
    FOREIGN KEY (tx_id) REFERENCES transactions(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS balances (
    group_id TEXT NOT NULL,
    debtor   TEXT NOT NULL,
    creditor TEXT NOT NULL,
    amount   REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (group_id, debtor, creditor)
  );
  CREATE INDEX IF NOT EXISTS idx_bal_group ON balances(group_id);

  CREATE TABLE IF NOT EXISTS members (
    chat_id    TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    name       TEXT NOT NULL,
    username   TEXT,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (chat_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_members_chat ON members(chat_id);
`);

const stmts = {
  upsertUser:        db.prepare(`INSERT OR REPLACE INTO users(user_id, name) VALUES(?, ?)`),
  getUser:           db.prepare(`SELECT name FROM users WHERE user_id = ?`),
  // migration: merge @username key → real userId across all tables
  migBalDebtor:      db.prepare(`INSERT INTO balances(group_id,debtor,creditor,amount) SELECT group_id,?,creditor,amount FROM balances WHERE debtor=? ON CONFLICT(group_id,debtor,creditor) DO UPDATE SET amount=balances.amount+excluded.amount`),
  migBalCreditor:    db.prepare(`INSERT INTO balances(group_id,debtor,creditor,amount) SELECT group_id,debtor,?,amount FROM balances WHERE creditor=? ON CONFLICT(group_id,debtor,creditor) DO UPDATE SET amount=balances.amount+excluded.amount`),
  delBalDebtor:      db.prepare(`DELETE FROM balances WHERE debtor=?`),
  delBalCreditor:    db.prepare(`DELETE FROM balances WHERE creditor=?`),
  migContrib:        db.prepare(`UPDATE OR IGNORE contributions SET phone=? WHERE phone=?`),
  migLiab:           db.prepare(`UPDATE OR IGNORE liabilities   SET phone=? WHERE phone=?`),
  migPartic:         db.prepare(`UPDATE OR IGNORE tx_participants SET phone=? WHERE phone=?`),
  migDeltaD:         db.prepare(`UPDATE OR IGNORE balance_deltas SET debtor=?   WHERE debtor=?`),
  migDeltaC:         db.prepare(`UPDATE OR IGNORE balance_deltas SET creditor=? WHERE creditor=?`),
  migSettleF:        db.prepare(`UPDATE OR IGNORE settlements SET from_phone=? WHERE from_phone=?`),
  migSettleT:        db.prepare(`UPDATE OR IGNORE settlements SET to_phone=?   WHERE to_phone=?`),
  insertTx:          db.prepare(`INSERT OR IGNORE INTO transactions(id, group_id, type, amount, label, timestamp, message_id) VALUES(?,?,?,?,?,?,?)`),
  getTx:             db.prepare(`SELECT * FROM transactions WHERE id = ?`),
  groupTxs:          db.prepare(`SELECT * FROM transactions WHERE group_id = ? ORDER BY timestamp ASC`),
  deleteTx:          db.prepare(`DELETE FROM transactions WHERE id = ?`),
  deleteGroupTxs:    db.prepare(`DELETE FROM transactions WHERE group_id = ?`),
  dupCheck:          db.prepare(`SELECT id FROM transactions WHERE message_id = ?`),
  insertContrib:     db.prepare(`INSERT OR IGNORE INTO contributions(tx_id, phone, amount) VALUES(?, ?, ?)`),
  getContribs:       db.prepare(`SELECT phone, amount FROM contributions WHERE tx_id = ?`),
  insertLiab:        db.prepare(`INSERT OR IGNORE INTO liabilities(tx_id, phone, amount) VALUES(?, ?, ?)`),
  getLiabs:          db.prepare(`SELECT phone, amount FROM liabilities WHERE tx_id = ?`),
  insertPartic:      db.prepare(`INSERT OR IGNORE INTO tx_participants(tx_id, phone) VALUES(?, ?)`),
  getPartics:        db.prepare(`SELECT phone FROM tx_participants WHERE tx_id = ?`),
  insertDelta:       db.prepare(`INSERT INTO balance_deltas(tx_id, debtor, creditor, amount) VALUES(?, ?, ?, ?)`),
  getDeltas:         db.prepare(`SELECT debtor, creditor, amount FROM balance_deltas WHERE tx_id = ?`),
  insertSettle:      db.prepare(`INSERT OR IGNORE INTO settlements(tx_id, from_phone, to_phone) VALUES(?, ?, ?)`),
  getSettle:         db.prepare(`SELECT from_phone, to_phone FROM settlements WHERE tx_id = ?`),
  getBalance:        db.prepare(`SELECT amount FROM balances WHERE group_id = ? AND debtor = ? AND creditor = ?`),
  upsertBalance:     db.prepare(`INSERT INTO balances(group_id, debtor, creditor, amount) VALUES(?, ?, ?, ?) ON CONFLICT(group_id, debtor, creditor) DO UPDATE SET amount = excluded.amount`),
  groupBalances:     db.prepare(`SELECT debtor, creditor, amount FROM balances WHERE group_id = ?`),
  deleteGroupBal:    db.prepare(`DELETE FROM balances WHERE group_id = ?`),
  upsertMember:      db.prepare(`INSERT OR REPLACE INTO members(chat_id, user_id, name, username, updated_at) VALUES(?, ?, ?, ?, ?)`),
  getMembersByChatId: db.prepare(`SELECT user_id, name, username FROM members WHERE chat_id = ?`),
  getMemberByUsername: db.prepare(`SELECT chat_id, user_id, name, username FROM members WHERE chat_id = ? AND username = ?`),
};

function setUserName(userId, name) { if (name && name.trim()) stmts.upsertUser.run(String(userId), name.trim()); }
function getUserName(userId)       { const r = stmts.getUser.get(String(userId)); return r ? r.name : null; }

const writeTransaction = db.transaction(tx => {
  if (tx.message_id) {
    if (stmts.dupCheck.get(tx.message_id)) return false;
  }
  stmts.insertTx.run(tx.id, tx.group_id, tx.type, tx.amount, tx.label || null, tx.timestamp, tx.message_id || null);
  for (const [uid, amount] of Object.entries(tx.contributions || {})) stmts.insertContrib.run(tx.id, uid, amount);
  for (const [uid, amount] of Object.entries(tx.liabilities  || {})) stmts.insertLiab.run(tx.id, uid, amount);
  for (const uid of (tx.participants || []))                          stmts.insertPartic.run(tx.id, uid);
  for (const { debtor, creditor, amount } of (tx.balanceDeltas || [])) stmts.insertDelta.run(tx.id, debtor, creditor, amount);
  if (tx.from && tx.to) stmts.insertSettle.run(tx.id, tx.from, tx.to);
  return true;
});

function _enrich(row) {
  const contribs = stmts.getContribs.all(row.id);
  const liabs    = stmts.getLiabs.all(row.id);
  const parts    = stmts.getPartics.all(row.id);
  const deltas   = stmts.getDeltas.all(row.id);
  const settle   = stmts.getSettle.get(row.id);
  const tx = {
    id: row.id, type: row.type, groupId: row.group_id, timestamp: row.timestamp,
    amount: row.amount, label: row.label || null,
    contributions: {}, liabilities: {},
    participants: parts.map(p => p.phone),
    balanceDeltas: deltas.map(d => ({ debtor: d.debtor, creditor: d.creditor, amount: d.amount })),
  };
  for (const c of contribs) tx.contributions[c.phone] = c.amount;
  for (const l of liabs)    tx.liabilities[l.phone]   = l.amount;
  if (settle) { tx.from = settle.from_phone; tx.to = settle.to_phone; }
  return tx;
}

function getTransaction(txId)       { const r = stmts.getTx.get(txId); return r ? _enrich(r) : null; }
function getGroupTransactions(gid)  { return stmts.groupTxs.all(gid).map(_enrich); }
function removeTransaction(txId)    { stmts.deleteTx.run(txId); }
function getBalanceAmount(g, d, c)  { const r = stmts.getBalance.get(g, d, c); return r ? r.amount : 0; }
function setBalance(g, d, c, amt)   { stmts.upsertBalance.run(g, d, c, amt); }
function getGroupBalances(g)        { return stmts.groupBalances.all(g); }

const resetGroup = db.transaction(gid => {
  stmts.deleteGroupTxs.run(gid);
  stmts.deleteGroupBal.run(gid);
});

// Migrate all records stored under @username key to the real numeric userId.
// Runs once when the user first sends a message and the bot learns their real ID.
const migrateUserId = db.transaction((oldKey, newId) => {
  if (oldKey === newId) return;
  // balances: merge amounts if a row already exists for newId (safe sum)
  stmts.migBalDebtor.run(newId, oldKey);
  stmts.delBalDebtor.run(oldKey);
  stmts.migBalCreditor.run(newId, oldKey);
  stmts.delBalCreditor.run(oldKey);
  // per-transaction tables: conflicts won't happen (can't be in same tx twice)
  stmts.migContrib.run(newId, oldKey);
  stmts.migLiab.run(newId, oldKey);
  stmts.migPartic.run(newId, oldKey);
  stmts.migDeltaD.run(newId, oldKey);
  stmts.migDeltaC.run(newId, oldKey);
  stmts.migSettleF.run(newId, oldKey);
  stmts.migSettleT.run(newId, oldKey);
  // carry over display name if real ID doesn't have one yet
  if (!stmts.getUser.get(newId)) {
    const old = stmts.getUser.get(oldKey);
    if (old) stmts.upsertUser.run(newId, old.name);
  }
});

function upsertMember(chatId, userId, name, username) {
  stmts.upsertMember.run(String(chatId), String(userId), name, username || null, new Date().toISOString());
}

function getMembersByChatId(chatId) {
  return stmts.getMembersByChatId.all(String(chatId));
}

function getMemberByUsername(chatId, username) {
  return stmts.getMemberByUsername.get(String(chatId), username);
}

module.exports = {
  setUserName, getUserName,
  writeTransaction, getTransaction, getGroupTransactions, removeTransaction,
  getBalanceAmount, setBalance, getGroupBalances,
  resetGroup, migrateUserId,
  upsertMember, getMembersByChatId, getMemberByUsername,
  _db: db,
};

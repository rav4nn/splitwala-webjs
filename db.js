'use strict';
/**
 * db.js — SQLite persistence layer for SplitWala
 *
 * Owns the database connection, schema, prepared statements, and raw
 * CRUD operations.  store.js wraps these with business logic and exposes
 * the same public API that the rest of the codebase already uses.
 *
 * Uses better-sqlite3 (synchronous) so call sites need no async/await.
 */

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

// ── Bootstrap ──────────────────────────────────────────────────────────────────

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'splitwala.db'));

// WAL mode: readers don't block the writer (important for concurrent commands)
db.pragma('journal_mode = WAL');
// Wait up to 5 s instead of throwing "database is locked" under concurrent load
db.pragma('busy_timeout  = 5000');
// Enforce foreign-key constraints so ON DELETE CASCADE actually fires
db.pragma('foreign_keys  = ON');

// ── Schema ─────────────────────────────────────────────────────────────────────

db.exec(`
  -- User display-name cache (replaces store.names)
  CREATE TABLE IF NOT EXISTS users (
    phone TEXT PRIMARY KEY,
    name  TEXT NOT NULL
  );

  -- LID / alternate ID → canonical phone (replaces store.userMappings)
  -- type: 'phone' | 'lid' | 'name'
  CREATE TABLE IF NOT EXISTS user_aliases (
    alias     TEXT PRIMARY KEY,
    canonical TEXT NOT NULL,
    type      TEXT NOT NULL DEFAULT 'phone'
  );

  -- Expense or settlement transactions
  CREATE TABLE IF NOT EXISTS transactions (
    id         TEXT PRIMARY KEY,
    group_id   TEXT NOT NULL,
    type       TEXT NOT NULL,      -- 'expense' | 'settlement'
    amount     REAL NOT NULL,
    label      TEXT,               -- optional description / label
    timestamp  TEXT NOT NULL,
    message_id TEXT UNIQUE         -- idempotency: ignore duplicate WA message IDs
  );
  CREATE INDEX IF NOT EXISTS idx_tx_group ON transactions(group_id);

  -- Who paid how much in an expense  (replaces contributions: {phone: amount})
  CREATE TABLE IF NOT EXISTS contributions (
    tx_id  TEXT NOT NULL,
    phone  TEXT NOT NULL,
    amount REAL NOT NULL,
    PRIMARY KEY (tx_id, phone),
    FOREIGN KEY (tx_id) REFERENCES transactions(id) ON DELETE CASCADE
  );

  -- Who owes how much in an expense  (replaces liabilities: {phone: amount})
  CREATE TABLE IF NOT EXISTS liabilities (
    tx_id  TEXT NOT NULL,
    phone  TEXT NOT NULL,
    amount REAL NOT NULL,
    PRIMARY KEY (tx_id, phone),
    FOREIGN KEY (tx_id) REFERENCES transactions(id) ON DELETE CASCADE
  );

  -- All phones involved in a transaction  (for /history @person filtering)
  CREATE TABLE IF NOT EXISTS tx_participants (
    tx_id TEXT NOT NULL,
    phone TEXT NOT NULL,
    PRIMARY KEY (tx_id, phone),
    FOREIGN KEY (tx_id) REFERENCES transactions(id) ON DELETE CASCADE
  );

  -- Signed balance deltas stored per transaction  (for /delete reversal)
  CREATE TABLE IF NOT EXISTS balance_deltas (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_id    TEXT NOT NULL,
    debtor   TEXT NOT NULL,
    creditor TEXT NOT NULL,
    amount   REAL NOT NULL,
    FOREIGN KEY (tx_id) REFERENCES transactions(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_bd_tx ON balance_deltas(tx_id);

  -- Extra fields for settlement transactions  (/paid, /got)
  CREATE TABLE IF NOT EXISTS settlements (
    tx_id      TEXT PRIMARY KEY,
    from_phone TEXT NOT NULL,
    to_phone   TEXT NOT NULL,
    FOREIGN KEY (tx_id) REFERENCES transactions(id) ON DELETE CASCADE
  );

  -- Materialised running balance matrix  (replaces store.balances)
  CREATE TABLE IF NOT EXISTS balances (
    group_id TEXT NOT NULL,
    debtor   TEXT NOT NULL,
    creditor TEXT NOT NULL,
    amount   REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (group_id, debtor, creditor)
  );
  CREATE INDEX IF NOT EXISTS idx_bal_group ON balances(group_id);
`);

// ── Prepared statements ────────────────────────────────────────────────────────
//
// Preparing once at startup is faster than preparing on every call.

const stmts = {
  // users
  upsertUser:   db.prepare(`INSERT OR REPLACE INTO users(phone, name) VALUES(?, ?)`),
  getUser:      db.prepare(`SELECT name FROM users WHERE phone = ?`),

  // user_aliases
  upsertAlias:  db.prepare(`INSERT OR IGNORE INTO user_aliases(alias, canonical, type) VALUES(?, ?, ?)`),
  getAlias:     db.prepare(`SELECT canonical FROM user_aliases WHERE alias = ?`),
  aliasesByCanonical: db.prepare(`SELECT alias, type FROM user_aliases WHERE canonical = ?`),
  allAliases:   db.prepare(`SELECT alias, canonical, type FROM user_aliases`),

  // transactions
  insertTx:     db.prepare(`
    INSERT OR IGNORE INTO transactions(id, group_id, type, amount, label, timestamp, message_id)
    VALUES(?, ?, ?, ?, ?, ?, ?)
  `),
  getTx:        db.prepare(`SELECT * FROM transactions WHERE id = ?`),
  groupTxs:     db.prepare(`SELECT * FROM transactions WHERE group_id = ? ORDER BY timestamp ASC`),
  deleteTx:     db.prepare(`DELETE FROM transactions WHERE id = ?`),
  deleteGroupTxs: db.prepare(`DELETE FROM transactions WHERE group_id = ?`),
  dupCheck:     db.prepare(`SELECT id FROM transactions WHERE message_id = ?`),

  // contributions / liabilities / participants / deltas / settlements
  insertContrib:  db.prepare(`INSERT OR IGNORE INTO contributions(tx_id, phone, amount) VALUES(?, ?, ?)`),
  getContribs:    db.prepare(`SELECT phone, amount FROM contributions WHERE tx_id = ?`),
  insertLiab:     db.prepare(`INSERT OR IGNORE INTO liabilities(tx_id, phone, amount) VALUES(?, ?, ?)`),
  getLiabs:       db.prepare(`SELECT phone, amount FROM liabilities WHERE tx_id = ?`),
  insertPartic:   db.prepare(`INSERT OR IGNORE INTO tx_participants(tx_id, phone) VALUES(?, ?)`),
  getPartics:     db.prepare(`SELECT phone FROM tx_participants WHERE tx_id = ?`),
  insertDelta:    db.prepare(`INSERT INTO balance_deltas(tx_id, debtor, creditor, amount) VALUES(?, ?, ?, ?)`),
  getDeltas:      db.prepare(`SELECT debtor, creditor, amount FROM balance_deltas WHERE tx_id = ?`),
  insertSettle:   db.prepare(`INSERT OR IGNORE INTO settlements(tx_id, from_phone, to_phone) VALUES(?, ?, ?)`),
  getSettle:      db.prepare(`SELECT from_phone, to_phone FROM settlements WHERE tx_id = ?`),

  // balances
  getBalance:     db.prepare(`SELECT amount FROM balances WHERE group_id = ? AND debtor = ? AND creditor = ?`),
  upsertBalance:  db.prepare(`
    INSERT INTO balances(group_id, debtor, creditor, amount) VALUES(?, ?, ?, ?)
    ON CONFLICT(group_id, debtor, creditor) DO UPDATE SET amount = excluded.amount
  `),
  groupBalances:  db.prepare(`SELECT debtor, creditor, amount FROM balances WHERE group_id = ?`),
  deleteGroupBal: db.prepare(`DELETE FROM balances WHERE group_id = ?`),
};

// ── Public API — Users ─────────────────────────────────────────────────────────

/** Upsert a display name for a phone number. */
function setUserName(phone, name) {
  if (name && name.trim()) stmts.upsertUser.run(phone, name.trim());
}

/** Return cached display name for a phone, or null. */
function getUserName(phone) {
  const row = stmts.getUser.get(phone);
  return row ? row.name : null;
}

// ── Public API — Aliases ───────────────────────────────────────────────────────

/**
 * Register alias → canonical mapping.
 * type: 'phone' | 'lid' | 'name'
 * INSERT OR IGNORE means existing entries are never overwritten.
 */
function registerAlias(alias, canonical, type) {
  stmts.upsertAlias.run(alias, canonical, type || 'phone');
}

/** Return canonical phone for alias, or null if unknown. */
function resolveAlias(alias) {
  const row = stmts.getAlias.get(alias);
  return row ? row.canonical : null;
}

/** Return all { alias, type } rows that point to canonical. */
function getAliases(canonical) {
  return stmts.aliasesByCanonical.all(canonical);
}

/** Return entire alias table as [{ alias, canonical, type }]. */
function getAllAliases() {
  return stmts.allAliases.all();
}

// ── Public API — Transactions ──────────────────────────────────────────────────

/**
 * Write a complete transaction atomically.
 *
 * tx shape:
 *   { id, group_id, type, amount, label?, timestamp, message_id?,
 *     contributions: { phone: amount },
 *     liabilities:   { phone: amount },
 *     participants:  [phone, ...],
 *     balanceDeltas: [{ debtor, creditor, amount }],
 *     from?, to? }
 *
 * Returns true on success, false if message_id was already processed (idempotency).
 */
const writeTransaction = db.transaction(tx => {
  if (tx.message_id) {
    const dup = stmts.dupCheck.get(tx.message_id);
    if (dup) return false;
  }

  stmts.insertTx.run(
    tx.id, tx.group_id, tx.type, tx.amount,
    tx.label || null, tx.timestamp, tx.message_id || null
  );

  for (const [phone, amount] of Object.entries(tx.contributions || {})) {
    stmts.insertContrib.run(tx.id, phone, amount);
  }
  for (const [phone, amount] of Object.entries(tx.liabilities || {})) {
    stmts.insertLiab.run(tx.id, phone, amount);
  }
  for (const phone of (tx.participants || [])) {
    stmts.insertPartic.run(tx.id, phone);
  }
  for (const { debtor, creditor, amount } of (tx.balanceDeltas || [])) {
    stmts.insertDelta.run(tx.id, debtor, creditor, amount);
  }
  if (tx.from && tx.to) {
    stmts.insertSettle.run(tx.id, tx.from, tx.to);
  }

  return true;
});

/** Return a single enriched transaction object, or null if not found. */
function getTransaction(txId) {
  const row = stmts.getTx.get(txId);
  return row ? _enrich(row) : null;
}

/** Return all transactions for a group (oldest first), enriched. */
function getGroupTransactions(groupId) {
  return stmts.groupTxs.all(groupId).map(_enrich);
}

/** DELETE a transaction row; CASCADE removes all child rows automatically. */
function removeTransaction(txId) {
  stmts.deleteTx.run(txId);
}

// ── Public API — Balances ──────────────────────────────────────────────────────

/** Return the stored amount for one (group, debtor, creditor) pair (0 if absent). */
function getBalanceAmount(groupId, debtor, creditor) {
  const row = stmts.getBalance.get(groupId, debtor, creditor);
  return row ? row.amount : 0;
}

/** Upsert a balance row (replaces existing amount). */
function setBalance(groupId, debtor, creditor, amount) {
  stmts.upsertBalance.run(groupId, debtor, creditor, amount);
}

/** Return all balance rows for a group as [{ debtor, creditor, amount }]. */
function getGroupBalances(groupId) {
  return stmts.groupBalances.all(groupId);
}

// ── Public API — Admin ─────────────────────────────────────────────────────────

/**
 * Delete all transactions and balances for a group in one atomic operation.
 * Used by /resetall confirm.
 */
const resetGroup = db.transaction(groupId => {
  stmts.deleteGroupTxs.run(groupId);  // cascades to child tables
  stmts.deleteGroupBal.run(groupId);
});

// ── Internal helpers ───────────────────────────────────────────────────────────

/** Build the rich JS transaction object that the rest of the codebase expects. */
function _enrich(row) {
  const contribs = stmts.getContribs.all(row.id);
  const liabs    = stmts.getLiabs.all(row.id);
  const parts    = stmts.getPartics.all(row.id);
  const deltas   = stmts.getDeltas.all(row.id);
  const settle   = stmts.getSettle.get(row.id);

  const tx = {
    id:            row.id,
    type:          row.type,
    groupId:       row.group_id,
    timestamp:     row.timestamp,
    amount:        row.amount,
    label:         row.label || null,
    contributions: {},
    liabilities:   {},
    participants:  parts.map(p => p.phone),
    balanceDeltas: deltas.map(d => ({ debtor: d.debtor, creditor: d.creditor, amount: d.amount })),
  };

  for (const c of contribs) tx.contributions[c.phone] = c.amount;
  for (const l of liabs)    tx.liabilities[l.phone]   = l.amount;

  if (settle) {
    tx.from = settle.from_phone;
    tx.to   = settle.to_phone;
  }

  return tx;
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  // Users
  setUserName, getUserName,
  // Aliases
  registerAlias, resolveAlias, getAliases, getAllAliases,
  // Transactions
  writeTransaction, getTransaction, getGroupTransactions, removeTransaction,
  // Balances
  getBalanceAmount, setBalance, getGroupBalances,
  // Admin
  resetGroup,
};

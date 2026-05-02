'use strict';
const { test }  = require('node:test');
const assert    = require('node:assert/strict');
const path      = require('node:path');
const fs        = require('node:fs');

// Use a temp DB file for tests so we don't pollute data/
const TMP_DB = path.join(__dirname, '_tmp_tg.db');
process.env.SPLITWALA_TG_DB_PATH = TMP_DB;

// Lazy require so the env var is set before db-tg.js opens the file
const dbtg = require('../tg/db-tg');

test('schema: tables exist', () => {
  const tables = dbtg._db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all().map(r => r.name);
  for (const t of ['users','transactions','contributions','liabilities','tx_participants','balance_deltas','settlements','balances']) {
    assert.ok(tables.includes(t), `table ${t} should exist`);
  }
  assert.ok(!tables.includes('user_aliases'), 'user_aliases should NOT exist on TG side');
});

test('users: setUserName/getUserName round-trip', () => {
  dbtg.setUserName('123', 'Alice');
  assert.equal(dbtg.getUserName('123'), 'Alice');
  assert.equal(dbtg.getUserName('999'), null);
});

test('writeTransaction: writes and getGroupTransactions reads back', () => {
  const tx = {
    id: 't1', group_id: 'g1', type: 'expense', amount: 300,
    timestamp: new Date().toISOString(),
    contributions: { '123': 300 },
    liabilities:   { '123': 100, '456': 100, '789': 100 },
    participants:  ['123','456','789'],
    balanceDeltas: [
      { debtor: '456', creditor: '123', amount: 100 },
      { debtor: '789', creditor: '123', amount: 100 },
    ],
  };
  assert.equal(dbtg.writeTransaction(tx), true);
  const list = dbtg.getGroupTransactions('g1');
  assert.equal(list.length, 1);
  assert.equal(list[0].amount, 300);
  assert.deepEqual(list[0].participants.sort(), ['123','456','789']);
});

test('balances: setBalance / getBalanceAmount / getGroupBalances', () => {
  dbtg.setBalance('g1', 'A', 'B', 50);
  assert.equal(dbtg.getBalanceAmount('g1', 'A', 'B'), 50);
  const all = dbtg.getGroupBalances('g1');
  assert.ok(all.find(r => r.debtor === 'A' && r.creditor === 'B' && r.amount === 50));
});

test('resetGroup: deletes all rows for a group', () => {
  dbtg.resetGroup('g1');
  assert.equal(dbtg.getGroupTransactions('g1').length, 0);
  assert.equal(dbtg.getGroupBalances('g1').length, 0);
});

// Cleanup the temp DB so the next test run starts fresh
test.after(() => {
  try { dbtg._db.close(); fs.unlinkSync(TMP_DB); } catch (_) {}
});

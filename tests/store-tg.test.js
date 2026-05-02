'use strict';
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const path     = require('node:path');
const fs       = require('node:fs');

const TMP_DB = path.join(__dirname, '_tmp_store_tg.db');
process.env.SPLITWALA_TG_DB_PATH = TMP_DB;

const store = require('../tg/store-tg');

test('registerName / getName: stable id → name', () => {
  store.registerName('111', 'Alice');
  assert.equal(store.getName('111'), 'Alice');
});

test('getName: falls back to short id when unknown', () => {
  assert.match(store.getName('99999'), /^…9999$/);
});

test('updateBalance: a owes b 100, then b pays a 40 → a owes b 60', () => {
  store.updateBalance('grp1', '111', '222', 100);
  store.updateBalance('grp1', '222', '111', 40);    // settlement: reduces 111->222
  // After flip: 111 owes 222 60
  const net = store.getNetBetween('grp1', '111', '222');
  assert.deepEqual(net, { owes: '111', owedTo: '222', amount: 60 });
});

test('getSimplifiedBalances: triangle settles to two transfers', () => {
  // Fresh group
  store.updateBalance('grp2', '222', '111', 100);   // 222 owes 111
  store.updateBalance('grp2', '333', '111', 50);    // 333 owes 111
  const summary = store.getSimplifiedBalances('grp2');
  // 111 is owed 150 total; 222 owes 100; 333 owes 50.
  assert.deepEqual(summary.sort((a, b) => b.amount - a.amount), [
    { from: '222', to: '111', amount: 100 },
    { from: '333', to: '111', amount: 50  },
  ]);
});

test('recordSettlement: writes a settlement tx and updates balances', () => {
  store.updateBalance('grp3', '111', '222', 200);
  store.recordSettlement('grp3', '111', '222', 200);
  const net = store.getNetBetween('grp3', '111', '222');
  assert.deepEqual(net, { settled: true });
});

test.after(() => {
  try { require('../tg/db-tg')._db.close(); fs.unlinkSync(TMP_DB); } catch (_) {}
});

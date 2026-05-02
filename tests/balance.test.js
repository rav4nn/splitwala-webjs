'use strict';
const { test }  = require('node:test');
const assert    = require('node:assert/strict');
const {
  simplifyDebts,
  roundCurrency,
} = require('../core/balance');

test('roundCurrency: rounds to 2 decimal places using bankers-style commercial rounding', () => {
  assert.equal(roundCurrency(1.234), 1.23);
  assert.equal(roundCurrency(1.235), 1.24);     // round half up
  assert.equal(roundCurrency(1.005), 1.01);
  assert.equal(roundCurrency(-1.234), -1.23);
});

test('simplifyDebts: empty input returns empty list', () => {
  assert.deepEqual(simplifyDebts([]), []);
});

test('simplifyDebts: ignores nets within 0.005 of zero (settled people)', () => {
  const result = simplifyDebts([
    { id: 'a', net:  0.003 },
    { id: 'b', net: -0.003 },
  ]);
  assert.deepEqual(result, []);
});

test('simplifyDebts: single creditor & single debtor of equal magnitude', () => {
  const result = simplifyDebts([
    { id: 'alice', net:  100 },
    { id: 'bob',   net: -100 },
  ]);
  assert.deepEqual(result, [{ from: 'bob', to: 'alice', amount: 100 }]);
});

test('simplifyDebts: greedy match — largest creditor paired with largest debtor first', () => {
  // alice is owed 150, bob is owed 50, carol owes 100, dave owes 100
  const result = simplifyDebts([
    { id: 'alice', net:  150 },
    { id: 'bob',   net:   50 },
    { id: 'carol', net: -100 },
    { id: 'dave',  net: -100 },
  ]);
  // Expected greedy: carol→alice 100, dave→alice 50, dave→bob 50
  assert.deepEqual(result, [
    { from: 'carol', to: 'alice', amount: 100 },
    { from: 'dave',  to: 'alice', amount:  50 },
    { from: 'dave',  to: 'bob',   amount:  50 },
  ]);
});

test('simplifyDebts: total-credits and total-debits must balance to within 0.01', () => {
  // Scenario with three of each
  const nets = [
    { id: 'a', net:  60.50 },
    { id: 'b', net:  39.50 },
    { id: 'c', net:  10.00 },
    { id: 'd', net: -55.00 },
    { id: 'e', net: -33.00 },
    { id: 'f', net: -22.00 },
  ];
  const result = simplifyDebts(nets);
  // Each transfer is positive
  for (const t of result) assert.ok(t.amount > 0);
  // Sum out of each id matches its net
  const sumOut = id => result.filter(t => t.from === id).reduce((s, t) => s + t.amount, 0);
  const sumIn  = id => result.filter(t => t.to   === id).reduce((s, t) => s + t.amount, 0);
  for (const { id, net } of nets) {
    if (net < 0) assert.ok(Math.abs(sumOut(id) + net) < 0.01, `debtor ${id} should pay ${-net}`);
    if (net > 0) assert.ok(Math.abs(sumIn(id)  - net) < 0.01, `creditor ${id} should receive ${net}`);
  }
});

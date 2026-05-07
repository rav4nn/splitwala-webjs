'use strict';
const { test } = require('node:test');
const assert   = require('node:assert/strict');

const memberCache = require('../tg/member-cache');
const { resolveSplitValues } = require('../tg/split-wizard');

const CHAT = -1009876543210;
const SENDER = '500';
memberCache.recordMember(CHAT, { id: 500, first_name: 'Sender',  username: 'me_user' });
memberCache.recordMember(CHAT, { id: 600, first_name: 'Mohit',   username: 'metasmic' });
memberCache.recordMember(CHAT, { id: 700, first_name: 'Vipul',   username: 'vipbhavs' });

test('resolveSplitValues: returns null when split_type is not exact/percent', () => {
  assert.equal(resolveSplitValues({ amount: 600, split_type: 'equal', split_values: { '@metasmic': 600 } }, SENDER, CHAT), null);
  assert.equal(resolveSplitValues({ amount: 600, split_values: { '@metasmic': 600 } }, SENDER, CHAT), null);
});

test('resolveSplitValues: exact — values sum to amount, mapped to userIds', () => {
  const r = resolveSplitValues({
    amount: 900,
    split_type: 'exact',
    split_values: { '@metasmic': 600, SENDER: 300 },
  }, SENDER, CHAT);
  assert.deepEqual(r, { '600': 600, '500': 300 });
});

test('resolveSplitValues: exact — sum mismatch returns null', () => {
  const r = resolveSplitValues({
    amount: 900,
    split_type: 'exact',
    split_values: { '@metasmic': 600, SENDER: 200 },
  }, SENDER, CHAT);
  assert.equal(r, null);
});

test('resolveSplitValues: percent — values sum to 100, converts to amounts', () => {
  const r = resolveSplitValues({
    amount: 1000,
    split_type: 'percent',
    split_values: { '@metasmic': 60, SENDER: 40 },
  }, SENDER, CHAT);
  assert.deepEqual(r, { '600': 600, '500': 400 });
});

test('resolveSplitValues: percent — sum off by 5 returns null', () => {
  const r = resolveSplitValues({
    amount: 1000,
    split_type: 'percent',
    split_values: { '@metasmic': 60, SENDER: 35 },
  }, SENDER, CHAT);
  assert.equal(r, null);
});

test('resolveSplitValues: percent — handles rounding remainder cleanly', () => {
  // 1000 * 1/3 = 333.33; three equal thirds should still total exactly 1000
  const r = resolveSplitValues({
    amount: 1000,
    split_type: 'percent',
    split_values: { '@metasmic': 33.33, '@vipbhavs': 33.33, SENDER: 33.34 },
  }, SENDER, CHAT);
  assert.ok(r, 'should return a map');
  const total = Object.values(r).reduce((a, b) => a + b, 0);
  assert.equal(Math.round(total * 100) / 100, 1000);
});

test('resolveSplitValues: unknown participant returns null', () => {
  const r = resolveSplitValues({
    amount: 600,
    split_type: 'exact',
    split_values: { '@nobody': 300, SENDER: 300 },
  }, SENDER, CHAT);
  assert.equal(r, null);
});

test('resolveSplitValues: anon-bot username in keys returns null', () => {
  const r = resolveSplitValues({
    amount: 600,
    split_type: 'exact',
    split_values: { '@groupanonymousbot': 300, SENDER: 300 },
  }, SENDER, CHAT);
  assert.equal(r, null);
});

test('resolveSplitValues: single-participant split_values returns null', () => {
  // Per-person amounts on a single person make no sense — fall back to equal.
  const r = resolveSplitValues({
    amount: 600,
    split_type: 'exact',
    split_values: { SENDER: 600 },
  }, SENDER, CHAT);
  assert.equal(r, null);
});

test('resolveSplitValues: zero or negative value returns null', () => {
  const r = resolveSplitValues({
    amount: 600,
    split_type: 'exact',
    split_values: { '@metasmic': 0, SENDER: 600 },
  }, SENDER, CHAT);
  assert.equal(r, null);
});

test('resolveSplitValues: name lookup ("Mohit") works alongside @username', () => {
  const r = resolveSplitValues({
    amount: 900,
    split_type: 'exact',
    split_values: { Mohit: 600, SENDER: 300 },
  }, SENDER, CHAT);
  assert.deepEqual(r, { '600': 600, '500': 300 });
});

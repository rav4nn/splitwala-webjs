'use strict';
const { test }  = require('node:test');
const assert    = require('node:assert/strict');
const {
  parsePaidCommand,
  parseGotCommand,
  parseHistoryArgs,
  parseDeleteArgs,
  parseLabel,
  parseResetAllArgs,
  parseBalancesArgs,
} = require('../core/parser');

// ── parsePaidCommand ─────────────────────────────────────────────────────────
test('parsePaidCommand: amount only', () => {
  assert.deepEqual(parsePaidCommand('/paid 200'),
    { amount: 200, toToken: null, fromToken: null, error: null });
});

test('parsePaidCommand: amount with "to" target', () => {
  assert.deepEqual(parsePaidCommand('/paid 200 to @Mohit'),
    { amount: 200, toToken: '@Mohit', fromToken: null, error: null });
});

test('parsePaidCommand: amount with "from" source', () => {
  assert.deepEqual(parsePaidCommand('/paid 200 from @Mohit'),
    { amount: 200, toToken: null, fromToken: '@Mohit', error: null });
});

test('parsePaidCommand: from X to Y (third-party settlement)', () => {
  assert.deepEqual(parsePaidCommand('/paid 500 from @Vipul to @Mohit'),
    { amount: 500, toToken: '@Mohit', fromToken: '@Vipul', error: null });
});

test('parsePaidCommand: zero or negative amount yields error', () => {
  assert.equal(parsePaidCommand('/paid 0').error,   'Amount must be a positive number.');
  assert.equal(parsePaidCommand('/paid -5').error,  'Amount must be a positive number.');
  assert.equal(parsePaidCommand('/paid abc').error, 'Amount must be a positive number.');
});

test('parsePaidCommand: missing amount with target — "clear what they owe me" form', () => {
  // "/paid @Mohit to me" — no amount; means "clear all that Mohit owes me"
  assert.deepEqual(parsePaidCommand('/paid @Mohit to me'),
    { amount: null, toToken: 'me', fromToken: '@Mohit', error: null });
});

// ── parseGotCommand ──────────────────────────────────────────────────────────
test('parseGotCommand: amount from someone', () => {
  assert.deepEqual(parseGotCommand('/got 300 from @Mohit'),
    { amount: 300, fromToken: '@Mohit', error: null });
});

test('parseGotCommand: missing "from" yields error', () => {
  assert.equal(parseGotCommand('/got 300').error,
    'Use: /got <amount> from @person');
});

// ── parseHistoryArgs ─────────────────────────────────────────────────────────
test('parseHistoryArgs: defaults to count=5, no filter', () => {
  assert.deepEqual(parseHistoryArgs('/history'),
    { count: 5, filterToken: null, error: null });
});

test('parseHistoryArgs: numeric arg sets count, capped at 20', () => {
  assert.deepEqual(parseHistoryArgs('/history 10'),
    { count: 10, filterToken: null, error: null });
  assert.deepEqual(parseHistoryArgs('/history 99'),
    { count: 20, filterToken: null, error: null });
});

test('parseHistoryArgs: mention-only filters by user', () => {
  assert.deepEqual(parseHistoryArgs('/history @Mohit'),
    { count: 5, filterToken: '@Mohit', error: null });
});

test('parseHistoryArgs: count + mention', () => {
  assert.deepEqual(parseHistoryArgs('/history 10 @Mohit'),
    { count: 10, filterToken: '@Mohit', error: null });
});

// ── parseDeleteArgs ──────────────────────────────────────────────────────────
test('parseDeleteArgs: bare "/delete" → list mode', () => {
  assert.deepEqual(parseDeleteArgs('/delete'),
    { mode: 'list', index: null, error: null });
});

test('parseDeleteArgs: "/delete 2" → delete mode', () => {
  assert.deepEqual(parseDeleteArgs('/delete 2'),
    { mode: 'delete', index: 2, error: null });
});

test('parseDeleteArgs: invalid index returns error', () => {
  assert.equal(parseDeleteArgs('/delete abc').error,
    'Index must be a positive integer.');
  assert.equal(parseDeleteArgs('/delete 0').error,
    'Index must be a positive integer.');
});

// ── parseLabel ───────────────────────────────────────────────────────────────
test('parseLabel: inline "for <text>" returns label', () => {
  assert.deepEqual(parseLabel('/split 600 for dinner'),
    { label: 'dinner', error: null });
});

test('parseLabel: newline label takes priority over inline', () => {
  assert.deepEqual(parseLabel('/split 600 for foo\nfor real label'),
    { label: 'real label', error: null });
});

test('parseLabel: no "for" returns null label, no error', () => {
  assert.deepEqual(parseLabel('/split 600 @Mohit'),
    { label: null, error: null });
});

test('parseLabel: empty label after "for" yields error', () => {
  assert.equal(parseLabel('/split 600 for ').error,
    'Invalid label. Use: for <description>');
});

test('parseLabel: label > 40 chars yields error', () => {
  const longLabel = 'x'.repeat(41);
  assert.equal(parseLabel(`/split 600 for ${longLabel}`).error,
    'Label too long. Max 40 characters allowed.');
});

// ── parseResetAllArgs ────────────────────────────────────────────────────────
test('parseResetAllArgs: bare /resetall = preview', () => {
  assert.deepEqual(parseResetAllArgs('/resetall'),
    { confirmed: false });
});

test('parseResetAllArgs: /resetall confirm = confirmed', () => {
  assert.deepEqual(parseResetAllArgs('/resetall confirm'),
    { confirmed: true });
  assert.deepEqual(parseResetAllArgs('/resetall  CONFIRM '),
    { confirmed: true });
});

// ── parseBalancesArgs ────────────────────────────────────────────────────────
test('parseBalancesArgs: no arg = own balances', () => {
  assert.deepEqual(parseBalancesArgs('/balances'),
    { targetToken: null });
});

test('parseBalancesArgs: with mention = balances vs that user', () => {
  assert.deepEqual(parseBalancesArgs('/balances @Mohit'),
    { targetToken: '@Mohit' });
});

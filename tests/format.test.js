'use strict';
const { test }  = require('node:test');
const assert    = require('node:assert/strict');
const {
  formatBox,
  formatError,
  formatBalanceLine,
  formatSettlementLine,
  formatHelpText,
  formatNoBalancesMessage,
} = require('../core/format');

test('formatBox: builds structured box message', () => {
  const result = formatBox('Title', ['line1', 'line2'], 'footer');
  assert.ok(result.includes('┌ Title'));
  assert.ok(result.includes('│  line1'));
  assert.ok(result.includes('│  line2'));
  assert.ok(result.includes('└ footer'));
});

test('formatError: box format with problem, fix, and example', () => {
  const result = formatError('Bad input.', 'Use this.', '/foo bar');
  assert.ok(result.includes('┌ Bad input.'));
  assert.ok(result.includes('Use this.'));
  assert.ok(result.includes('Try: /foo bar'));
  assert.ok(result.includes('└ /help for commands'));
});

test('formatError: collapses multi-line problem text into one line', () => {
  const result = formatError('❌ line1\n• line2', 'Try again', '/help');
  assert.ok(result.includes('┌ line1 line2'));
  assert.ok(result.includes('Try again'));
});

test('formatBalanceLine: I owe', () => {
  assert.equal(
    formatBalanceLine({ direction: 'iOwe', otherName: 'Mohit', amount: 200 }),
    'You owe Mohit  ₹200.00'
  );
});

test('formatBalanceLine: owed to me', () => {
  assert.equal(
    formatBalanceLine({ direction: 'owedToMe', otherName: 'Vipul', amount: 50.5 }),
    'Vipul owes you  ₹50.50'
  );
});

test('formatSettlementLine: arrow format', () => {
  assert.equal(
    formatSettlementLine({ fromName: 'Carol', toName: 'Alice', amount: 100 }),
    'Carol → Alice  ₹100.00'
  );
});

test('formatHelpText: contains core commands', () => {
  const help = formatHelpText();
  for (const cmd of ['/split', '/paid', '/balances', '/history']) {
    assert.ok(help.includes(cmd), `help text should mention ${cmd}`);
  }
  assert.ok(help.includes('SplitWala'));
  assert.ok(help.includes('naturally'));
});

test('formatNoBalancesMessage: empty group vs settled group', () => {
  const empty = formatNoBalancesMessage(true);
  assert.ok(empty.includes('No expenses recorded yet.'));
  assert.ok(empty.includes('┌'));

  const settled = formatNoBalancesMessage(false);
  assert.ok(settled.includes('All Settled'));
  assert.ok(settled.includes('squared up'));
});

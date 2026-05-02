'use strict';
const { test }  = require('node:test');
const assert    = require('node:assert/strict');
const {
  formatError,
  formatBalanceLine,
  formatSettlementLine,
  formatHelpText,
  formatNoBalancesMessage,
} = require('../core/format');

test('formatError: three-line ❌/✅/📝 format', () => {
  assert.equal(
    formatError('Bad input.', 'Use this.', '/foo bar'),
    '❌ Bad input.\n✅ Use this.\n📝 Example: /foo bar'
  );
});

test('formatError: collapses multi-line problem text into one line', () => {
  assert.equal(
    formatError('❌ line1\n• line2', 'Try again', '/help'),
    '❌ line1 line2\n✅ Try again\n📝 Example: /help'
  );
});

test('formatBalanceLine: I owe', () => {
  assert.equal(
    formatBalanceLine({ direction: 'iOwe', otherName: 'Mohit', amount: 200 }),
    '• You owe Mohit ₹200.00'
  );
});

test('formatBalanceLine: owed to me', () => {
  assert.equal(
    formatBalanceLine({ direction: 'owedToMe', otherName: 'Vipul', amount: 50.5 }),
    '• Vipul owes you ₹50.50'
  );
});

test('formatSettlementLine: from owes to', () => {
  assert.equal(
    formatSettlementLine({ fromName: 'Carol', toName: 'Alice', amount: 100 }),
    'Carol owes Alice ₹100.00'
  );
});

test('formatHelpText: contains every command name', () => {
  const help = formatHelpText();
  for (const cmd of ['/split', '/balances', '/paid', '/got', '/summary', '/history', '/delete', '/resetall', '/help']) {
    assert.ok(help.includes(cmd), `help text should mention ${cmd}`);
  }
});

test('formatNoBalancesMessage: empty group vs settled group', () => {
  assert.equal(formatNoBalancesMessage(true),  'No expenses recorded yet.');
  assert.equal(formatNoBalancesMessage(false), '✅ All settled up!');
});

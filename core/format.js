'use strict';

const { formatCurrency } = require('./identity');

// ── Box-drawing message builder ──────────────────────────────────────────────

function formatBox(title, bodyLines, footer) {
  let msg = `┌ ${title}\n│\n`;
  for (const line of bodyLines) {
    msg += line === '' ? '│\n' : `│  ${line}\n`;
  }
  if (footer) {
    msg += `│\n└ ${footer}`;
  } else {
    msg += '└';
  }
  return msg;
}

function formatError(problem, fix, example) {
  const cleanProblem = String(problem || 'Invalid input.')
    .replace(/^\s*❌\s*/i, '')
    .split('\n')
    .map(line => line.replace(/^\s*[-•]\s*/, '').trim())
    .filter(Boolean)
    .join(' ');
  return formatBox(cleanProblem, [fix, `Try: ${example}`], '/help for commands');
}

function formatBalanceLine({ direction, otherName, amount }) {
  if (direction === 'iOwe') return `You owe ${otherName}  ${formatCurrency(amount)}`;
  return `${otherName} owes you  ${formatCurrency(amount)}`;
}

function formatSettlementLine({ fromName, toName, amount }) {
  return `${fromName} → ${toName}  ${formatCurrency(amount)}`;
}

function formatNoBalancesMessage(isEmptyGroup) {
  if (isEmptyGroup) return formatBox('No Data', ['No expenses recorded yet.'], '/split to add one');
  return formatBox('All Settled', ['Everyone is squared up.']);
}

const HELP_TEXT = [
  '━━━━━━━━━━━━━━━━━━━━━━━━',
  '  SplitWala',
  '━━━━━━━━━━━━━━━━━━━━━━━━',
  '',
  '/split 1500 dinner',
  '  Split an expense with the group',
  '',
  '/paid 500 to @alice',
  '  Record a payment',
  '',
  '/balances',
  '  See who owes what',
  '',
  '/history',
  '  View past transactions',
  '',
  '━━━━━━━━━━━━━━━━━━━━━━━━',
  'Just type naturally — I understand',
  '"split 800 for pizza among raj and priya"',
].join('\n');

function formatHelpText() {
  return HELP_TEXT;
}

module.exports = {
  formatBox,
  formatError,
  formatBalanceLine,
  formatSettlementLine,
  formatNoBalancesMessage,
  formatHelpText,
};

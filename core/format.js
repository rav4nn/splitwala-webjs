'use strict';
/**
 * core/format.js — text rendering for bot replies.
 *
 * Pure: takes plain JS objects / primitives, returns strings.
 * No Markdown / HTML — both transports send plain text by default
 * (Telegram entity formatting is handled by the platform adapter, not here).
 */

const { formatCurrency } = require('./identity');

function formatError(problem, fix, example) {
  const cleanProblem = String(problem || 'Invalid input.')
    .replace(/^\s*❌\s*/i, '')
    .split('\n')
    .map(line => line.replace(/^\s*[-•]\s*/, '').trim())
    .filter(Boolean)
    .join(' ');
  return `❌ ${cleanProblem}\n✅ ${fix}\n📝 Example: ${example}`;
}

/**
 * @param {{ direction: 'iOwe'|'owedToMe', otherName: string, amount: number }} entry
 */
function formatBalanceLine({ direction, otherName, amount }) {
  if (direction === 'iOwe') return `• You owe ${otherName} ${formatCurrency(amount)}`;
  return `• ${otherName} owes you ${formatCurrency(amount)}`;
}

function formatSettlementLine({ fromName, toName, amount }) {
  return `${fromName} owes ${toName} ${formatCurrency(amount)}`;
}

function formatNoBalancesMessage(isEmptyGroup) {
  return isEmptyGroup ? 'No expenses recorded yet.' : '✅ All settled up!';
}

// Plain text — no *bold* WhatsApp markdown. WhatsApp renders *…* natively.
// Telegram with parse_mode:'HTML' would show raw * chars, so we keep this neutral.
// Telegram handler wraps command names in <b> tags before sending if desired (sprint 3).
const HELP_TEXT = [
  'SplitWala — Commands',
  '',
  '/split <amount>  Split equally among everyone in the group',
  '/split <amount> @A @B  Split among only those people',
  '/split <amount> for <label>  Add an expense label',
  '/split <amount> by @A 100 @B 200  Custom contributions / debts',
  '',
  '/paid <amount> to @person  You paid them',
  '/paid <amount> from @person  They paid you',
  '/got <amount> from @person  Same as /paid <amt> from',
  '',
  '/balances  Show what you owe / are owed',
  '/balances @person  Just for that one person',
  '/summary  Group scoreboard (minimum settlements)',
  '',
  '/history [N] [@person]  Last N transactions (max 20)',
  '/delete  List recent transactions',
  '/delete N  Delete tx #N and reverse its balance impact',
  '',
  '/resetall confirm  Wipe ALL group data (irreversible)',
  '/help  Show this message',
].join('\n');

function formatHelpText() {
  return HELP_TEXT;
}

module.exports = {
  formatError,
  formatBalanceLine,
  formatSettlementLine,
  formatNoBalancesMessage,
  formatHelpText,
};

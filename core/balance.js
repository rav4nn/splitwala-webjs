'use strict';
/**
 * core/balance.js — pure math for balance simplification.
 *
 * No I/O, no DB, no platform calls. Operates on plain { id, net } arrays
 * where net > 0 means "this id is owed money" and net < 0 means "this id owes".
 */

const EPSILON = 0.005;

/** Round to 2 decimal places (commercial rounding). */
function roundCurrency(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Greedy debt-reduction algorithm: returns the minimal set of transfers
 * that settles all balances. Stable order: largest creditor paired with
 * largest debtor first.
 *
 * @param {Array<{ id: string, net: number }>} entries
 * @returns {Array<{ from: string, to: string, amount: number }>}
 */
function simplifyDebts(entries) {
  const filtered = entries.filter(p => Math.abs(p.net) > EPSILON);
  if (filtered.length === 0) return [];

  const creditors = filtered.filter(p => p.net > 0)
                            .map(p => ({ ...p }))
                            .sort((a, b) => b.net - a.net);
  const debtors   = filtered.filter(p => p.net < 0)
                            .map(p => ({ ...p }))
                            .sort((a, b) => a.net - b.net);

  const result = [];
  let i = 0, j = 0;
  while (i < creditors.length && j < debtors.length) {
    const credit = creditors[i];
    const debt   = debtors[j];
    const amount = Math.min(credit.net, -debt.net);
    if (amount > EPSILON) {
      result.push({ from: debt.id, to: credit.id, amount: roundCurrency(amount) });
      credit.net -= amount;
      debt.net   += amount;
    }
    if (Math.abs(credit.net) < EPSILON) i++;
    if (Math.abs(debt.net)   < EPSILON) j++;
  }
  return result;
}

module.exports = { simplifyDebts, roundCurrency, EPSILON };

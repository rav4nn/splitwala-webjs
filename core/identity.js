'use strict';
/**
 * core/identity.js — transport-agnostic identity & formatting helpers.
 *
 * MUST NOT import anything platform-specific (whatsapp-web.js, grammy, db.js).
 */

const ME_KEYWORDS = ['me', 'i', 'myself'];
const ALL_KEYWORD = '@all';

const ME_REGEX = /\b(me|i|myself)\b/i;

/** Format a numeric amount as ₹N.NN (Indian rupee, two decimals). */
function formatCurrency(amount) {
  return `₹${parseFloat(amount).toFixed(2)}`;
}

/** Generate a short unique-ish id (timestamp+random). Collision-safe within a single bot session. */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** True iff the token contains me/i/myself as a whole word (case-insensitive). */
function isSelfReference(token) {
  if (!token || typeof token !== 'string') return false;
  return ME_REGEX.test(token);
}

module.exports = {
  formatCurrency,
  generateId,
  isSelfReference,
  ME_KEYWORDS,
  ALL_KEYWORD,
};

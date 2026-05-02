'use strict';
/**
 * core/parser.js — pure command-line parsers.
 *
 * Each parser takes a raw command string and returns either
 *   { ...parsed fields, error: null }      // success
 * or
 *   { ...parsed fields possibly null, error: 'human-readable message' }
 *
 * Parsers DO NOT resolve people — they hand back free-text tokens
 * (e.g. "@Mohit", "me") that the platform-specific Resolver maps to ids.
 *
 * NO platform imports allowed in this file.
 */

// ── /paid ────────────────────────────────────────────────────────────────────

/**
 * Grammar (loose):
 *   /paid <amount> [to <token>] [from <token>]      — you paid <to>
 *   /paid <amount> from <token>                     — <from> paid you
 *   /paid <amount> from <token> to <token>          — third-party
 *   /paid <token> to me                             — clear all <token> owes you (no amount)
 *
 * Rules:
 *   • amount, when present, must be > 0
 *   • returns toToken / fromToken as the raw text after the keyword (the resolver consumes it)
 */
function parsePaidCommand(text) {
  const body = text.replace(/^\/paid\s*/i, '').trim();
  if (!body) {
    return { amount: null, toToken: null, fromToken: null,
             error: 'Use: /paid <amount> [to/from @person]' };
  }

  // (\S+) intentionally captures only the *next* whitespace-delimited token —
  // (@?\S+(?:\s+\S+)?) over-captured "@Vipul to" in "/paid 500 from @Vipul to @Mohit".
  const toMatch   = body.match(/\bto\s+(\S+)/i);
  const fromMatch = body.match(/\bfrom\s+(\S+)/i);

  // Strip out the to/from clauses to find the amount-or-token first segment
  let head = body;
  if (toMatch)   head = head.replace(toMatch[0], ' ');
  if (fromMatch) head = head.replace(fromMatch[0], ' ');
  head = head.replace(/\s+/g, ' ').trim();

  let amount = null;
  if (head) {
    const numMatch = head.match(/^-?\d+(?:\.\d+)?$/);
    if (numMatch) {
      const parsed = parseFloat(head);
      if (!(parsed > 0)) {
        return { amount: null, toToken: null, fromToken: null,
                 error: 'Amount must be a positive number.' };
      }
      amount = parsed;
    } else {
      // head is non-numeric
      if (!fromMatch && toMatch) {
        // "/paid @X to me" form — head is the from-token, no amount (clear-all)
        return { amount: null, toToken: toMatch[1].trim(), fromToken: head, error: null };
      }
      // Anything else with non-numeric head is treated as a bad amount
      return { amount: null, toToken: null, fromToken: null,
               error: 'Amount must be a positive number.' };
    }
  }

  return {
    amount,
    toToken:   toMatch   ? toMatch[1].trim()   : null,
    fromToken: fromMatch ? fromMatch[1].trim() : null,
    error: null,
  };
}

// ── /got ─────────────────────────────────────────────────────────────────────

function parseGotCommand(text) {
  const body = text.replace(/^\/got\s*/i, '').trim();
  // Match a single token after "from" — same rationale as parsePaidCommand.
  const match = body.match(/^(\d+(?:\.\d+)?)\s+from\s+(\S+)\s*$/i);
  if (!match) {
    return { amount: null, fromToken: null, error: 'Use: /got <amount> from @person' };
  }
  const amount = parseFloat(match[1]);
  if (!(amount > 0)) {
    return { amount: null, fromToken: null, error: 'Amount must be a positive number.' };
  }
  return { amount, fromToken: match[2].trim(), error: null };
}

// ── /history ─────────────────────────────────────────────────────────────────

function parseHistoryArgs(text) {
  const body = text.replace(/^\/history\s*/i, '').trim();
  if (!body) return { count: 5, filterToken: null, error: null };

  const tokens = body.split(/\s+/);
  let count = 5;
  let filterToken = null;

  for (const t of tokens) {
    if (/^\d+$/.test(t)) {
      count = Math.min(parseInt(t, 10), 20);
    } else {
      filterToken = t;
    }
  }
  return { count, filterToken, error: null };
}

// ── /delete ──────────────────────────────────────────────────────────────────

function parseDeleteArgs(text) {
  const body = text.replace(/^\/delete\s*/i, '').trim();
  if (!body) return { mode: 'list', index: null, error: null };
  if (!/^\d+$/.test(body) || parseInt(body, 10) < 1) {
    return { mode: 'delete', index: null, error: 'Index must be a positive integer.' };
  }
  return { mode: 'delete', index: parseInt(body, 10), error: null };
}

// ── label extraction ─────────────────────────────────────────────────────────
//
// Mirrors handlers.js extractLabel() but takes a raw text string instead of msg.
// New-line "for <label>" beats inline "for <label>". Max 40 chars.

function parseLabel(text) {
  const lines = String(text).split('\n').map(l => l.trim());

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^for\s+/i.test(line)) {
      const label = line.slice(4).trim();
      if (!label) return { label: null, error: 'Invalid label. Use: for <description>' };
      if (label.length > 40) return { label: null, error: 'Label too long. Max 40 characters allowed.' };
      return { label, error: null };
    }
    if (/^for\s*$/i.test(line)) {
      return { label: null, error: 'Invalid label. Use: for <description>' };
    }
  }

  const firstLine = lines[0];
  const tokens    = firstLine.split(' ');
  const lastFor   = tokens.lastIndexOf('for');
  if (lastFor === -1) return { label: null, error: null };

  const label = tokens.slice(lastFor + 1).join(' ').trim();
  if (!label) return { label: null, error: 'Invalid label. Use: for <description>' };
  if (label.length > 40) return { label: null, error: 'Label too long. Max 40 characters allowed.' };
  return { label, error: null };
}

// ── /resetall ────────────────────────────────────────────────────────────────

function parseResetAllArgs(text) {
  const body = text.replace(/^\/resetall\s*/i, '').trim().toLowerCase();
  return { confirmed: body === 'confirm' };
}

// ── /balances ────────────────────────────────────────────────────────────────

function parseBalancesArgs(text) {
  const body = text.replace(/^\/balances\s*/i, '').trim();
  return { targetToken: body || null };
}

module.exports = {
  parsePaidCommand,
  parseGotCommand,
  parseHistoryArgs,
  parseDeleteArgs,
  parseLabel,
  parseResetAllArgs,
  parseBalancesArgs,
};

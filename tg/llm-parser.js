'use strict';

const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';

const SYSTEM_PROMPT = `You extract expense information from casual group chat messages for a bill-splitting app.
Return ONLY valid JSON — no prose, no markdown fences, no explanation.

Schema (use null for unknown fields):
{
  "amount": <positive number or null>,
  "label": <short description string or null>,
  "payer": <"SENDER" if sender paid, "@username" if someone else paid, null if unknown>,
  "participants": <["@username_or_name", ...] array, or "ALL" for everyone, or null if unknown>,
  "split_type": <"equal" | "percent" | "exact" | null>,
  "split_values": <{"@username": number} only for percent/exact splits, else null>,
  "confidence": <"high" if amount+payer+participants are all clear, else "low">
}

Rules:
- amount: handle ₹1500, 1,500, 1.5k, "fifteen hundred". Return as a plain number.
- payer: "I paid", "mera tha", "maine diya", "I'll cover" → "SENDER". Named person → "@username" if they have one.
- participants "ALL": triggered by "everyone", "sab", "all of us", "hum sab", "group".
- participants array: list the @usernames or first names that are explicitly named.
- Self-references ("I", "me", "mera", "main", "mai") in participants → use "SENDER".
- Hindi-English code-switching is common — handle naturally.
- split_values for percent: values should sum to ~100. For exact: values should sum to amount.
- confidence "high" requires amount AND payer AND participants all clearly present.`;

/**
 * Call DeepSeek to parse a natural-language split message.
 * @param {string} text - the raw message text (e.g. "/split 1500 dinner raj priya")
 * @param {Array<{firstName, username}>} knownMembers - members cached for this group
 * @returns {Promise<object>} parsed intent object
 */
async function parseSplitIntent(text, knownMembers) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY not set');

  const membersCtx = knownMembers.length
    ? `\nKnown group members: ${knownMembers.map(m => m.firstName + (m.username ? ` (@${m.username})` : '')).join(', ')}`
    : '';

  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + membersCtx },
        { role: 'user', content: text },
      ],
      max_tokens: 300,
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek ${response.status}: ${body.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw = data.choices?.[0]?.message?.content?.trim() ?? '';
  // Strip accidental markdown fences
  const json = raw.replace(/^```json?\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(json);
}

module.exports = { parseSplitIntent };

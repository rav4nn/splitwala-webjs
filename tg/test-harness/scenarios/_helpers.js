'use strict';

// Drive the split wizard through any intermediate steps (payer selection,
// participant selection) until the "Add expense" confirm button appears,
// then tap it. Returns the final bot message (the edit with the split result).
async function confirmSplit(h) {
  const MAX_STEPS = 8;
  for (let i = 0; i < MAX_STEPS; i++) {
    const msg    = await h.expectReply({}, { timeout: 15000 });
    const rows   = msg.replyMarkup?.rows || [];
    const labels = rows.flatMap(r => (r.buttons || []).map(b => b.text || ''));

    // Final confirm step
    if (labels.some(l => /add expense/i.test(l))) {
      return h.tapButton(msg, /add expense/i, { timeout: 15000 });
    }

    // "Who paid?" keyboard — tap "You (I paid)"
    if (labels.some(l => /you.*paid|i paid/i.test(l))) {
      h.step('wizard-payer');
      await h.client.clickInlineButton(msg, /you.*paid|i paid/i);
      continue;
    }

    // Participant toggle keyboard — tap Done when available
    if (labels.some(l => /done/i.test(l))) {
      h.step('wizard-participants-done');
      await h.client.clickInlineButton(msg, /done/i);
      continue;
    }

    // No keyboard — plain text reply (likely an error or final state)
    return msg;
  }
  throw new Error(`confirmSplit: wizard did not reach confirm after ${MAX_STEPS} steps`);
}

module.exports = { confirmSplit };

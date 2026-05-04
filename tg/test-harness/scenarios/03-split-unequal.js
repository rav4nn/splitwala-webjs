'use strict';

const { confirmSplit } = require('./_helpers');
const p1 = process.env.TEST_PARTICIPANT_1 || 'metasmic';
const p2 = process.env.TEST_PARTICIPANT_2 || 'vipbhavs';

exports.id   = '03-split-unequal';
exports.name = 'Split unequal';

exports.run = async (h) => {
  await h.reset();

  h.step('split-cmd');
  // Natural language — LLM should parse the unequal amounts
  await h.send(`/split 600, @${p1} owes 400 and @${p2} owes 200`);

  h.step('wizard-to-confirm');
  const result = await confirmSplit(h);

  h.step('check-total');
  h.assertContains(result, '600');

  h.step('balances');
  await h.send('/balances');
  const bal = await h.expectReply({});
  // At least one of the unequal amounts should appear
  const text = bal.message || '';
  if (!text.includes('400') && !text.includes('200')) {
    throw new Error(`Expected balances to contain 400 or 200, got: "${text}"`);
  }
};

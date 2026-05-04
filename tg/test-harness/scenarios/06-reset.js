'use strict';

const { confirmSplit } = require('./_helpers');
const p1 = process.env.TEST_PARTICIPANT_1 || 'metasmic';

exports.id   = '06-reset';
exports.name = 'Reset all data';

exports.run = async (h) => {
  // Start clean
  await h.reset();

  // Create some data
  h.step('split-setup');
  await h.send(`/split 500 @${p1}`);
  await confirmSplit(h);

  // Verify there's something to reset
  h.step('balances-before');
  await h.send('/balances');
  const before = await h.expectReply({});
  const beforeText = before.message || '';
  if (beforeText.includes('settled up')) {
    throw new Error(`Expected unsettled balances before reset, got: "${beforeText}"`);
  }

  // Reset
  h.step('resetall');
  await h.send('/resetall confirm');
  const resetReply = await h.expectReply({});
  h.assertContains(resetReply, 'wiped');

  // Verify empty
  h.step('balances-after');
  await h.send('/balances');
  const after = await h.expectReply({});
  h.assertContains(after, 'settled up');
};

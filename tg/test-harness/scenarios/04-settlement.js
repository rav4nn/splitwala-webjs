'use strict';

const { confirmSplit } = require('./_helpers');
const p1 = process.env.TEST_PARTICIPANT_1 || 'metasmic';

exports.id   = '04-settlement';
exports.name = 'Settlement (paid/got)';

exports.run = async (h) => {
  await h.reset();

  // Set up: 600 split equally among sender + p1 (= 300 each)
  h.step('split-setup');
  await h.send(`/split 600 @${p1}`);
  await confirmSplit(h);

  // Record that p1 paid back 300 (full settlement)
  h.step('paid-cmd');
  await h.send(`/paid 300 from @${p1}`);
  const paidReply = await h.expectReply({});
  // Should acknowledge the payment
  const paidText = paidReply.message || '';
  if (!paidText.includes('300') && !paidText.toLowerCase().includes('settled') && !paidText.includes('✅')) {
    throw new Error(`Expected paid confirmation, got: "${paidText}"`);
  }

  h.step('balances-after-paid');
  await h.send('/balances');
  const bal = await h.expectReply({});
  // Should show settled or zero balance for p1
  const balText = bal.message || '';
  const isSettled = balText.toLowerCase().includes('settled') || balText.includes('✅') || balText === '';
  if (!isSettled && balText.includes('300')) {
    throw new Error(`Expected @${p1} to be settled but got: "${balText}"`);
  }

  // Test /got: split again with small amount, then record receipt
  h.step('split-for-got');
  await h.send(`/split 100 @${p1}`);
  await confirmSplit(h);

  h.step('got-cmd');
  await h.send(`/got 50 from @${p1}`);
  const gotReply = await h.expectReply({});
  const gotText  = gotReply.message || '';
  if (!gotText.includes('50') && !gotText.toLowerCase().includes('settled') && !gotText.includes('✅')) {
    throw new Error(`Expected /got confirmation, got: "${gotText}"`);
  }
};

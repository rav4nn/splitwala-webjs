'use strict';

const { confirmSplit } = require('./_helpers');
const p1 = process.env.TEST_PARTICIPANT_1 || 'metasmic';
const p2 = process.env.TEST_PARTICIPANT_2 || 'vipbhavs';

exports.id   = '02-split-equal';
exports.name = 'Split equal';

exports.run = async (h) => {
  await h.reset();

  h.step('split-cmd');
  await h.send(`/split 600 @${p1} @${p2}`);

  h.step('wizard-to-confirm');
  const result = await confirmSplit(h);

  h.step('check-amount');
  h.assertContains(result, '600');

  h.step('balances');
  await h.send('/balances');
  const bal = await h.expectReply({ contains: '200' });
  // At least one participant owes 200 (equal 3-way split of 600)
  h.assertContains(bal, '200');
};

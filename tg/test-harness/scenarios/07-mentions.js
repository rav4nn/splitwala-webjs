'use strict';

const { confirmSplit } = require('./_helpers');
const p1     = process.env.TEST_PARTICIPANT_1 || 'metasmic';
const p2     = process.env.TEST_PARTICIPANT_2 || 'vipbhavs';
const sender = process.env.TEST_SENDER        || 'curls1108';

exports.id   = '07-mentions';
exports.name = 'Mention rendering';

exports.run = async (h) => {
  await h.reset();

  h.step('split-cmd');
  await h.send(`/split 600 @${p1} @${p2}`);

  h.step('wizard-to-confirm');
  const result = await confirmSplit(h);

  // The sender (@curls1108) paid — their ID is known from ctx.from when they sent
  // the command, so they should render as a tg://user?id= inline mention.
  h.step('check-sender-inline');
  h.assertMentionRendersAs(result, sender, 'inline');

  // @metasmic and @vipbhavs have never messaged the group (IDs unknown)
  // → should render as plain @username text
  h.step('check-p1-plain');
  h.assertMentionRendersAs(result, p1, 'plain-username');

  h.step('check-p2-plain');
  h.assertMentionRendersAs(result, p2, 'plain-username');

  // Also check the /balances reply uses the same rendering
  h.step('balances-mentions');
  await h.send('/balances');
  const bal = await h.expectReply({});
  // Balances lists p1 and p2 as owing; they should still be plain-username
  h.assertMentionRendersAs(bal, p1, 'plain-username');
  h.assertMentionRendersAs(bal, p2, 'plain-username');
};

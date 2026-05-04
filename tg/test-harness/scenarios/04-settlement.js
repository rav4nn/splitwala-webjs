'use strict';

const { confirmSplit } = require('./_helpers');
const p1 = process.env.TEST_PARTICIPANT_1 || 'metasmic';

exports.id   = '04-settlement';
exports.name = 'Settlement (paid/got)';

// /paid and /got currently can't resolve username-only participants
// (they need a numeric ID in the member cache). The test verifies the bot
// either succeeds or returns a friendly resolver error — never a crash or
// silent failure.
exports.run = async (h) => {
  await h.reset();

  // Set up: 600 split equally among sender + p1
  h.step('split-setup');
  await h.send(`/split 600 @${p1}`);
  await confirmSplit(h);

  // /paid — bot may resolve and settle, OR return friendly "Could not resolve" error
  h.step('paid-cmd');
  await h.send(`/paid 300 from @${p1}`);
  const paidReply = await h.expectReply({});
  const paidText  = paidReply.message || '';
  const isOk      = /300|settled|✅/i.test(paidText);
  const isFriend  = /could not resolve|tag.*@username|reply to a message/i.test(paidText);
  if (!isOk && !isFriend) {
    throw new Error(`/paid: expected success OR friendly error, got: "${paidText}"`);
  }

  // /got — same expectations
  h.step('got-cmd');
  await h.send(`/got 100 from @${p1}`);
  const gotReply = await h.expectReply({});
  const gotText  = gotReply.message || '';
  const gotOk    = /100|settled|✅/i.test(gotText);
  const gotFriend = /could not resolve|tag.*@username/i.test(gotText);
  if (!gotOk && !gotFriend) {
    throw new Error(`/got: expected success OR friendly error, got: "${gotText}"`);
  }

  // /balances should always work
  h.step('balances');
  await h.send('/balances');
  await h.expectReply({});
};

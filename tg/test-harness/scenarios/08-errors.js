'use strict';

exports.id   = '08-errors';
exports.name = 'Error handling';

exports.run = async (h) => {
  await h.reset();

  // /split with no args → friendly usage error (not a crash/exception)
  h.step('split-no-args');
  await h.send('/split');
  const splitErr = await h.expectReply({});
  const splitText = splitErr.message || '';
  if (!splitText && !splitErr.replyMarkup) {
    throw new Error('/split with no args returned an empty reply');
  }
  // Should NOT contain a stack trace or "undefined"
  if (splitText.includes('TypeError') || splitText.includes('undefined is not')) {
    throw new Error(`/split no-args returned a crash: "${splitText}"`);
  }

  // /paid to an unknown user → friendly error
  h.step('paid-unknown-user');
  await h.send('/paid 100 from @completelyfakeuser99999');
  const paidErr = await h.expectReply({});
  const paidText = paidErr.message || '';
  if (!paidText) throw new Error('/paid unknown user returned empty reply');
  if (paidText.includes('TypeError') || paidText.includes('Cannot read')) {
    throw new Error(`/paid unknown user returned a crash: "${paidText}"`);
  }

  // /delete nonexistent ID → friendly error
  h.step('delete-bad-id');
  await h.send('/delete');
  const delReply = await h.expectReply({});
  // Either shows "no transactions" message or a selection keyboard (depends on ledger state)
  // Either way it must not crash
  const delText = delReply.message || '';
  if (delText.includes('TypeError') || delText.includes('Cannot read')) {
    throw new Error(`/delete returned a crash: "${delText}"`);
  }
};

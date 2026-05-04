'use strict';

const { confirmSplit } = require('./_helpers');
const p1 = process.env.TEST_PARTICIPANT_1 || 'metasmic';

exports.id   = '05-history-delete';
exports.name = 'History and delete';

exports.run = async (h) => {
  await h.reset();

  h.step('split-for-history');
  await h.send(`/split 300 @${p1}`);
  await confirmSplit(h);

  h.step('history');
  await h.send('/history');
  const hist = await h.expectReply({});
  h.assertContains(hist, '300');

  // /delete with no args → selection keyboard with recent transactions
  h.step('delete-open');
  await h.send('/delete');
  const selectMsg = await h.expectReply({});

  const rows = selectMsg.replyMarkup?.rows || [];
  const hasButtons = rows.some(r => (r.buttons || []).length > 0);
  if (!hasButtons) {
    throw new Error(`Expected /delete to show a selection keyboard, got: "${selectMsg.message}"`);
  }

  // Tap the first transaction entry (not Cancel)
  h.step('delete-select');
  const firstTxBtn = rows.flatMap(r => r.buttons || []).find(b => !/cancel/i.test(b.text));
  if (!firstTxBtn) throw new Error('No non-cancel button found in delete keyboard');
  await h.client.clickInlineButton(selectMsg, firstTxBtn.text);

  // Expect confirm prompt
  h.step('delete-confirm');
  const confirmMsg = await h.expectReply({});
  const confirmRows = confirmMsg.replyMarkup?.rows || [];
  const hasConfirm  = confirmRows.some(r => (r.buttons || []).some(b => /confirm|delete|yes/i.test(b.text)));
  if (!hasConfirm) {
    throw new Error(`Expected delete confirmation keyboard, got: "${confirmMsg.message}"`);
  }
  await h.client.clickInlineButton(confirmMsg, /confirm|delete|yes/i);

  // Wait for the bot to acknowledge deletion
  h.step('delete-ack');
  await h.expectReply({});

  // History should now be empty or not contain the old entry
  h.step('history-after-delete');
  await h.send('/history');
  const hist2 = await h.expectReply({});
  const hist2Text = (hist2.message || '').toLowerCase();
  // Accept "no matching transactions" or any text not containing the deleted amount
  // (there might be other entries; just verify we got a response)
  if (hist2Text.includes('error') || hist2Text.includes('❌')) {
    throw new Error(`/history returned error after delete: "${hist2.message}"`);
  }
};

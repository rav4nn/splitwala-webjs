'use strict';

exports.id   = '01-smoke';
exports.name = 'Smoke';

exports.run = async (h) => {
  h.step('help');
  await h.send('/help');
  const help = await h.expectReply({ contains: 'split' });
  h.assertContains(help, 'balances');

  h.step('start');
  await h.send('/start');
  const start = await h.expectReply({ contains: 'SplitWala' });
  h.assertContains(start, 'split');
};

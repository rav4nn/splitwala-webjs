'use strict';
const { test } = require('node:test');
const assert   = require('node:assert/strict');

const memberCache = require('../tg/member-cache');
const { createResolver } = require('../tg/tg-resolver');

// ── Test fixtures: pre-seed the cache ────────────────────────────────────────
const CHAT = -1001234567890;
memberCache.recordMember(CHAT, { id: 100, first_name: 'Alice', username: 'alice_t' });
memberCache.recordMember(CHAT, { id: 200, first_name: 'Bob',   last_name: 'Smith', username: 'bobby' });
memberCache.recordMember(CHAT, { id: 300, first_name: 'Carol' });   // no username

// Build a fake grammy ctx
function fakeCtx({ text, fromId = 100, entities = [] }) {
  return {
    chat: { id: CHAT, type: 'supergroup' },
    from: { id: fromId, first_name: 'Alice', username: 'alice_t' },
    message: { text, entities, from: { id: fromId } },
  };
}

test('resolveByText: "me" returns sender', async () => {
  const r = createResolver(fakeCtx({ text: '/split 100' }));
  const res = await r.resolveByText('me');
  assert.equal(res.id, '100');
});

test('resolveByText: @username matches cached member', async () => {
  const r = createResolver(fakeCtx({ text: '/split 100 @bobby' }));
  const res = await r.resolveByText('@bobby');
  assert.equal(res.id, '200');
});

test('resolveByText: plain name matches by display name', async () => {
  const r = createResolver(fakeCtx({ text: '/split 100' }));
  const res = await r.resolveByText('Carol');
  assert.equal(res.id, '300');
});

test('resolveByText: text_mention entity (user without @username) resolves via mentionRef', async () => {
  // Telegram delivers a text_mention entity with full user object
  const ctx = fakeCtx({
    text: '/split 100 Carol',
    entities: [{ type: 'text_mention', offset: 11, length: 5, user: { id: 300, first_name: 'Carol' } }],
  });
  const r = createResolver(ctx);
  const res = await r.resolveByText('Carol');
  assert.equal(res.id, '300');
});

test('resolveByText: unknown returns null', async () => {
  const r = createResolver(fakeCtx({ text: '/split 100 @ghost' }));
  assert.equal(await r.resolveByText('@ghost'), null);
});

test('listAllParticipants: returns everyone in cache (excluding bot, but bot is not seeded here)', async () => {
  const r = createResolver(fakeCtx({ text: '/split 100 @all' }));
  const all = await r.listAllParticipants();
  assert.equal(all.length, 3);
  assert.deepEqual(all.map(p => p.id).sort(), ['100', '200', '300']);
});

test('isSelfReference: delegates to core', () => {
  const r = createResolver(fakeCtx({ text: '/split 100' }));
  assert.equal(r.isSelfReference('me'),    true);
  assert.equal(r.isSelfReference('Alice'), false);
});

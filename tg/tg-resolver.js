'use strict';
/**
 * tg/tg-resolver.js — Resolver implementation for grammy Context.
 *
 * Implements the Resolver interface documented in sprints/sprint_2/plan.md.
 * Uses tg/member-cache.js as the source of truth for known group members.
 */

const memberCache = require('./member-cache');
const { isSelfReference } = require('../core/identity');

function createResolver(ctx) {
  const chatId   = ctx.chat?.id;
  const senderId = String(ctx.from?.id || '');

  // Always remember the sender — handy for first-time DMs / new groups.
  if (chatId && ctx.from) memberCache.recordMember(chatId, ctx.from);

  // Index text_mention entities so resolveByText can find users WITHOUT a @username
  const textMentions = new Map();   // lowercased name → { id, name, username:null }
  const entities = ctx.message?.entities || [];
  const text     = ctx.message?.text || '';
  for (const e of entities) {
    if (e.type === 'text_mention' && e.user) {
      memberCache.recordMember(chatId, e.user);
      const slice = text.slice(e.offset, e.offset + e.length).toLowerCase();
      textMentions.set(slice, { id: String(e.user.id) });
    }
  }

  return {
    senderId,
    senderDisplayId: senderId,

    isSelfReference(token) {
      return isSelfReference(token);
    },

    async resolveByText(rawToken) {
      if (!rawToken) return null;
      const token = String(rawToken).trim();

      if (isSelfReference(token)) {
        return { id: senderId, mentionRef: { type: 'self', userId: Number(senderId) } };
      }

      // text_mention match (e.g. names without @username, that Telegram tagged for us)
      const lc = token.toLowerCase().replace(/^@/, '');
      const tm = textMentions.get(token.toLowerCase()) || textMentions.get(lc);
      if (tm) return { id: tm.id, mentionRef: { type: 'text_mention', userId: Number(tm.id) } };

      // @username match
      if (/^@\w+$/.test(token)) {
        const found = memberCache.lookupByUsername(chatId, token);
        if (found) return { id: found.id, mentionRef: { type: 'username', username: found.username } };
        // User not cached yet — use @username as synthetic ID (matches split wizard behaviour)
        const uname = token.toLowerCase().replace(/^@/, '');
        const syntheticId = `@${uname}`;
        return { id: syntheticId, mentionRef: { type: 'username', username: uname } };
      }

      // Plain name match in cached members
      const byName = memberCache.lookupByName(chatId, token);
      if (byName) {
        return {
          id: byName.id,
          mentionRef: byName.username
            ? { type: 'username',     username: byName.username }
            : { type: 'text_mention', userId:   Number(byName.id) },
        };
      }
      return null;
    },

    async listAllParticipants() {
      const list = memberCache.listMembers(chatId);
      return list.map(m => ({
        id: m.id,
        mentionRef: m.username
          ? { type: 'username',     username: m.username }
          : { type: 'text_mention', userId:   Number(m.id) },
      }));
    },
  };
}

module.exports = { createResolver };

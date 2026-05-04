'use strict';
/**
 * In-memory cache of group members per chat: chatId → Map<userId, { name, username }>.
 * Repopulated on bot start; updated lazily as messages arrive.
 */

const cache = new Map();

function getMembers(chatId) {
  const key = String(chatId);
  if (!cache.has(key)) cache.set(key, new Map());
  return cache.get(key);
}

function recordMember(chatId, user) {
  if (!user || !user.id) return;
  const members = getMembers(chatId);
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
            || user.username
            || String(user.id);
  members.set(String(user.id), { name, username: user.username ? user.username.toLowerCase() : null });
}

function listMembers(chatId) {
  return [...getMembers(chatId).entries()].map(([id, v]) => ({ id, ...v }));
}

function lookupByUsername(chatId, username) {
  const u = username.replace(/^@/, '').toLowerCase();
  for (const [id, v] of getMembers(chatId)) {
    if (v.username === u) return { id, ...v };
  }
  return null;
}

function lookupByName(chatId, text) {
  const needle = text.toLowerCase();
  for (const [id, v] of getMembers(chatId)) {
    const n = v.name.toLowerCase();
    if (n === needle || n.includes(needle) || needle.includes(n)) {
      return { id, ...v };
    }
  }
  return null;
}

function getKnownMembers(chatId) {
  return [...getMembers(chatId).entries()]
    .map(([userId, v]) => ({
      userId,
      username: v.username,
      firstName: (v.name || '').split(' ')[0] || v.username || `…${userId.slice(-4)}`,
      name: v.name,
    }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName));
}

module.exports = { recordMember, listMembers, lookupByUsername, lookupByName, getKnownMembers };

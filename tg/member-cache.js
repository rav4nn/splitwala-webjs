'use strict';
/**
 * In-memory cache of group members per chat: chatId → Map<userId, { name, username }>.
 * Write-through to SQLite so data survives restarts.
 * On cache miss per chat, loads from DB lazily.
 */

const db = require('./db-tg');

const cache = new Map();
const loadedChats = new Set();

function ensureChat(chatId) {
  const key = String(chatId);
  if (!cache.has(key)) cache.set(key, new Map());
  if (!loadedChats.has(key)) {
    const rows = db.getMembersByChatId(key);
    const members = cache.get(key);
    for (const row of rows) {
      if (!members.has(row.user_id)) {
        members.set(row.user_id, { name: row.name, username: row.username || null });
      }
    }
    loadedChats.add(key);
  }
  return cache.get(key);
}

function recordMember(chatId, user) {
  if (!user || !user.id) return;
  const members = ensureChat(chatId);
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
            || user.username
            || String(user.id);
  const username = user.username ? user.username.toLowerCase() : null;
  members.set(String(user.id), { name, username });
  db.upsertMember(chatId, user.id, name, username);
}

function listMembers(chatId) {
  return [...ensureChat(chatId).entries()].map(([id, v]) => ({ id, ...v }));
}

function lookupByUsername(chatId, username) {
  const u = username.replace(/^@/, '').toLowerCase();
  for (const [id, v] of ensureChat(chatId)) {
    if (v.username === u) return { id, ...v };
  }
  return null;
}

function lookupByName(chatId, text) {
  const needle = text.toLowerCase();
  for (const [id, v] of ensureChat(chatId)) {
    const n = v.name.toLowerCase();
    if (n === needle || n.includes(needle) || needle.includes(n)) {
      return { id, ...v };
    }
  }
  return null;
}

function getKnownMembers(chatId) {
  return [...ensureChat(chatId).entries()]
    .map(([userId, v]) => ({
      userId,
      username: v.username,
      firstName: (v.name || '').split(' ')[0] || v.username || `…${userId.slice(-4)}`,
      name: v.name,
    }))
    .sort((a, b) => a.firstName.localeCompare(b.firstName));
}

module.exports = { recordMember, listMembers, lookupByUsername, lookupByName, getKnownMembers };

'use strict';

const { TelegramClient, Api } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Raw } = require('telegram/events');

class TGClient {
  constructor({ apiId, apiHash, sessionString, botUsername, chatId }) {
    this.botUsername = botUsername;
    this.chatId      = chatId;
    this.botId       = null;
    this.myUserId    = null;
    this.session     = new StringSession(sessionString || '');
    this.client      = new TelegramClient(this.session, Number(apiId), apiHash, {
      connectionRetries: 5,
    });
    this._queue   = [];
    this._waiters = [];
  }

  async connect() {
    await this.client.start({
      phoneNumber: () => { throw new Error('No session. Run login.js first.'); },
      phoneCode:   () => { throw new Error('No session. Run login.js first.'); },
      password:    () => { throw new Error('No session. Run login.js first.'); },
      onError:     err => console.error('[TGClient]', err.message),
    });

    const me        = await this.client.getMe();
    this.myUserId   = String(me.id);

    const botEntity = await this.client.getEntity(this.botUsername);
    this.botId      = String(botEntity.id);

    this.client.addEventHandler(this._onRaw.bind(this), new Raw());
    console.log(`[TGClient] connected as ${me.username || me.id}, watching bot ${this.botUsername} (${this.botId})`);
  }

  _normId(id) {
    return String(id).replace(/^-100/, '');
  }

  _isFromBot(msg) {
    const uid = msg.fromId?.userId ?? msg.senderId;
    return uid != null && String(uid) === this.botId;
  }

  _isInGroup(msg) {
    const raw = msg.peerId?.channelId ?? msg.peerId?.chatId;
    if (raw == null) return false;
    return this._normId(raw) === this._normId(this.chatId);
  }

  _dispatch(msg) {
    for (let i = 0; i < this._waiters.length; i++) {
      if (this._waiters[i].predicate(msg)) {
        const [w] = this._waiters.splice(i, 1);
        w.resolve(msg);
        return;
      }
    }
    this._queue.push(msg);
  }

  _onRaw(update) {
    let msg = null;
    if (
      update instanceof Api.UpdateNewMessage         ||
      update instanceof Api.UpdateNewChannelMessage  ||
      update instanceof Api.UpdateEditMessage        ||
      update instanceof Api.UpdateEditChannelMessage
    ) {
      msg = update.message;
    }
    if (!msg || !(msg instanceof Api.Message)) return;
    if (!this._isFromBot(msg)) return;
    if (!this._isInGroup(msg)) return;
    this._dispatch(msg);
  }

  async waitForBotMessage(predicate, timeoutMs) {
    for (let i = 0; i < this._queue.length; i++) {
      if (predicate(this._queue[i])) return this._queue.splice(i, 1)[0];
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this._waiters.findIndex(w => w.resolve === resolve);
        if (idx >= 0) this._waiters.splice(idx, 1);
        reject(new Error(`Timeout (${timeoutMs}ms): no matching bot message arrived`));
      }, timeoutMs);
      this._waiters.push({
        predicate,
        resolve: msg => { clearTimeout(timer); resolve(msg); },
      });
    });
  }

  async sendMessage(text) {
    await this.client.sendMessage(this.chatId, { message: text });
  }

  async clickInlineButton(message, matcher) {
    const rows = message.replyMarkup?.rows || [];
    for (const row of rows) {
      for (const btn of (row.buttons || [])) {
        const label = btn.text || '';
        const hit   = matcher instanceof RegExp
          ? matcher.test(label)
          : label.toLowerCase().includes(String(matcher).toLowerCase());
        if (hit && btn.data) {
          await this.client.invoke(new Api.messages.GetBotCallbackAnswer({
            peer:  await this.client.getInputEntity(this.chatId),
            msgId: message.id,
            data:  btn.data,
          }));
          return label;
        }
      }
    }
    const avail = rows.flatMap(r => (r.buttons || []).map(b => `"${b.text}"`)).join(', ');
    throw new Error(`Button not found: "${matcher}". Available: ${avail}`);
  }

  async disconnect() {
    try { await this.client.disconnect(); } catch (_) {}
  }
}

module.exports = TGClient;

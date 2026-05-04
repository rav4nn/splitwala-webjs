'use strict';

class AssertionError extends Error {
  constructor(msg, ctx = {}) {
    super(msg);
    this.name = 'AssertionError';
    this.ctx  = ctx;
  }
}

class Harness {
  constructor(client, opts = {}) {
    this.client       = client;
    this.timeout      = opts.timeout || 10000;
    this._captured    = [];
    this._currentStep = 'init';
  }

  step(label) {
    this._currentStep = label;
  }

  async send(text) {
    await this.client.sendMessage(text);
    // Small delay to avoid Telegram flood control and let the bot start processing.
    await new Promise(r => setTimeout(r, 400));
  }

  async expectReply(matcher = {}, opts = {}) {
    const timeout   = opts.timeout ?? this.timeout;
    const predicate = this._predicate(matcher);
    try {
      const msg = await this.client.waitForBotMessage(predicate, timeout);
      this._captured.push(msg);
      return msg;
    } catch (err) {
      throw new AssertionError(
        `[${this._currentStep}] ${err.message}` +
        (matcher.contains ? `\nExpected: contains "${matcher.contains}"` : '') +
        `\nLast messages: ${JSON.stringify(this._captured.slice(-3).map(m => m.message))}`,
        { step: this._currentStep },
      );
    }
  }

  async expectNoReply(opts = {}) {
    const timeout = opts.timeout ?? 3000;
    let msg;
    try {
      msg = await this.client.waitForBotMessage(() => true, timeout);
    } catch (_) {
      return; // timeout = no reply = good
    }
    this._captured.push(msg);
    throw new AssertionError(
      `[${this._currentStep}] Expected no reply but got: "${msg.message}"`,
      { step: this._currentStep },
    );
  }

  async tapButton(message, matcher, opts = {}) {
    await this.client.clickInlineButton(message, matcher);
    return this.expectReply({}, { timeout: opts.timeout ?? this.timeout });
  }

  assertContains(message, sub) {
    const text = message.message || '';
    if (!text.toLowerCase().includes(sub.toLowerCase())) {
      throw new AssertionError(
        `[${this._currentStep}] Expected message to contain "${sub}"\nGot: "${text}"`,
        { step: this._currentStep },
      );
    }
  }

  // expected: 'inline' | 'plain-username' | 'text'
  // 'inline'        → MessageEntityMentionName entity (tg://user?id= link)
  // 'plain-username'→ MessageEntityMention entity (plain @username text)
  // 'text'          → name appears with no entity at all
  //
  // Each assertion is scoped to ONE user — entities for OTHER users in the
  // same message are ignored.
  assertMentionRendersAs(message, username, expected) {
    const text     = message.message || '';
    const entities = message.entities || [];
    const needle   = username.replace('@', '').toLowerCase();
    const isSelf   = needle === (process.env.TEST_SENDER || '').toLowerCase();

    const plainMention = entities.find(e =>
      (e.className || '') === 'MessageEntityMention' &&
      text.slice(e.offset, e.offset + e.length).toLowerCase().replace('@', '') === needle,
    );

    const selfInline = isSelf && this.client.myUserId
      ? entities.find(e =>
          (e.className || '') === 'MessageEntityMentionName' &&
          String(e.userId) === this.client.myUserId,
        )
      : null;

    if (expected === 'inline') {
      if (selfInline) return;
      // For non-self 'inline' we don't know userId; we accept the absence of a
      // plain-mention as a strong signal that the user is rendered some other way.
      // (This branch isn't exercised by current scenarios.)
      if (!isSelf && entities.some(e => (e.className || '') === 'MessageEntityMentionName') && !plainMention) {
        return;
      }
      throw new AssertionError(
        `[${this._currentStep}] @${username}: expected "inline" but no matching MentionName entity. ` +
        `Plain @${username}? ${!!plainMention}`,
        { step: this._currentStep },
      );
    }

    if (expected === 'plain-username') {
      if (plainMention) return;
      throw new AssertionError(
        `[${this._currentStep}] @${username}: expected "plain-username" but no MessageEntityMention found for @${username}`,
        { step: this._currentStep },
      );
    }

    if (expected === 'text') {
      if (!plainMention && !selfInline) return;
      throw new AssertionError(
        `[${this._currentStep}] @${username}: expected "text" but found a mention entity`,
        { step: this._currentStep },
      );
    }

    throw new AssertionError(
      `[${this._currentStep}] @${username}: unknown expected value "${expected}"`,
      { step: this._currentStep },
    );
  }

  async reset() {
    const prev = this._currentStep;
    this.step('reset');
    this._captured = [];
    await this.send('/resetall confirm');
    await this.expectReply({}, { timeout: 5000 }).catch(() => {});
    this._captured = [];
    this.step(prev);
  }

  captured() {
    return [...this._captured];
  }

  _predicate(matcher) {
    if (typeof matcher.predicate === 'function') return matcher.predicate;
    if (matcher.contains) {
      const sub = matcher.contains.toLowerCase();
      return msg => (msg.message || '').toLowerCase().includes(sub);
    }
    if (matcher.regex) return msg => matcher.regex.test(msg.message || '');
    return () => true;
  }
}

module.exports = { Harness, AssertionError };

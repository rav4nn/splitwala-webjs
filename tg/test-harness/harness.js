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
  // 'text'          → no entity at all
  assertMentionRendersAs(message, username, expected) {
    const text     = message.message || '';
    const entities = message.entities || [];
    const needle   = username.replace('@', '').toLowerCase();
    const isSelf   = needle === (process.env.TEST_SENDER || '').toLowerCase();

    for (const e of entities) {
      const span = text.slice(e.offset, e.offset + e.length);
      const type = e.className || e.constructor?.name || '';

      if (type === 'MessageEntityMentionName') {
        // Inline tg://user?id= link.
        // For self: verify userId matches our own ID.
        // For others: any MentionName in the message body is treated as a match
        // (our test setup ensures only the sender has a known ID).
        if (isSelf && this.client.myUserId && String(e.userId) !== this.client.myUserId) continue;
        if (expected === 'inline') return;
        throw new AssertionError(
          `[${this._currentStep}] @${username}: expected "${expected}" but rendered as inline (tg://user?id=${e.userId})`,
          { step: this._currentStep, entityType: type, userId: e.userId },
        );
      }

      if (type === 'MessageEntityMention') {
        // Plain @username auto-link.
        if (span.toLowerCase().replace('@', '') !== needle) continue;
        if (expected === 'plain-username') return;
        throw new AssertionError(
          `[${this._currentStep}] @${username}: expected "${expected}" but rendered as plain-username`,
          { step: this._currentStep, entityType: type, span },
        );
      }
    }

    if (expected === 'text') return;
    const entitySummary = entities.map(e => ({
      type: e.className,
      span: text.slice(e.offset, e.offset + e.length),
    }));
    throw new AssertionError(
      `[${this._currentStep}] @${username}: expected "${expected}" but found no matching entity.\n` +
      `Message: "${text}"\nEntities: ${JSON.stringify(entitySummary)}`,
      { step: this._currentStep, entitySummary },
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

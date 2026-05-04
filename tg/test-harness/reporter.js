'use strict';

const fs = require('fs');

class Reporter {
  constructor({ botUsername, chatId }) {
    this.botUsername = botUsername;
    this.chatId      = chatId;
    this.startedAt   = new Date().toISOString();
    this.scenarios   = [];
    this._current    = null;
  }

  beginScenario(id, name) {
    this._current = {
      id,
      name,
      status:     'running',
      startMs:    Date.now(),
      steps:      [],
      failure:    null,
    };
  }

  recordStep(label, status, sent, received) {
    if (!this._current) return;
    this._current.steps.push({ label, status, sent, received });
  }

  passScenario() {
    if (!this._current) return;
    this._current.status    = 'passed';
    this._current.durationMs = Date.now() - this._current.startMs;
    this.scenarios.push(this._current);
    this._current = null;
  }

  failScenario(err, capturedMessages) {
    if (!this._current) return;
    this._current.status    = 'failed';
    this._current.durationMs = Date.now() - this._current.startMs;
    this._current.failure   = {
      step:     err.ctx?.step || 'unknown',
      message:  err.message,
      context:  (capturedMessages || []).slice(-5).map(m => m.message || ''),
    };
    this.scenarios.push(this._current);
    this._current = null;
  }

  buildReport() {
    const finishedAt   = new Date().toISOString();
    const total        = this.scenarios.length;
    const passed       = this.scenarios.filter(s => s.status === 'passed').length;
    const failed       = this.scenarios.filter(s => s.status === 'failed').length;
    const skipped      = this.scenarios.filter(s => s.status === 'skipped').length;
    const durationMs   = this.scenarios.reduce((acc, s) => acc + (s.durationMs || 0), 0);

    return {
      schemaVersion: 1,
      startedAt:     this.startedAt,
      finishedAt,
      durationMs,
      botUsername:   this.botUsername,
      testGroup:     String(this.chatId),
      summary:       { total, passed, failed, skipped },
      scenarios:     this.scenarios,
    };
  }

  writeJson(path) {
    const report = this.buildReport();
    fs.writeFileSync(path, JSON.stringify(report, null, 2));
    return report;
  }

  writeMd(path, report) {
    const r   = report || this.buildReport();
    const ts  = new Date(r.startedAt).toUTCString();
    const dur = (r.durationMs / 1000).toFixed(1);
    const lines = [
      `# Splitwala TG Test Run — ${ts}`,
      '',
      `Result: ${r.summary.passed}/${r.summary.total} passed` +
        (r.summary.failed > 0 ? ` (${r.summary.failed} FAILED)` : '') +
        ` — ${dur}s`,
      '',
    ];

    const failed = r.scenarios.filter(s => s.status === 'failed');
    if (failed.length > 0) {
      lines.push('## [FAIL] Failed scenarios', '');
      for (const s of failed) {
        lines.push(`### ${s.name} — failed at step "${s.failure?.step}"`, '');
        if (s.failure?.message) {
          lines.push(s.failure.message, '');
        }
        if (s.failure?.context?.length) {
          lines.push('Last bot messages:');
          for (const m of s.failure.context) lines.push(`  > ${m}`);
          lines.push('');
        }
      }
    }

    const passed = r.scenarios.filter(s => s.status === 'passed');
    if (passed.length > 0) {
      lines.push('## [PASS] Passed scenarios', '');
      for (const s of passed) {
        lines.push(`- ${s.name} (${((s.durationMs || 0) / 1000).toFixed(1)}s)`);
      }
      lines.push('');
    }

    fs.writeFileSync(path, lines.join('\n'));
  }
}

module.exports = Reporter;

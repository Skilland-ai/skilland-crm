import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_LOG_DIR = path.resolve(
  '04_outputs',
  'crm_manual_update_crew',
  'logs',
);

export class SessionLogger {
  constructor({ outputDir = DEFAULT_LOG_DIR, apply, filters }) {
    fs.mkdirSync(outputDir, { recursive: true });
    this.startedAt = new Date().toISOString();
    this.filePath = path.join(
      outputDir,
      `session_${this.startedAt.replace(/[:.]/g, '-')}.json`,
    );
    this.session = {
      tool: 'crm-manual-update-crew',
      startedAt: this.startedAt,
      finishedAt: null,
      user: process.env.USER ?? null,
      mode: apply ? 'apply' : 'dry-run',
      filters,
      events: [],
    };
    this.flush();
  }

  record(event) {
    this.session.events.push({
      at: new Date().toISOString(),
      ...event,
    });
    this.flush();
  }

  finish(summary) {
    this.session.finishedAt = new Date().toISOString();
    this.session.summary = summary;
    this.flush();
  }

  flush() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.session, null, 2));
  }
}


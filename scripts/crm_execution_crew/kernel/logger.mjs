import fs from 'node:fs';
import path from 'node:path';

import { CRM_EXECUTION_TOOL, sanitizeForLog } from './contracts.mjs';

const DEFAULT_LOG_DIR = path.resolve(
  '04_outputs',
  'crm_execution_crew',
  'logs',
);

export class CrmExecutionLogger {
  constructor({ outputDir = DEFAULT_LOG_DIR } = {}) {
    fs.mkdirSync(outputDir, { recursive: true });
    this.startedAt = new Date().toISOString();
    this.filePath = path.join(
      outputDir,
      `session_${this.startedAt.replace(/[:.]/g, '-')}.json`,
    );
  }

  finish(session) {
    const payload = sanitizeForLog({
      tool: CRM_EXECUTION_TOOL,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      user: process.env.USER ?? null,
      ...session,
    });
    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2));
    return this.filePath;
  }
}

export { DEFAULT_LOG_DIR };


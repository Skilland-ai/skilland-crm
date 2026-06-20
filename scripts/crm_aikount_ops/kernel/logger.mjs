import fs from 'node:fs';
import path from 'node:path';

import { CRM_AIKOUNT_TOOL, sanitizeForLog } from './contracts.mjs';

export const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs', 'crm_aikount_ops');

export class CrmAikountLogger {
  constructor({ outputDir = DEFAULT_OUTPUT_DIR } = {}) {
    this.outputDir = outputDir;
    fs.mkdirSync(outputDir, { recursive: true });
    fs.mkdirSync(path.join(outputDir, 'state'), { recursive: true });
    this.startedAt = new Date().toISOString();
    const safeTimestamp = this.startedAt.replace(/[:.]/g, '-');
    this.filePath = path.join(outputDir, `session_${safeTimestamp}.json`);
    this.reviewPath = path.join(outputDir, `session_${safeTimestamp}.md`);
  }

  finish({ reviewMarkdown, ...session }) {
    const payload = sanitizeForLog({
      tool: CRM_AIKOUNT_TOOL,
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      user: process.env.USER ?? null,
      ...session,
    });
    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2));
    if (reviewMarkdown) {
      fs.writeFileSync(this.reviewPath, reviewMarkdown);
    }
    return {
      logPath: this.filePath,
      reviewPath: this.reviewPath,
    };
  }
}

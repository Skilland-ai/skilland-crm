#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');
const TODAY = '2026-06-08';

function parseArgs(argv) {
  const args = {
    limit: 5,
    outputDir: DEFAULT_OUTPUT_DIR,
    weekly: false,
    apply: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    else if (arg === '--weekly') args.weekly = true;
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 5) {
    throw new Error('--limit must be an integer between 1 and 5.');
  }
  if (args.apply) {
    throw new Error('--apply is intentionally blocked in the daily operator. Run the specific runner mode with --apply after human approval.');
  }

  return args;
}

function printHelp() {
  console.log(`IA Mujeres daily operator

Usage:
  node scripts/ia_mujeres_daily_operator.mjs
  node scripts/ia_mujeres_daily_operator.mjs --limit=5
  node scripts/ia_mujeres_daily_operator.mjs --weekly

This orchestrator is dry-run only. It audits CRM, selects the next review batch,
prepares local draft payloads, checks follow-up candidates and optionally renders
the weekly report. It does not create Gmail drafts, send email or mutate CRM.
`);
}

function runNode(script, args) {
  const commandArgs = [script, ...args];
  const output = execFileSync(process.execPath, commandArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const text = output.trim();
  try {
    return { command: ['node', ...commandArgs].join(' '), json: JSON.parse(text), raw: text };
  } catch {
    return { command: ['node', ...commandArgs].join(' '), json: null, raw: text };
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });

  const steps = [];
  steps.push(runNode('scripts/ia_mujeres_batch_runner.mjs', [
    '--mode=audit',
    `--output-dir=${args.outputDir}`,
  ]));

  const selection = runNode('scripts/ia_mujeres_batch_runner.mjs', [
    '--mode=select-batch',
    `--limit=${args.limit}`,
    `--output-dir=${args.outputDir}`,
  ]);
  steps.push(selection);

  const batchId = selection.json?.batchId ?? selection.json?.batch_id;
  if (batchId) {
    steps.push(runNode('scripts/ia_mujeres_batch_runner.mjs', [
      '--mode=prepare-drafts',
      `--batch-id=${batchId}`,
      `--output-dir=${args.outputDir}`,
    ]));
  }

  steps.push(runNode('scripts/ia_mujeres_batch_runner.mjs', [
    '--mode=prepare-followups',
    `--limit=${args.limit}`,
    `--output-dir=${args.outputDir}`,
  ]));

  if (args.weekly) {
    steps.push(runNode('scripts/ia_mujeres_weekly_report.mjs', [
      `--week=${TODAY}`,
      `--output-dir=${args.outputDir}`,
    ]));
  }

  const report = {
    generatedAt: new Date().toISOString(),
    status: 'ok',
    dryRunOnly: true,
    safeguards: [
      'No --apply accepted by this operator.',
      'No Gmail draft creation.',
      'No email sending.',
      'No CRM mutation; CRM changes require the specific runner mode plus --apply.',
    ],
    steps: steps.map((step) => ({
      command: step.command,
      status: step.json?.status ?? 'ok',
      summary: step.json ?? step.raw,
    })),
    nextActions: [
      'Revisar batch_<id>_draft_review.md antes de crear drafts reales.',
      'Crear Gmail drafts externos solo tras autorización humana explícita y modo dedicado.',
      'Registrar draft en CRM con mark-draft-created --apply solo con mapa de drafts aprobado.',
      'Mantener send-approved bloqueado hasta validar la primera tanda real.',
    ],
  };

  const reportPath = path.join(args.outputDir, `daily_operator_${new Date().toISOString().replaceAll(':', '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    status: 'ok',
    dryRunOnly: true,
    batchId: batchId ?? null,
    output: reportPath,
  }, null, 2));
}

main();

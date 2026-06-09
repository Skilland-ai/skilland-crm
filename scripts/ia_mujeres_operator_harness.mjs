#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');
const DEFAULT_WEEK = '2026-06-08';
const DEFAULT_LAB_THREAD_ID = '19ea476680e7031b';
const DEFAULT_WEEKLY_SUBJECT = 'Lanzamiento de Funnel IA Mujeres';
const DEFAULT_WEEKLY_RECIPIENTS = [
  'direccion@skilland.ai',
  'sales@reboot.academy',
  'romi@reboot.academy',
];

const ACTIONS = new Set([
  'status',
  'prepare-next-batch',
  'create-drafts',
  'send-batch',
  'launch-approved-batch',
  'sync-signals',
  'reconcile-tasks',
  'weekly-report',
  'email-weekly-report',
  'lab-check',
]);

function parseArgs(argv) {
  const args = {
    action: 'status',
    batchId: undefined,
    limit: 5,
    week: DEFAULT_WEEK,
    outputDir: DEFAULT_OUTPUT_DIR,
    apply: false,
    confirmCreateExternalDrafts: false,
    confirmSendApprovedDrafts: false,
    confirmSendWeeklyReport: false,
    weeklySubject: DEFAULT_WEEKLY_SUBJECT,
    weeklyRecipients: [...DEFAULT_WEEKLY_RECIPIENTS],
    labThreadId: DEFAULT_LAB_THREAD_ID,
  };

  for (const arg of argv) {
    if (arg.startsWith('--action=')) args.action = arg.slice('--action='.length);
    else if (arg.startsWith('--batch-id=')) args.batchId = arg.slice('--batch-id='.length);
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--week=')) args.week = arg.slice('--week='.length);
    else if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--confirm-create-external-drafts') args.confirmCreateExternalDrafts = true;
    else if (arg === '--confirm-send-approved-drafts') args.confirmSendApprovedDrafts = true;
    else if (arg === '--confirm-send-weekly-report') args.confirmSendWeeklyReport = true;
    else if (arg.startsWith('--weekly-subject=')) args.weeklySubject = arg.slice('--weekly-subject='.length);
    else if (arg.startsWith('--weekly-to=')) args.weeklyRecipients = arg.slice('--weekly-to='.length).split(',').map((email) => email.trim()).filter(Boolean);
    else if (arg.startsWith('--lab-thread-id=')) args.labThreadId = arg.slice('--lab-thread-id='.length);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!ACTIONS.has(args.action)) throw new Error(`Unsupported --action=${args.action}`);
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 5) {
    throw new Error('--limit must be an integer between 1 and 5.');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.week)) throw new Error(`Invalid --week date: ${args.week}`);
  if (['create-drafts', 'send-batch', 'launch-approved-batch'].includes(args.action) && !args.batchId) {
    throw new Error(`--action=${args.action} requires --batch-id=<id>.`);
  }
  if (args.action === 'launch-approved-batch' && !args.apply) {
    throw new Error('--action=launch-approved-batch requires --apply plus both confirmation flags.');
  }
  if (args.action === 'launch-approved-batch' && (!args.confirmCreateExternalDrafts || !args.confirmSendApprovedDrafts)) {
    throw new Error('--action=launch-approved-batch requires --confirm-create-external-drafts and --confirm-send-approved-drafts.');
  }
  if (args.action === 'create-drafts' && args.apply && !args.confirmCreateExternalDrafts) {
    throw new Error('--action=create-drafts --apply requires --confirm-create-external-drafts.');
  }
  if (args.action === 'send-batch' && args.apply && !args.confirmSendApprovedDrafts) {
    throw new Error('--action=send-batch --apply requires --confirm-send-approved-drafts.');
  }
  if (args.action === 'email-weekly-report' && args.apply && !args.confirmSendWeeklyReport) {
    throw new Error('--action=email-weekly-report --apply requires --confirm-send-weekly-report.');
  }
  if (['status', 'prepare-next-batch', 'weekly-report', 'lab-check'].includes(args.action) && args.apply) {
    throw new Error(`--action=${args.action} is non-mutating; remove --apply.`);
  }

  return args;
}

function printHelp() {
  console.log(`IA Mujeres operator harness

Usage:
  node scripts/ia_mujeres_operator_harness.mjs --action=status
  node scripts/ia_mujeres_operator_harness.mjs --action=prepare-next-batch --limit=5
  node scripts/ia_mujeres_operator_harness.mjs --action=create-drafts --batch-id=<id> --apply --confirm-create-external-drafts
  node scripts/ia_mujeres_operator_harness.mjs --action=send-batch --batch-id=<id> --apply --confirm-send-approved-drafts
  node scripts/ia_mujeres_operator_harness.mjs --action=launch-approved-batch --batch-id=<id> --apply --confirm-create-external-drafts --confirm-send-approved-drafts
  node scripts/ia_mujeres_operator_harness.mjs --action=sync-signals --apply
  node scripts/ia_mujeres_operator_harness.mjs --action=reconcile-tasks --apply
  node scripts/ia_mujeres_operator_harness.mjs --action=weekly-report --week=2026-06-08
  node scripts/ia_mujeres_operator_harness.mjs --action=email-weekly-report --apply --confirm-send-weekly-report
  node scripts/ia_mujeres_operator_harness.mjs --action=lab-check

Safeguards:
  - Status, prepare-next-batch, weekly-report and lab-check never accept --apply.
  - Gmail drafts require --apply plus --confirm-create-external-drafts.
  - Gmail sends require --apply plus --confirm-send-approved-drafts.
  - Weekly report email requires --apply plus --confirm-send-weekly-report.
`);
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:=@,+-]+$/.test(value)) return value;
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function runNode(script, args, steps) {
  const commandArgs = [script, ...args];
  const command = ['node', ...commandArgs].map(shellQuote).join(' ');
  try {
    const stdout = execFileSync(process.execPath, commandArgs, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    const raw = stdout.trim();
    let json = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = null;
    }
    const step = { command, status: 'ok', json, raw: json ? undefined : raw };
    steps.push(step);
    return step;
  } catch (error) {
    const step = {
      command,
      status: 'failed',
      error: error.message,
      stdout: error.stdout?.toString(),
      stderr: error.stderr?.toString(),
    };
    steps.push(step);
    throw error;
  }
}

function batchRunner(mode, extraArgs, args, steps) {
  return runNode('scripts/ia_mujeres_batch_runner.mjs', [
    `--mode=${mode}`,
    `--output-dir=${args.outputDir}`,
    ...extraArgs,
  ], steps);
}

function weeklyReport(args, steps) {
  return runNode('scripts/ia_mujeres_weekly_report.mjs', [
    `--week=${args.week}`,
    `--output-dir=${args.outputDir}`,
  ], steps);
}

function draftMapPath(args) {
  return path.join(args.outputDir, `batch_${args.batchId}_draft_map.json`);
}

function sentMapPath(args) {
  return path.join(args.outputDir, `batch_${args.batchId}_sent_map.json`);
}

function createDrafts(args, steps) {
  const createArgs = [
    `--batch-id=${args.batchId}`,
    `--output-dir=${args.outputDir}`,
  ];
  if (args.apply) {
    createArgs.push('--apply', '--confirm-create-external-drafts');
  }
  const createStep = runNode('scripts/ia_mujeres_create_external_drafts.mjs', createArgs, steps);
  if (args.apply) {
    batchRunner('mark-draft-created', [
      `--batch-id=${args.batchId}`,
      `--draft-map=${draftMapPath(args)}`,
      '--apply',
    ], args, steps);
  }
  return createStep;
}

function sendBatch(args, steps) {
  const sendArgs = [
    `--batch-id=${args.batchId}`,
    `--output-dir=${args.outputDir}`,
  ];
  if (args.apply) {
    sendArgs.push('--apply', '--confirm-send-approved-drafts');
  }
  const sendStep = runNode('scripts/ia_mujeres_send_approved_drafts.mjs', sendArgs, steps);
  if (args.apply) {
    batchRunner('mark-email-sent', [
      `--batch-id=${args.batchId}`,
      `--sent-map=${sentMapPath(args)}`,
      '--apply',
    ], args, steps);
    batchRunner('reconcile-tasks', ['--apply'], args, steps);
  }
  return sendStep;
}

function writeHarnessReport(args, steps, derived = {}) {
  fs.mkdirSync(args.outputDir, { recursive: true });
  const report = {
    generated_at: new Date().toISOString(),
    action: args.action,
    mode: args.apply ? 'apply' : 'dry-run',
    batch_id: args.batchId ?? derived.batchId ?? null,
    safeguards: [
      'Harness delegates to specialized runners; it does not bypass their confirmations.',
      'Batch size remains capped at 5 by underlying runners.',
      'CRM mutations require --apply.',
      'External draft creation and sending require explicit confirmation flags.',
    ],
    steps,
    derived,
  };
  const timestamp = report.generated_at.replaceAll(':', '-');
  const reportPath = path.join(args.outputDir, `operator_harness_${timestamp}_${args.action}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });
  const steps = [];
  const derived = {};

  if (args.action === 'status') {
    batchRunner('audit', [], args, steps);
    batchRunner('reconcile-tasks', [], args, steps);
  } else if (args.action === 'prepare-next-batch') {
    batchRunner('audit', [], args, steps);
    const selection = batchRunner('select-batch', [`--limit=${args.limit}`], args, steps);
    derived.batchId = selection.json?.batch_id ?? selection.json?.batchId ?? null;
    if (!derived.batchId) throw new Error('select-batch did not return a batch_id.');
    batchRunner('prepare-drafts', [`--batch-id=${derived.batchId}`], args, steps);
  } else if (args.action === 'create-drafts') {
    createDrafts(args, steps);
  } else if (args.action === 'send-batch') {
    sendBatch(args, steps);
  } else if (args.action === 'launch-approved-batch') {
    createDrafts(args, steps);
    sendBatch(args, steps);
  } else if (args.action === 'sync-signals') {
    const maybeApply = args.apply ? ['--apply'] : [];
    runNode('scripts/ia_mujeres_scan_gmail_bounces.mjs', [
      `--output-dir=${args.outputDir}`,
      ...(args.apply ? ['--apply'] : []),
    ], steps);
    batchRunner('sync-replies', maybeApply, args, steps);
    batchRunner('sync-bounces', maybeApply, args, steps);
    batchRunner('reconcile-tasks', maybeApply, args, steps);
  } else if (args.action === 'reconcile-tasks') {
    batchRunner('reconcile-tasks', args.apply ? ['--apply'] : [], args, steps);
  } else if (args.action === 'weekly-report') {
    weeklyReport(args, steps);
  } else if (args.action === 'email-weekly-report') {
    weeklyReport(args, steps);
    const emailArgs = [
      `--week=${args.week}`,
      `--output-dir=${args.outputDir}`,
      `--subject=${args.weeklySubject}`,
      `--to=${args.weeklyRecipients.join(',')}`,
    ];
    if (args.apply) emailArgs.push('--apply', '--confirm-send-weekly-report');
    runNode('scripts/ia_mujeres_send_weekly_report_email.mjs', emailArgs, steps);
  } else if (args.action === 'lab-check') {
    runNode('scripts/ia_mujeres_experiment_00_gws_lab.mjs', [
      '--check-reception',
      '--check-replies',
      '--check-bounce',
      `--thread-id=${args.labThreadId}`,
      `--output-dir=${args.outputDir}`,
    ], steps);
  } else {
    throw new Error(`Unhandled action: ${args.action}`);
  }

  const reportPath = writeHarnessReport(args, steps, derived);
  console.log(JSON.stringify({
    status: 'ok',
    action: args.action,
    mode: args.apply ? 'apply' : 'dry-run',
    batch_id: args.batchId ?? derived.batchId ?? null,
    steps: steps.length,
    reportPath,
  }, null, 2));
}

main();

#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CAMPAIGN_NAME = 'IA Mujeres 2026';
const BUSINESS_LINE = 'SkilLand IA Mujeres';
const SENDER_EMAIL = 'gerencia@skilland.ai';
const GERENCIA_CONFIG_DIR = process.env.GWS_GERENCIA_CONFIG_DIR || '/home/reboot/.config/gws_gerencia';
const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');

function parseArgs(argv) {
  const args = {
    batchId: undefined,
    outputDir: DEFAULT_OUTPUT_DIR,
    apply: false,
    confirmSendApprovedDrafts: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--batch-id=')) args.batchId = arg.slice('--batch-id='.length);
    else if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--confirm-send-approved-drafts') args.confirmSendApprovedDrafts = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.batchId) throw new Error('--batch-id=<id> is required.');
  if (args.apply && !args.confirmSendApprovedDrafts) {
    throw new Error('Refusing to send without --confirm-send-approved-drafts.');
  }
  return args;
}

function printHelp() {
  console.log(`IA Mujeres approved draft sender

Usage:
  node scripts/ia_mujeres_send_approved_drafts.mjs --batch-id=<id>
  node scripts/ia_mujeres_send_approved_drafts.mjs --batch-id=<id> --apply --confirm-send-approved-drafts

Dry-run by default. With --apply, sends the Gmail drafts in batch_<id>_draft_map.json.
`);
}

function runGws(configDir, gwsArgs) {
  const stdout = execFileSync('gws', gwsArgs, {
    env: { ...process.env, GOOGLE_WORKSPACE_CLI_CONFIG_DIR: configDir },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  const trimmed = stdout.trim();
  return trimmed ? JSON.parse(trimmed) : {};
}

const accessTokenCache = new Map();

async function getAccessToken(configDir) {
  if (accessTokenCache.has(configDir)) return accessTokenCache.get(configDir);
  const exported = runGws(configDir, ['auth', 'export', '--unmasked']);
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: exported.client_id,
    client_secret: exported.client_secret,
    refresh_token: exported.refresh_token,
  });
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await response.json();
  if (!response.ok || !json.access_token) {
    throw new Error(`OAuth refresh failed: ${JSON.stringify(json).slice(0, 500)}`);
  }
  accessTokenCache.set(configDir, json.access_token);
  return json.access_token;
}

async function gmailApi(configDir, method, endpoint, body) {
  const token = await getAccessToken(configDir);
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${endpoint}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) {
    throw new Error(`Gmail API ${method} ${endpoint} failed: ${JSON.stringify(json).slice(0, 700)}`);
  }
  return json;
}

function requireAuth() {
  const status = runGws(GERENCIA_CONFIG_DIR, ['auth', 'status']);
  if (!status.token_valid) {
    throw new Error(
      `GWS token is not valid for ${SENDER_EMAIL}: ${status.token_error || 'unknown token error'}`,
    );
  }
  if (status.user !== SENDER_EMAIL) {
    throw new Error(`Wrong GWS account. Expected ${SENDER_EMAIL}, got ${status.user || '(unknown)'}`);
  }
  return status;
}

function readDraftMap(outputDir, batchId) {
  const draftMapPath = path.join(outputDir, `batch_${batchId}_draft_map.json`);
  if (!fs.existsSync(draftMapPath)) throw new Error(`Draft map not found: ${draftMapPath}`);
  const parsed = JSON.parse(fs.readFileSync(draftMapPath, 'utf8'));
  const drafts = parsed.drafts ?? [];
  if (!Array.isArray(drafts) || drafts.length === 0) throw new Error('No drafts found in draft map.');
  if (drafts.length > 5) throw new Error(`Refusing to send more than 5 drafts. Got ${drafts.length}.`);
  return { draftMapPath, drafts };
}

async function getDraft(draftId) {
  return gmailApi(GERENCIA_CONFIG_DIR, 'GET', `/drafts/${encodeURIComponent(draftId)}?format=metadata`);
}

async function sendDraft(draftId) {
  return gmailApi(GERENCIA_CONFIG_DIR, 'POST', '/drafts/send', { id: draftId });
}

function appendEvent(outputDir, event) {
  fs.appendFileSync(path.join(outputDir, 'events.ndjson'), `${JSON.stringify(event)}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });
  const auth = requireAuth();
  const { draftMapPath, drafts } = readDraftMap(args.outputDir, args.batchId);

  const report = {
    generated_at: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'dry-run',
    batch_id: args.batchId,
    draft_map_path: draftMapPath,
    sender: SENDER_EMAIL,
    auth: { user: auth.user, token_valid: auth.token_valid, storage: auth.storage },
    safeguards: [
      'Sends only drafts listed in batch_<id>_draft_map.json.',
      'Max 5 drafts.',
      'Requires --apply and --confirm-send-approved-drafts.',
    ],
    sent: [],
  };

  for (const draft of drafts) {
    await getDraft(draft.gmailDraftId);
    if (!args.apply) {
      report.sent.push({
        ...draft,
        status: 'planned_send',
      });
      continue;
    }
    const sent = await sendDraft(draft.gmailDraftId);
    const sentEntry = {
      ...draft,
      status: 'sent',
      sentAt: new Date().toISOString(),
      gmailMessageId: sent.id,
      gmailThreadId: sent.threadId,
    };
    report.sent.push(sentEntry);
    appendEvent(args.outputDir, {
      schema_version: '1.0',
      campaign_name: CAMPAIGN_NAME,
      business_line: BUSINESS_LINE,
      event_type: 'email_sent',
      event_id: crypto.randomUUID(),
      occurred_at: sentEntry.sentAt,
      sender_email: SENDER_EMAIL,
      recipient_email: draft.recipient_email,
      subject: draft.subject,
      crm_deal_id: draft.crm_deal_id,
      crm_person_id: draft.person_id,
      crm_company_id: draft.company_id,
      draft_id: draft.gmailDraftId,
      message_id: sentEntry.gmailMessageId,
      thread_id: sentEntry.gmailThreadId,
      metadata: {
        batch_id: args.batchId,
        template_name: draft.template_name,
        template_version: draft.template_version,
        attachment_policy: draft.attachment_policy,
        attachment_mime_name: draft.attachment_mime_name,
        test_mode: false,
      },
    });
  }

  const reportPath = path.join(args.outputDir, `batch_${args.batchId}_send_report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  let sentMapPath = null;
  if (args.apply) {
    sentMapPath = path.join(args.outputDir, `batch_${args.batchId}_sent_map.json`);
    fs.writeFileSync(sentMapPath, JSON.stringify({
      batch_id: args.batchId,
      sent_at: report.generated_at,
      sent: report.sent.map((entry) => ({
        crm_deal_id: entry.crm_deal_id,
        company_id: entry.company_id,
        person_id: entry.person_id,
        recipient_email: entry.recipient_email,
        sender_email: SENDER_EMAIL,
        subject: entry.subject,
        template_name: entry.template_name,
        template_version: entry.template_version,
        attachment_policy: entry.attachment_policy,
        attachment_mime_name: entry.attachment_mime_name,
        gmailMessageId: entry.gmailMessageId,
        gmailThreadId: entry.gmailThreadId,
        sentAt: entry.sentAt,
      })),
    }, null, 2));
  }

  console.log(JSON.stringify({
    status: 'ok',
    mode: report.mode,
    batch_id: args.batchId,
    drafts: drafts.length,
    reportPath,
    sentMapPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

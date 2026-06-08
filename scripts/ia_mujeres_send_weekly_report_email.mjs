#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const SENDER_EMAIL = 'gerencia@skilland.ai';
const GERENCIA_CONFIG_DIR = '/home/reboot/.config/gws_gerencia';
const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');
const DEFAULT_WEEK = '2026-06-08';
const DEFAULT_SUBJECT = 'Lanzamiento de Funnel IA Mujeres';
const DEFAULT_RECIPIENTS = [
  'direccion@skilland.ai',
  'sales@reboot.academy',
  'romi@reboot.academy',
];

function parseArgs(argv) {
  const args = {
    week: DEFAULT_WEEK,
    outputDir: DEFAULT_OUTPUT_DIR,
    subject: DEFAULT_SUBJECT,
    recipients: [...DEFAULT_RECIPIENTS],
    apply: false,
    confirmSendWeeklyReport: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--week=')) args.week = arg.slice('--week='.length);
    else if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    else if (arg.startsWith('--subject=')) args.subject = arg.slice('--subject='.length);
    else if (arg.startsWith('--to=')) args.recipients = arg.slice('--to='.length).split(',').map((email) => email.trim()).filter(Boolean);
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--confirm-send-weekly-report') args.confirmSendWeeklyReport = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.week)) throw new Error(`Invalid --week date: ${args.week}`);
  if (args.recipients.length === 0) throw new Error('At least one recipient is required.');
  for (const email of args.recipients) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Invalid recipient email: ${email}`);
  }
  if (args.apply && !args.confirmSendWeeklyReport) {
    throw new Error('Refusing to send without --confirm-send-weekly-report.');
  }

  return args;
}

function printHelp() {
  console.log(`IA Mujeres weekly report email sender

Usage:
  node scripts/ia_mujeres_send_weekly_report_email.mjs
  node scripts/ia_mujeres_send_weekly_report_email.mjs --apply --confirm-send-weekly-report
  node scripts/ia_mujeres_send_weekly_report_email.mjs --week=2026-06-08 --subject="Lanzamiento de Funnel IA Mujeres" --to=a@example.com,b@example.com

Dry-run by default. With --apply, sends the generated weekly_report_<week>.html inline by Gmail.
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
  if (status.user !== SENDER_EMAIL) {
    throw new Error(`Wrong GWS account. Expected ${SENDER_EMAIL}, got ${status.user || '(unknown)'}`);
  }
  if (!status.token_valid) throw new Error(`GWS token is not valid for ${SENDER_EMAIL}`);
  return status;
}

function encodeMimeHeader(value) {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/td>/gi, ' | ')
    .replace(/<\/th>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function loadReport({ outputDir, week, subject }) {
  const htmlPath = path.join(outputDir, `weekly_report_${week}.html`);
  const mdPath = path.join(outputDir, `weekly_report_${week}.md`);
  if (!fs.existsSync(htmlPath)) throw new Error(`Weekly report HTML not found: ${htmlPath}`);
  if (!fs.existsSync(mdPath)) throw new Error(`Weekly report Markdown not found: ${mdPath}`);

  const originalHtml = fs.readFileSync(htmlPath, 'utf8');
  const markdown = fs.readFileSync(mdPath, 'utf8');
  const html = originalHtml
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${subject}</title>`)
    .replace(/<h1>[\s\S]*?<\/h1>/, `<h1>${subject}</h1>`);
  const text = markdown.replace(/^# .+$/m, `# ${subject}`);

  return { htmlPath, mdPath, html, text: text.trim() || htmlToText(html) };
}

function buildMime({ subject, recipients, html, text }) {
  const boundary = `skilland_report_${crypto.randomUUID()}`;
  const headers = [
    `From: ${SENDER_EMAIL}`,
    `To: ${recipients.join(', ')}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    'MIME-Version: 1.0',
    'X-Skilland-Campaign: IA Mujeres 2026',
    'X-Skilland-Report: weekly',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  return [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

async function sendMessage(raw) {
  return gmailApi(GERENCIA_CONFIG_DIR, 'POST', '/messages/send', { raw });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });
  const auth = requireAuth();
  const reportContent = loadReport(args);
  const mime = buildMime({
    subject: args.subject,
    recipients: args.recipients,
    html: reportContent.html,
    text: reportContent.text,
  });

  const output = {
    generated_at: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'dry-run',
    sender: SENDER_EMAIL,
    recipients: args.recipients,
    subject: args.subject,
    week: args.week,
    source_html: reportContent.htmlPath,
    source_markdown: reportContent.mdPath,
    auth: { user: auth.user, token_valid: auth.token_valid, storage: auth.storage },
    safeguards: [
      'Dry-run by default.',
      'Requires --apply and --confirm-send-weekly-report to send.',
      'Sends only the generated weekly report inline; no campaign contact selection and no CRM mutation.',
    ],
    sent: null,
  };

  if (args.apply) {
    const sent = await sendMessage(base64Url(mime));
    output.sent = {
      status: 'sent',
      message_id: sent.id,
      thread_id: sent.threadId,
      label_ids: sent.labelIds ?? [],
      sent_at: new Date().toISOString(),
    };
  }

  const reportPath = path.join(args.outputDir, `${args.week}_weekly_report_email_send.json`);
  fs.writeFileSync(reportPath, JSON.stringify(output, null, 2));

  console.log(JSON.stringify({
    status: 'ok',
    mode: output.mode,
    sender: output.sender,
    recipients: output.recipients,
    subject: output.subject,
    reportPath,
    sent: output.sent,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

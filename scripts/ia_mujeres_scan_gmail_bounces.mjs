#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CAMPAIGN_NAME = 'IA Mujeres 2026';
const BUSINESS_LINE = 'SkilLand IA Mujeres';
const SENDER_EMAIL = 'gerencia@skilland.ai';
const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');
const GERENCIA_CONFIG_DIR = process.env.GWS_GERENCIA_CONFIG_DIR || '/home/reboot/.config/gws_gerencia';

function parseArgs(argv) {
  const args = {
    outputDir: DEFAULT_OUTPUT_DIR,
    eventsPath: null,
    apply: false,
    newerThan: '7d',
  };

  for (const arg of argv) {
    if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    else if (arg.startsWith('--events=')) args.eventsPath = path.resolve(arg.slice('--events='.length));
    else if (arg.startsWith('--newer-than=')) args.newerThan = arg.slice('--newer-than='.length);
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  args.eventsPath ??= path.join(args.outputDir, 'events.ndjson');
  return args;
}

function printHelp() {
  console.log(`IA Mujeres Gmail bounce scanner

Usage:
  GWS_GERENCIA_CONFIG_DIR=/home/reboot/.config/gws node scripts/ia_mujeres_scan_gmail_bounces.mjs
  GWS_GERENCIA_CONFIG_DIR=/home/reboot/.config/gws node scripts/ia_mujeres_scan_gmail_bounces.mjs --apply

Dry-run by default. With --apply, appends missing bounce_detected events to events.ndjson.
It does not mutate CRM; run sync-bounces afterwards.
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

async function requireAuth(configDir) {
  const profile = await gmailApi(configDir, 'GET', '/profile');
  if (profile.emailAddress !== SENDER_EMAIL) {
    throw new Error(`Wrong Gmail profile. Expected ${SENDER_EMAIL}, got ${profile.emailAddress || '(unknown)'}`);
  }
  return profile;
}

function readEvents(eventsPath) {
  if (!fs.existsSync(eventsPath)) return [];
  return fs.readFileSync(eventsPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON in ${eventsPath}:${index + 1}: ${error.message}`);
      }
    });
}

function appendEvent(eventsPath, event) {
  fs.appendFileSync(eventsPath, `${JSON.stringify(event)}\n`);
}

function headers(message) {
  return Object.fromEntries((message.payload?.headers ?? []).map((entry) => [entry.name.toLowerCase(), entry.value]));
}

function flattenParts(part, acc = []) {
  if (!part) return acc;
  acc.push(part);
  for (const child of part.parts ?? []) flattenParts(child, acc);
  return acc;
}

function decodeBase64Url(data = '') {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function messageText(message) {
  return flattenParts(message.payload)
    .filter((part) => ['text/plain', 'message/delivery-status', 'message/rfc822'].includes(part.mimeType) && part.body?.data)
    .map((part) => decodeBase64Url(part.body.data))
    .join('\n');
}

function sentEvents(events) {
  return events.filter((event) =>
    event.campaign_name === CAMPAIGN_NAME &&
    event.business_line === BUSINESS_LINE &&
    event.event_type === 'email_sent' &&
    event.crm_deal_id &&
    event.thread_id &&
    event.recipient_email,
  );
}

function existingBounceKeys(events) {
  return new Set(events
    .filter((event) => event.event_type === 'bounce_detected')
    .flatMap((event) => [
      event.message_id ? `message:${event.message_id}` : null,
      event.thread_id && event.recipient_email ? `thread_recipient:${event.thread_id}:${event.recipient_email.toLowerCase()}` : null,
    ])
    .filter(Boolean));
}

function classifyBounce(text, snippet) {
  const haystack = `${text}\n${snippet}`.toLowerCase();
  if (haystack.includes('mailbox full') || haystack.includes('quotaexceeded')) {
    return { status: '5.2.2', reason: 'mailbox_full', diagnostic: 'Mailbox full / quota exceeded' };
  }
  if (haystack.includes('recipient address rejected')) {
    return { status: '5.4.1', reason: 'recipient_address_rejected', diagnostic: 'Recipient address rejected' };
  }
  if (haystack.includes('not found') || haystack.includes('no se ha encontrado')) {
    return { status: 'unknown', reason: 'address_not_found', diagnostic: 'Address not found' };
  }
  return { status: 'unknown', reason: 'delivery_failed', diagnostic: 'Delivery failed' };
}

function findMatchingSentEvent(message, text, sentByThread, sentByRecipient) {
  const byThread = sentByThread.get(message.threadId);
  if (byThread) return byThread;
  const lower = text.toLowerCase();
  return [...sentByRecipient.entries()].find(([recipient]) => lower.includes(recipient))?.[1] ?? null;
}

async function listBounceMessages(args) {
  const query = [
    `newer_than:${args.newerThan}`,
    '(from:mailer-daemon OR from:postmaster OR from:"Mail Delivery Subsystem" OR subject:Undeliverable OR subject:"Delivery Status Notification" OR subject:"Mail delivery failed")',
  ].join(' ');
  const list = await gmailApi(GERENCIA_CONFIG_DIR, 'GET', `/messages?q=${encodeURIComponent(query)}&maxResults=100`);
  const messages = [];
  for (const item of list.messages ?? []) {
    messages.push(await gmailApi(GERENCIA_CONFIG_DIR, 'GET', `/messages/${item.id}?format=full`));
  }
  return { query, messages };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });
  const profile = await requireAuth(GERENCIA_CONFIG_DIR);
  const events = readEvents(args.eventsPath);
  const sent = sentEvents(events);
  const sentByThread = new Map(sent.map((event) => [event.thread_id, event]));
  const sentByRecipient = new Map(sent.map((event) => [event.recipient_email.toLowerCase(), event]));
  const existing = existingBounceKeys(events);
  const { query, messages } = await listBounceMessages(args);

  const detected = [];
  for (const message of messages) {
    const h = headers(message);
    const text = messageText(message);
    const sentEvent = findMatchingSentEvent(message, text, sentByThread, sentByRecipient);
    if (!sentEvent) continue;
    const messageKey = `message:${message.id}`;
    const threadRecipientKey = `thread_recipient:${sentEvent.thread_id}:${sentEvent.recipient_email.toLowerCase()}`;
    if (existing.has(messageKey) || existing.has(threadRecipientKey)) continue;

    const classification = classifyBounce(text, message.snippet ?? '');
    const event = {
      schema_version: '1.0',
      campaign_name: CAMPAIGN_NAME,
      business_line: BUSINESS_LINE,
      event_type: 'bounce_detected',
      event_id: crypto.randomUUID(),
      occurred_at: new Date(h.date ?? Date.now()).toISOString(),
      sender_email: SENDER_EMAIL,
      recipient_email: sentEvent.recipient_email,
      subject: h.subject ?? 'Delivery failure',
      crm_deal_id: sentEvent.crm_deal_id,
      crm_person_id: sentEvent.crm_person_id,
      crm_company_id: sentEvent.crm_company_id,
      message_id: message.id,
      thread_id: sentEvent.thread_id,
      metadata: {
        batch_id: sentEvent.metadata?.batch_id,
        source: 'gmail_dsn_scan',
        dsn_from: h.from,
        original_message_id: sentEvent.message_id,
        bounce_status: classification.status,
        bounce_reason: classification.reason,
        diagnostic: classification.diagnostic,
      },
    };
    detected.push(event);
    if (args.apply) appendEvent(args.eventsPath, event);
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'dry-run',
    gmail_profile: profile.emailAddress,
    query,
    sent_events_seen: sent.length,
    gmail_bounce_candidates_seen: messages.length,
    new_bounces_detected: detected.length,
    detected,
  };
  const reportPath = path.join(args.outputDir, `gmail_bounce_scan_${new Date().toISOString().replaceAll(':', '-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: 'ok', reportPath, new_bounces_detected: detected.length }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

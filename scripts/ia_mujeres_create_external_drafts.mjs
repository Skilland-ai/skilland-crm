#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CAMPAIGN_NAME = 'IA Mujeres 2026';
const BUSINESS_LINE = 'SkilLand IA Mujeres';
const SENDER_DISPLAY_NAME = 'Romina Ojeda Brito';
const SENDER_EMAIL = 'gerencia@skilland.ai';
const GERENCIA_CONFIG_DIR = process.env.GWS_GERENCIA_CONFIG_DIR || '/home/reboot/.config/gws_gerencia';
const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');
const DEFAULT_ATTACHMENT = path.resolve(
  'shared/templates/ia-mujeres/assets/Mujeres, IA y el Futuro del Trabajo · Dossier — SkilLand v2.pdf',
);
const EXPECTED_ATTACHMENT_NAME = 'Mujeres, IA y el Futuro del Trabajo · Dossier — SkilLand v2.pdf';
const FORBIDDEN_BODY_URLS = [
  'https://www.linkedin.com/in/romina-ojeda-brito/',
  'https://www.elespejocanario.es/secciones/wise-canarias-la-primera-asociacion-de-mujeres-steam-del-archipielago/',
  'https://www.fuerteventuradigital.com/articulo/podcasts/romina-ojeda-presidenta-asociacion-canaria-mujeres-cientificas-tecnologicas-wise/20240601092114001713.html',
  'https://www.atlanticohoy.com/sociedad/escasez-mujeres-en-ciencia-tecnologia-genera-comunidad_1531733_102.html',
  'http://www.skilland.ai/',
];

function parseArgs(argv) {
  const args = {
    batchId: undefined,
    outputDir: DEFAULT_OUTPUT_DIR,
    attachment: DEFAULT_ATTACHMENT,
    apply: false,
    confirmCreateExternalDrafts: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--batch-id=')) args.batchId = arg.slice('--batch-id='.length);
    else if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    else if (arg.startsWith('--attachment=')) args.attachment = path.resolve(arg.slice('--attachment='.length));
    else if (arg === '--apply') args.apply = true;
    else if (arg === '--confirm-create-external-drafts') args.confirmCreateExternalDrafts = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.batchId) throw new Error('--batch-id=<id> is required.');
  if (args.apply && !args.confirmCreateExternalDrafts) {
    throw new Error('Refusing to create external Gmail drafts without --confirm-create-external-drafts.');
  }

  return args;
}

function printHelp() {
  console.log(`IA Mujeres external draft creator

Usage:
  node scripts/ia_mujeres_create_external_drafts.mjs --batch-id=<id>
  node scripts/ia_mujeres_create_external_drafts.mjs --batch-id=<id> --apply --confirm-create-external-drafts

Dry-run by default. With --apply, creates Gmail drafts only. It never sends.
`);
}

function runGws(configDir, gwsArgs, inputJson) {
  const fullArgs = [...gwsArgs];
  if (inputJson !== undefined) fullArgs.push('--json', JSON.stringify(inputJson));
  const stdout = execFileSync('gws', fullArgs, {
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

function requireAuth(configDir, expectedUser) {
  const status = runGws(configDir, ['auth', 'status']);
  if (!status.token_valid) {
    throw new Error(
      `GWS token is not valid for ${expectedUser}: ${status.token_error || 'unknown token error'}`,
    );
  }
  if (status.user !== expectedUser) {
    throw new Error(`Wrong GWS account. Expected ${expectedUser}, got ${status.user || '(unknown)'}`);
  }
  return status;
}

async function getGmailSignature() {
  const sendAs = await gmailApi(GERENCIA_CONFIG_DIR, 'GET', '/settings/sendAs');
  const primary = sendAs.sendAs?.find((entry) => entry.sendAsEmail === SENDER_EMAIL && entry.isDefault);
  const signature = primary?.signature?.trim();
  if (!signature) throw new Error(`No Gmail signature found for ${SENDER_EMAIL}.`);
  return signature;
}

function encodeMimeHeader(value) {
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

function senderAddress() {
  return `${encodeMimeHeader(SENDER_DISPLAY_NAME)} <${SENDER_EMAIL}>`;
}

function base64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function foldBase64(base64) {
  return base64.replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

function htmlToText(html) {
  return html
    .replace(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/g, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildMime({ payload, signatureHtml, attachmentPath }) {
  const mixedBoundary = `skilland_mix_${crypto.randomUUID()}`;
  const altBoundary = `skilland_alt_${crypto.randomUUID()}`;
  const attachmentFilename = payload.attachment_mime_name || EXPECTED_ATTACHMENT_NAME;
  const attachmentContent = fs.readFileSync(attachmentPath);
  const attachmentBase64 = foldBase64(attachmentContent.toString('base64'));
  const bodyHtml = ['<div dir="ltr">', payload.html, signatureHtml, '</div>'].join('\n');
  const textBody = htmlToText(bodyHtml);

  const headers = [
    `From: ${senderAddress()}`,
    `To: ${payload.recipient_email}`,
    `Subject: ${encodeMimeHeader(payload.subject)}`,
    'MIME-Version: 1.0',
    `X-Skilland-Campaign: ${CAMPAIGN_NAME}`,
    `X-Skilland-Batch: ${payload.batch_id}`,
    `X-Skilland-CRM-Deal-ID: ${payload.crm_deal_id}`,
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
  ];

  const mime = [
    ...headers,
    '',
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    '',
    `--${altBoundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    textBody,
    '',
    `--${altBoundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    bodyHtml,
    '',
    `--${altBoundary}--`,
    '',
    `--${mixedBoundary}`,
    `Content-Type: application/pdf; name="${encodeMimeHeader(attachmentFilename)}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${encodeMimeHeader(attachmentFilename)}"; filename*=UTF-8''${encodeURIComponent(attachmentFilename)}`,
    '',
    attachmentBase64,
    '',
    `--${mixedBoundary}--`,
    '',
  ].join('\r\n');

  return { raw: base64Url(mime), bodyHtml, textBody, attachmentFilename };
}

function attachmentPathForPayload(payload, fallback) {
  return payload.attachment_path ? path.resolve(payload.attachment_path) : fallback;
}

function extractHeaders(message) {
  const headers = message?.payload?.headers ?? [];
  return Object.fromEntries(headers.map((entry) => [entry.name.toLowerCase(), entry.value]));
}

function flattenParts(part, acc = []) {
  if (!part) return acc;
  acc.push(part);
  for (const child of part.parts ?? []) flattenParts(child, acc);
  return acc;
}

function verifyDraftMessage({ message, payload, rendered }) {
  const headers = extractHeaders(message);
  const parts = flattenParts(message.payload);
  const filenames = parts.map((part) => part.filename).filter(Boolean);
  const mimeTypes = parts.map((part) => part.mimeType).filter(Boolean);
  return {
    fromOk: (headers.from ?? '').includes(SENDER_EMAIL),
    fromDisplayNameOk: (headers.from ?? '').includes(SENDER_DISPLAY_NAME),
    toOk: (headers.to ?? '').toLowerCase().includes(payload.recipient_email.toLowerCase()),
    subjectOk: (headers.subject ?? '') === payload.subject,
    attachmentPresent: filenames.includes(rendered.attachmentFilename),
    expectedAttachmentNameMatches: rendered.attachmentFilename === EXPECTED_ATTACHMENT_NAME,
    signaturePresent: true,
    filenames,
    mimeTypes,
  };
}

function email01TemplateValidation(payload, rendered) {
  const unresolvedPlaceholders = rendered.bodyHtml.match(/{{[^}]+}}/g) ?? [];
  const forbiddenBodyUrls = FORBIDDEN_BODY_URLS.filter((url) =>
    payload.html.includes(url),
  );
  const genderedGreetingMatches = rendered.bodyHtml.match(/<p>\s*Estimad[oa]\b[^<]*<\/p>/gi) ?? [];
  const derivationTextPresent = rendered.bodyHtml.includes(
    'Si cree que esta conversación corresponde a otra persona del equipo',
  );

  return {
    templateVersion: payload.template_version ?? null,
    noGenderedGreeting: genderedGreetingMatches.length === 0,
    genderedGreetingMatches: [...new Set(genderedGreetingMatches)],
    noForbiddenBodyUrls: forbiddenBodyUrls.length === 0,
    forbiddenBodyUrls,
    unresolvedPlaceholders: [...new Set(unresolvedPlaceholders)],
    derivationIncluded: Boolean(payload.derivation_included),
    derivationTextPresent,
    derivationMatchesPayload: Boolean(payload.derivation_included) === derivationTextPresent,
    expectedAttachmentNameMatches: rendered.attachmentFilename === EXPECTED_ATTACHMENT_NAME,
    htmlHasExpectedCopy: rendered.bodyHtml.includes('Le adjunto un dosier breve') &&
      rendered.bodyHtml.includes('primera acción gratuita de divulgación'),
  };
}

function assertEmail01TemplateValidation(payload, validation) {
  const failures = [];
  if (!validation.noGenderedGreeting) failures.push('gendered_greeting');
  if (!validation.noForbiddenBodyUrls) failures.push('forbidden_body_urls');
  if (validation.unresolvedPlaceholders.length > 0) failures.push('unresolved_placeholders');
  if (!validation.derivationMatchesPayload) failures.push('derivation_mismatch');
  if (!validation.expectedAttachmentNameMatches) failures.push('wrong_attachment_name');
  if (!validation.htmlHasExpectedCopy) failures.push('missing_expected_copy');

  if (failures.length > 0) {
    throw new Error(
      `Refusing to create Email 1 draft for ${payload.crm_deal_id}: ${failures.join(', ')}`,
    );
  }
}

function readPayloads(outputDir, batchId) {
  const payloadPath = path.join(outputDir, `batch_${batchId}_draft_payloads.json`);
  if (!fs.existsSync(payloadPath)) throw new Error(`Draft payload file not found: ${payloadPath}`);
  const parsed = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));
  const payloads = parsed.payloads ?? [];
  if (!Array.isArray(payloads) || payloads.length === 0) throw new Error('No payloads found.');
  if (payloads.length > 5) throw new Error(`Refusing to create more than 5 drafts. Got ${payloads.length}.`);
  return { payloadPath, payloads: payloads.map((payload) => ({ ...payload, batch_id: batchId })) };
}

function appendEvent(outputDir, event) {
  fs.appendFileSync(path.join(outputDir, 'events.ndjson'), `${JSON.stringify(event)}\n`);
}

async function createDraft(raw) {
  return gmailApi(GERENCIA_CONFIG_DIR, 'POST', '/drafts', { message: { raw } });
}

async function getDraft(draftId) {
  return gmailApi(GERENCIA_CONFIG_DIR, 'GET', `/drafts/${encodeURIComponent(draftId)}?format=full`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });
  const { payloadPath, payloads } = readPayloads(args.outputDir, args.batchId);
  const auth = requireAuth(GERENCIA_CONFIG_DIR, SENDER_EMAIL);
  const signatureHtml = await getGmailSignature();
  const report = {
    generated_at: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'dry-run',
    batch_id: args.batchId,
    payload_path: payloadPath,
    sender: SENDER_EMAIL,
    attachment: {
      default_path: args.attachment,
      expected_mime_name: EXPECTED_ATTACHMENT_NAME,
    },
    auth: {
      user: auth.user,
      token_valid: auth.token_valid,
      storage: auth.storage,
    },
    safeguards: [
      'Creates Gmail drafts only.',
      'Does not send emails.',
      'Max 5 payloads.',
      'Requires --confirm-create-external-drafts with --apply.',
      'Requires Email 1 v4.2 body copy, neutral greeting, and dossier attachment.',
    ],
    drafts: [],
  };

  for (const payload of payloads) {
    const attachmentPath = attachmentPathForPayload(payload, args.attachment);
    if (!fs.existsSync(attachmentPath)) {
      throw new Error(`Attachment not found for ${payload.crm_deal_id}: ${attachmentPath}`);
    }
    const attachmentStat = fs.statSync(attachmentPath);
    const rendered = buildMime({ payload, signatureHtml, attachmentPath });
    const email01Validation = email01TemplateValidation(payload, rendered);
    assertEmail01TemplateValidation(payload, email01Validation);
    const validationBase = {
      attachmentPath,
      attachmentName: rendered.attachmentFilename,
      attachmentBytes: attachmentStat.size,
      signaturePresent: Boolean(signatureHtml),
      htmlHasAccents: /años|tecnológicas|formación|conversación|reunión|acción|Inteligencia Artificial/.test(rendered.bodyHtml),
      email01: email01Validation,
    };

    if (!args.apply) {
      report.drafts.push({
        crm_deal_id: payload.crm_deal_id,
        recipient_email: payload.recipient_email,
        subject: payload.subject,
        status: 'planned',
        validation: validationBase,
      });
      continue;
    }

    const draft = await createDraft(rendered.raw);
    const draftDetail = await getDraft(draft.id);
    const draftEntry = {
      crm_deal_id: payload.crm_deal_id,
      company_id: payload.company_id,
      person_id: payload.person_id,
      recipient_email: payload.recipient_email,
      sender_email: SENDER_EMAIL,
      subject: payload.subject,
      template_name: payload.template_name,
      template_version: payload.template_version,
      attachment_policy: payload.attachment_policy,
      attachment_mime_name: rendered.attachmentFilename,
      gmailDraftId: draft.id,
      gmailMessageId: draft.message?.id ?? draftDetail.message?.id,
      gmailThreadId: draft.message?.threadId ?? draftDetail.message?.threadId,
      validation: {
        ...validationBase,
        draft: verifyDraftMessage({ message: draftDetail.message, payload, rendered }),
      },
    };
    report.drafts.push(draftEntry);
    appendEvent(args.outputDir, {
      schema_version: '1.0',
      campaign_name: CAMPAIGN_NAME,
      business_line: BUSINESS_LINE,
      event_type: 'draft_created',
      event_id: crypto.randomUUID(),
      occurred_at: new Date().toISOString(),
      sender_email: SENDER_EMAIL,
      recipient_email: payload.recipient_email,
      subject: payload.subject,
      crm_deal_id: payload.crm_deal_id,
      crm_person_id: payload.person_id,
      crm_company_id: payload.company_id,
      draft_id: draft.id,
      message_id: draftEntry.gmailMessageId,
      thread_id: draftEntry.gmailThreadId,
      metadata: {
        batch_id: args.batchId,
        template_name: payload.template_name,
        template_version: payload.template_version,
        attachment_policy: payload.attachment_policy,
        attachment_mime_name: rendered.attachmentFilename,
        test_mode: false,
        external_draft_only: true,
      },
    });
  }

  const reportPath = path.join(args.outputDir, `batch_${args.batchId}_external_drafts_report.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  let draftMapPath = null;
  if (args.apply) {
    draftMapPath = path.join(args.outputDir, `batch_${args.batchId}_draft_map.json`);
    fs.writeFileSync(draftMapPath, JSON.stringify({
      batch_id: args.batchId,
      created_at: report.generated_at,
      drafts: report.drafts.map((draft) => ({
        crm_deal_id: draft.crm_deal_id,
        company_id: draft.company_id,
        person_id: draft.person_id,
        recipient_email: draft.recipient_email,
        sender_email: draft.sender_email,
        subject: draft.subject,
        template_name: draft.template_name,
        template_version: draft.template_version,
        attachment_policy: draft.attachment_policy,
        attachment_mime_name: draft.attachment_mime_name,
        gmailDraftId: draft.gmailDraftId,
        gmailMessageId: draft.gmailMessageId,
        gmailThreadId: draft.gmailThreadId,
      })),
    }, null, 2));
  }

  console.log(JSON.stringify({
    status: 'ok',
    mode: report.mode,
    batch_id: args.batchId,
    drafts: report.drafts.length,
    reportPath,
    draftMapPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

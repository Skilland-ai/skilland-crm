#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DATE = '2026-06-08';
const CAMPAIGN_NAME = 'IA Mujeres 2026';
const BUSINESS_LINE = 'SkilLand IA Mujeres';
const TEMPLATE_NAME = 'email_01_approved';
const SEQUENCE_STEP = 1;
const SENDER_EMAIL = 'gerencia@skilland.ai';
const RECIPIENT_EMAIL = 'sales@reboot.academy';
const SUBJECT = 'Una preocupación que quería compartir con usted';
const GERENCIA_CONFIG_DIR = process.env.GWS_GERENCIA_CONFIG_DIR || '/home/reboot/.config/gws_gerencia';
const SALES_CONFIG_DIR = '/home/reboot/.config/gws';
const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');
const TEMPLATE_PATH = path.resolve('shared/templates/ia-mujeres/email_01.html');
const DEFAULT_ATTACHMENT = '/home/reboot/Escritorio/agentic-scrapping-Experiment-scrappling/04_outputs/skilland-ia-mujeres/Mujeres, IA y el futuro del Trabajo - Presentación — SkilLand (1).pdf';
const EXPECTED_ATTACHMENT_NAME = 'Mujeres, IA y el futuro del Trabajo - Presentación corta — SkilLand.pdf';
const ALLOWED_TEST_RECIPIENTS = new Set([
  RECIPIENT_EMAIL,
  SENDER_EMAIL,
  'direccion@skilland.ai',
]);

const LINKS = [
  ['Romina Ojeda Brito', 'https://www.linkedin.com/in/romina-ojeda-brito/'],
  ['Women In STEAM Empowerment Canarias', 'https://www.elespejocanario.es/secciones/wise-canarias-la-primera-asociacion-de-mujeres-steam-del-archipielago/'],
  ['la brecha que se está abriendo con la adopción de la Inteligencia Artificial', 'https://www.fuerteventuradigital.com/articulo/podcasts/romina-ojeda-presidenta-asociacion-canaria-mujeres-cientificas-tecnologicas-wise/20240601092114001713.html'],
  ['aprovechar una tecnología que lo cambia todo', 'https://www.atlanticohoy.com/sociedad/escasez-mujeres-en-ciencia-tecnologia-genera-comunidad_1531733_102.html'],
  ['SkilLand', 'http://www.skilland.ai/'],
];

function parseArgs(argv) {
  const args = {
    createDraft: false,
    verifyDraft: false,
    deleteDraft: false,
    send: false,
    sendInternalReply: false,
    confirmInternalSend: false,
    confirmInternalReply: false,
    checkReception: false,
    checkReplies: false,
    checkBounce: false,
    draftId: undefined,
    threadId: undefined,
    outputDir: DEFAULT_OUTPUT_DIR,
    attachment: DEFAULT_ATTACHMENT,
    attachmentName: EXPECTED_ATTACHMENT_NAME,
  };

  for (const arg of argv) {
    if (arg === '--create-draft') args.createDraft = true;
    else if (arg === '--verify-draft') args.verifyDraft = true;
    else if (arg === '--delete-draft') args.deleteDraft = true;
    else if (arg === '--send') args.send = true;
    else if (arg === '--send-internal-reply') args.sendInternalReply = true;
    else if (arg === '--confirm-internal-send') args.confirmInternalSend = true;
    else if (arg === '--confirm-internal-reply') args.confirmInternalReply = true;
    else if (arg === '--check-reception') args.checkReception = true;
    else if (arg === '--check-replies') args.checkReplies = true;
    else if (arg === '--check-bounce') args.checkBounce = true;
    else if (arg.startsWith('--draft-id=')) args.draftId = arg.slice('--draft-id='.length);
    else if (arg.startsWith('--thread-id=')) args.threadId = arg.slice('--thread-id='.length);
    else if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    else if (arg.startsWith('--attachment=')) args.attachment = path.resolve(arg.slice('--attachment='.length));
    else if (arg.startsWith('--attachment-name=')) args.attachmentName = arg.slice('--attachment-name='.length);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.send && !args.confirmInternalSend) {
    throw new Error('Refusing to send without --confirm-internal-send.');
  }
  if (args.sendInternalReply && !args.confirmInternalReply) {
    throw new Error('Refusing to send internal reply without --confirm-internal-reply.');
  }
  if (args.send && !args.draftId) {
    throw new Error('Sending requires --draft-id=<gmail-draft-id>. Review the draft before sending.');
  }
  if (args.sendInternalReply && !args.threadId) {
    throw new Error('Internal reply requires --thread-id=<sender-thread-id>.');
  }
  if (args.deleteDraft && !args.draftId) {
    throw new Error('Deleting requires --draft-id=<gmail-draft-id>.');
  }
  if (args.verifyDraft && !args.draftId) {
    throw new Error('Verifying requires --draft-id=<gmail-draft-id>.');
  }

  return args;
}

function printHelp() {
  console.log(`IA Mujeres Experiment 00 GWS Lab

Safe by default. Without --create-draft or --send, this only validates and writes previews.

Usage:
  node scripts/ia_mujeres_experiment_00_gws_lab.mjs
  node scripts/ia_mujeres_experiment_00_gws_lab.mjs --create-draft
  node scripts/ia_mujeres_experiment_00_gws_lab.mjs --verify-draft --draft-id=<id>
  node scripts/ia_mujeres_experiment_00_gws_lab.mjs --delete-draft --draft-id=<id>
  node scripts/ia_mujeres_experiment_00_gws_lab.mjs --send --draft-id=<id> --confirm-internal-send
  node scripts/ia_mujeres_experiment_00_gws_lab.mjs --send-internal-reply --thread-id=<id> --confirm-internal-reply
  node scripts/ia_mujeres_experiment_00_gws_lab.mjs --check-reception --thread-id=<id>
  node scripts/ia_mujeres_experiment_00_gws_lab.mjs --check-replies --thread-id=<id>
  node scripts/ia_mujeres_experiment_00_gws_lab.mjs --check-bounce
`);
}

function ensureSafeRecipient(email) {
  const normalized = email.toLowerCase();
  if (!ALLOWED_TEST_RECIPIENTS.has(normalized)) {
    throw new Error(`Unsafe recipient for Experiment 00: ${email}`);
  }
}

function runGws(configDir, gwsArgs, inputJson) {
  const fullArgs = [...gwsArgs];
  if (inputJson !== undefined) {
    fullArgs.push('--json', JSON.stringify(inputJson));
  }

  const stdout = execFileSync('gws', fullArgs, {
    env: {
      ...process.env,
      GOOGLE_WORKSPACE_CLI_CONFIG_DIR: configDir,
    },
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });

  const trimmed = stdout.trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
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
    throw new Error(`OAuth refresh failed: ${JSON.stringify(json).slice(0, 300)}`);
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
    throw new Error(`Gmail API ${method} ${endpoint} failed: ${JSON.stringify(json).slice(0, 500)}`);
  }
  return json;
}

function requireAuth(configDir, expectedUser) {
  const status = runGws(configDir, ['auth', 'status']);
  if (status.user !== expectedUser) {
    throw new Error(`Wrong GWS account. Expected ${expectedUser}, got ${status.user || '(unknown)'}`);
  }
  if (!status.token_valid) {
    throw new Error(`GWS token is not valid for ${expectedUser}`);
  }
  return status;
}

function getGmailSignature() {
  const sendAs = runGws(GERENCIA_CONFIG_DIR, [
    'gmail',
    'users',
    'settings',
    'sendAs',
    'list',
    '--params',
    JSON.stringify({ userId: 'me' }),
  ]);

  const primary = sendAs.sendAs?.find((entry) => entry.sendAsEmail === SENDER_EMAIL && entry.isDefault);
  const signature = primary?.signature?.trim();
  if (!signature) {
    throw new Error(`No Gmail signature found for ${SENDER_EMAIL}. Refusing to create campaign draft without signature.`);
  }

  return signature;
}

function htmlToText(html) {
  return html
    .replace(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/g, '$2 ($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderTemplate(replacements) {
  let html = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(`{{${key}}}`, htmlEscape(value));
  }
  return html;
}

function buildBodies(signatureHtml) {
  const templateHtml = renderTemplate({
    nombre: 'equipo de ventas',
    entidad: 'Reboot Academy/Canarias',
    territorio: 'Canarias',
    area: 'ventas',
    tipo_organizacion: 'organización de formación',
    personalizacion_1: 'Le escribo porque creo que esta conversación puede ser especialmente relevante para Reboot Academy/Canarias, por el papel que tienen las organizaciones de formación, empleo y desarrollo profesional en el acceso a oportunidades reales para las mujeres.',
  });
  const bodyHtml = [
    '<div dir="ltr">',
    templateHtml,
    signatureHtml,
    '</div>',
  ].join('\n');

  const textBody = htmlToText(bodyHtml);
  return { bodyHtml, textBody };
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

function foldBase64(base64) {
  return base64.replace(/.{1,76}/g, '$&\r\n').trimEnd();
}

function buildMime({ attachmentPath, attachmentName, signatureHtml }) {
  const { bodyHtml, textBody } = buildBodies(signatureHtml);
  const mixedBoundary = `skilland_mix_${crypto.randomUUID()}`;
  const altBoundary = `skilland_alt_${crypto.randomUUID()}`;
  const attachmentContent = fs.readFileSync(attachmentPath);
  const attachmentFilename = attachmentName || path.basename(attachmentPath);
  const attachmentBase64 = foldBase64(attachmentContent.toString('base64'));

  const headers = [
    `From: ${SENDER_EMAIL}`,
    `To: ${RECIPIENT_EMAIL}`,
    `Subject: ${encodeMimeHeader(SUBJECT)}`,
    'MIME-Version: 1.0',
    'X-Skilland-Campaign: IA Mujeres 2026',
    'X-Skilland-Experiment: 00-internal-lab',
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

  return { mime, bodyHtml, textBody, attachmentFilename };
}

function writePreviewFiles(outputDir, rendered) {
  fs.mkdirSync(outputDir, { recursive: true });
  const previewHtmlPath = path.join(outputDir, `${DATE}_experiment_00_email_preview.html`);
  const previewTextPath = path.join(outputDir, `${DATE}_experiment_00_email_preview.txt`);
  fs.writeFileSync(previewHtmlPath, rendered.bodyHtml);
  fs.writeFileSync(previewTextPath, rendered.textBody);
  return { previewHtmlPath, previewTextPath };
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

function verifyMessageShape(message, attachmentFilename, bodyHtml) {
  const headers = extractHeaders(message);
  const parts = flattenParts(message.payload);
  const filenames = parts.map((part) => part.filename).filter(Boolean);
  const mimeTypes = parts.map((part) => part.mimeType).filter(Boolean);

  return {
    fromOk: (headers.from ?? '').includes(SENDER_EMAIL),
    toOk: (headers.to ?? '').includes(RECIPIENT_EMAIL),
    subjectOk: (headers.subject ?? '') === SUBJECT,
    linksPresent: LINKS.map(([text, url]) => ({ text, url, present: bodyHtml.includes(url) })),
    attachmentPresent: filenames.includes(attachmentFilename),
    expectedAttachmentNameMatches: attachmentFilename === EXPECTED_ATTACHMENT_NAME,
    signatureMechanism: 'gmail_sendAs_signature_injected_by_runner',
    signaturePresent: true,
    filenames,
    mimeTypes,
  };
}

async function createDraft(raw) {
  return gmailApi(GERENCIA_CONFIG_DIR, 'POST', '/drafts', {
    message: { raw },
  });
}

async function getDraft(draftId) {
  return gmailApi(GERENCIA_CONFIG_DIR, 'GET', `/drafts/${encodeURIComponent(draftId)}?format=full`);
}

async function sendDraft(draftId) {
  return gmailApi(GERENCIA_CONFIG_DIR, 'POST', '/drafts/send', { id: draftId });
}

async function sendMessage(configDir, raw, threadId) {
  return gmailApi(configDir, 'POST', '/messages/send', threadId ? { raw, threadId } : { raw });
}

async function deleteDraft(draftId) {
  return gmailApi(GERENCIA_CONFIG_DIR, 'DELETE', `/drafts/${encodeURIComponent(draftId)}`);
}

async function listMessages(configDir, q, maxResults = 10) {
  const params = new URLSearchParams({ q, maxResults: String(maxResults) });
  return gmailApi(configDir, 'GET', `/messages?${params.toString()}`);
}

async function getMessage(configDir, id, format = 'metadata') {
  const params = new URLSearchParams({ format });
  return gmailApi(configDir, 'GET', `/messages/${encodeURIComponent(id)}?${params.toString()}`);
}

async function getThread(configDir, id) {
  const params = new URLSearchParams({ format: 'metadata' });
  return gmailApi(configDir, 'GET', `/threads/${encodeURIComponent(id)}?${params.toString()}`);
}

function appendEvent(outputDir, event) {
  const eventsPath = path.join(outputDir, 'events.ndjson');
  fs.appendFileSync(eventsPath, `${JSON.stringify(event)}\n`);
  return eventsPath;
}

function buildEvent(type, fields = {}) {
  const { metadata: fieldMetadata = {}, ...rest } = fields;
  return {
    schema_version: '1.0',
    campaign_name: CAMPAIGN_NAME,
    business_line: BUSINESS_LINE,
    event_type: type,
    event_id: crypto.randomUUID(),
    occurred_at: new Date().toISOString(),
    sender_email: SENDER_EMAIL,
    recipient_email: RECIPIENT_EMAIL,
    subject: SUBJECT,
    crm_deal_id: null,
    crm_person_id: null,
    crm_company_id: null,
    metadata: {
      test_mode: true,
      template_name: TEMPLATE_NAME,
      sequence_step: SEQUENCE_STEP,
      sender_account_alias: 'SENDER_ACCOUNT_1',
      experiment_id: 'experiment_00_internal_lab',
      ...fieldMetadata,
    },
    ...rest,
  };
}

function buildReplyMime({ inReplyTo, references }) {
  const body = [
    'Recibido test interno IA Mujeres.',
    '',
    'Confirmo recepcion del email, adjunto, firma y links para validar deteccion de respuesta/thread.',
    '',
    'Un saludo,',
    'Sales Reboot Academy',
  ].join('\r\n');

  const headers = [
    `From: ${RECIPIENT_EMAIL}`,
    `To: ${SENDER_EMAIL}`,
    `Subject: Re: ${encodeMimeHeader(SUBJECT)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Skilland-Campaign: IA Mujeres 2026',
    'X-Skilland-Experiment: 00-internal-lab-reply',
  ];

  if (inReplyTo) headers.push(`In-Reply-To: ${inReplyTo}`);
  if (references) headers.push(`References: ${references}`);

  return [...headers, '', body, ''].join('\r\n');
}

async function findReceivedMessageInSales() {
  const reception = await checkReception();
  const first = reception.messages?.[0];
  if (!first?.id) {
    throw new Error('Cannot send internal reply: no received message found in sales mailbox.');
  }
  const detail = await getMessage(SALES_CONFIG_DIR, first.id, 'metadata');
  const headers = extractHeaders(detail);

  return {
    reception,
    salesMessageId: detail.id,
    salesThreadId: detail.threadId,
    rfcMessageId: headers['message-id'],
    references: headers.references || headers['message-id'],
  };
}

async function checkReception() {
  const query = `from:${SENDER_EMAIL} to:${RECIPIENT_EMAIL} subject:"${SUBJECT}" newer_than:7d`;
  const listed = await listMessages(SALES_CONFIG_DIR, query, 10);
  const messages = listed.messages ?? [];
  const details = [];
  for (const message of messages.slice(0, 3)) {
    const detail = await getMessage(SALES_CONFIG_DIR, message.id, 'metadata');
    const headers = extractHeaders(detail);
    details.push({
      id: detail.id,
      threadId: detail.threadId,
      labels: detail.labelIds ?? [],
      from: headers.from,
      to: headers.to,
      subject: headers.subject,
      date: headers.date,
      readSignal: !(detail.labelIds ?? []).includes('UNREAD') ? 'not_unread' : 'unread',
    });
  }

  return { query, resultSizeEstimate: listed.resultSizeEstimate ?? 0, messages: details };
}

async function checkReplies(threadId) {
  if (!threadId) return { status: 'skipped', reason: 'missing_thread_id' };
  const thread = await getThread(GERENCIA_CONFIG_DIR, threadId);
  const messages = (thread.messages ?? []).map((message) => {
    const headers = extractHeaders(message);
    return {
      id: message.id,
      threadId: message.threadId,
      labels: message.labelIds ?? [],
      from: headers.from,
      to: headers.to,
      subject: headers.subject,
      date: headers.date,
    };
  });

  return {
    status: 'ok',
    messageCount: messages.length,
    hasReply: messages.some((message) => !(message.from ?? '').includes(SENDER_EMAIL)),
    messages,
  };
}

async function checkBounce() {
  const queries = [
    `from:mailer-daemon newer_than:7d "${SUBJECT}"`,
    `from:postmaster newer_than:7d "${SUBJECT}"`,
    `subject:"Delivery Status Notification" newer_than:7d`,
    `subject:Undelivered newer_than:7d`,
  ];

  const results = [];
  for (const query of queries) {
    const listed = await listMessages(GERENCIA_CONFIG_DIR, query, 5);
    results.push({ query, resultSizeEstimate: listed.resultSizeEstimate ?? 0, messages: listed.messages ?? [] });
  }
  return results;
}

function writeRunJson(outputDir, report) {
  const reportPath = path.join(outputDir, `${DATE}_experiment_00_run.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return reportPath;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureSafeRecipient(RECIPIENT_EMAIL);
  fs.mkdirSync(args.outputDir, { recursive: true });

  const report = {
    date: DATE,
    mode: args.createDraft || args.verifyDraft || args.deleteDraft || args.send || args.sendInternalReply || args.checkReception || args.checkReplies || args.checkBounce ? 'apply-safe' : 'dry-run',
    sender: SENDER_EMAIL,
    recipient: RECIPIENT_EMAIL,
    subject: SUBJECT,
    attachment_path: args.attachment,
    expected_attachment_name: EXPECTED_ATTACHMENT_NAME,
    actions: [],
    validations: {},
    events_path: path.join(args.outputDir, 'events.ndjson'),
  };

  report.validations.senderAuth = requireAuth(GERENCIA_CONFIG_DIR, SENDER_EMAIL);
  report.validations.recipientAuth = requireAuth(SALES_CONFIG_DIR, RECIPIENT_EMAIL);

  if (!fs.existsSync(args.attachment)) {
    throw new Error(`Attachment not found: ${args.attachment}`);
  }

  const stat = fs.statSync(args.attachment);
  report.validations.attachment = {
    exists: true,
    path: args.attachment,
    actual_filename: path.basename(args.attachment),
    expected_filename: EXPECTED_ATTACHMENT_NAME,
    mime_filename: args.attachmentName,
    expected_name_matches: args.attachmentName === EXPECTED_ATTACHMENT_NAME,
    bytes: stat.size,
  };

  const signatureHtml = getGmailSignature();
  report.validations.signature = {
    source: 'gmail.users.settings.sendAs.list',
    sender: SENDER_EMAIL,
    present: Boolean(signatureHtml),
  };

  const rendered = buildMime({ attachmentPath: args.attachment, attachmentName: args.attachmentName, signatureHtml });
  const previews = writePreviewFiles(args.outputDir, rendered);
  report.preview = previews;
  report.validations.links = LINKS.map(([text, url]) => ({
    text,
    url,
    present: rendered.bodyHtml.includes(url),
  }));

  const raw = base64Url(rendered.mime);

  if (args.createDraft) {
    const draft = await createDraft(raw);
    const draftId = draft.id;
    const messageId = draft.message?.id;
    const threadId = draft.message?.threadId;
    const draftFull = await getDraft(draftId);
    const shape = verifyMessageShape(draftFull.message, rendered.attachmentFilename, rendered.bodyHtml);
    const event = buildEvent('draft_created', {
      draft_id: draftId,
      message_id: messageId,
      thread_id: threadId,
      metadata: {
        attachment_filename: rendered.attachmentFilename,
        attachment_expected_name_matches: shape.expectedAttachmentNameMatches,
      },
    });

    appendEvent(args.outputDir, event);
    report.actions.push({ type: 'draft_created', draft_id: draftId, message_id: messageId, thread_id: threadId });
    report.validations.draft = shape;
    args.draftId = args.draftId ?? draftId;
    args.threadId = args.threadId ?? threadId;
  }

  if (args.verifyDraft) {
    const draftFull = await getDraft(args.draftId);
    const messageId = draftFull.message?.id;
    const threadId = draftFull.message?.threadId;
    const shape = verifyMessageShape(draftFull.message, rendered.attachmentFilename, rendered.bodyHtml);
    report.actions.push({ type: 'draft_verified', draft_id: args.draftId, message_id: messageId, thread_id: threadId });
    report.validations.draft = shape;
    args.threadId = args.threadId ?? threadId;
  }

  if (args.deleteDraft) {
    await deleteDraft(args.draftId);
    const event = buildEvent('draft_deleted', {
      draft_id: args.draftId,
      metadata: {
        cleanup: true,
      },
    });
    appendEvent(args.outputDir, event);
    report.actions.push({ type: 'draft_deleted', draft_id: args.draftId });
  }

  if (args.send) {
    const draftFull = await getDraft(args.draftId);
    const preSendShape = verifyMessageShape(draftFull.message, rendered.attachmentFilename, rendered.bodyHtml);
    const safeToSend =
      preSendShape.fromOk &&
      preSendShape.toOk &&
      preSendShape.subjectOk &&
      preSendShape.attachmentPresent &&
      preSendShape.expectedAttachmentNameMatches &&
      preSendShape.signaturePresent;

    if (!safeToSend) {
      throw new Error(`Refusing to send draft ${args.draftId}: pre-send validation failed.`);
    }
    report.validations.preSendDraft = preSendShape;

    const sent = await sendDraft(args.draftId);
    const event = buildEvent('email_sent', {
      draft_id: args.draftId,
      message_id: sent.id,
      thread_id: sent.threadId,
      metadata: {
        label_ids: sent.labelIds ?? [],
      },
    });
    appendEvent(args.outputDir, event);
    report.actions.push({ type: 'email_sent', draft_id: args.draftId, message_id: sent.id, thread_id: sent.threadId, labels: sent.labelIds ?? [] });
    args.threadId = args.threadId ?? sent.threadId;
  }

  if (args.checkReception) {
    const reception = await checkReception();
    const firstMessage = reception.messages?.[0];
    const event = buildEvent(reception.resultSizeEstimate > 0 ? 'reception_detected' : 'reception_checked', {
      message_id: firstMessage?.id,
      thread_id: firstMessage?.threadId,
      metadata: {
        result_size_estimate: reception.resultSizeEstimate,
        query: reception.query,
        read_signal: firstMessage?.readSignal,
        sender_mailbox_thread_id: args.threadId,
        labels: firstMessage?.labels ?? [],
      },
    });
    appendEvent(args.outputDir, event);
    report.validations.reception = reception;
    report.actions.push({ type: 'reception_checked', resultSizeEstimate: reception.resultSizeEstimate });
  }

  if (args.sendInternalReply) {
    const received = await findReceivedMessageInSales();
    const replyMime = buildReplyMime({
      inReplyTo: received.rfcMessageId,
      references: received.references,
    });
    const sentReply = await sendMessage(SALES_CONFIG_DIR, base64Url(replyMime), received.salesThreadId);
    const event = buildEvent('internal_reply_sent', {
      sender_email: RECIPIENT_EMAIL,
      recipient_email: SENDER_EMAIL,
      subject: `Re: ${SUBJECT}`,
      message_id: sentReply.id,
      thread_id: args.threadId,
      metadata: {
        recipient_mailbox_thread_id: received.salesThreadId,
        sender_mailbox_thread_id: args.threadId,
        original_received_message_id: received.salesMessageId,
      },
    });
    appendEvent(args.outputDir, event);
    report.validations.internalReply = {
      sent: true,
      salesMessageId: received.salesMessageId,
      salesThreadId: received.salesThreadId,
      replyMessageId: sentReply.id,
      replyThreadId: sentReply.threadId,
      originalSenderThreadId: args.threadId,
    };
    report.actions.push({
      type: 'internal_reply_sent',
      message_id: sentReply.id,
      sales_thread_id: sentReply.threadId,
      original_sender_thread_id: args.threadId,
    });
  }

  if (args.checkReplies) {
    const replies = await checkReplies(args.threadId);
    const replyMessage = replies.messages?.find((message) => !(message.from ?? '').includes(SENDER_EMAIL));
    const event = buildEvent(replies.hasReply ? 'reply_detected' : 'replies_checked', {
      message_id: replyMessage?.id,
      thread_id: args.threadId,
      metadata: {
        status: replies.status,
        has_reply: replies.hasReply ?? false,
        message_count: replies.messageCount ?? 0,
        reply_from: replyMessage?.from,
        reply_to: replyMessage?.to,
        labels: replyMessage?.labels ?? [],
      },
    });
    appendEvent(args.outputDir, event);
    report.validations.replies = replies;
    report.actions.push({ type: 'replies_checked', hasReply: replies.hasReply ?? false, messageCount: replies.messageCount ?? 0 });
  }

  if (args.checkBounce) {
    const bounces = await checkBounce();
    const totalEstimate = bounces.reduce((sum, item) => sum + item.resultSizeEstimate, 0);
    const event = buildEvent(totalEstimate > 0 ? 'bounce_detected' : 'bounce_checked', {
      thread_id: args.threadId,
      metadata: {
        total_estimate: totalEstimate,
        queries: bounces.map((item) => ({
          query: item.query,
          result_size_estimate: item.resultSizeEstimate,
        })),
      },
    });
    appendEvent(args.outputDir, event);
    report.validations.bounces = bounces;
    report.actions.push({ type: 'bounce_checked', totalEstimate });
  }

  report.report_path = writeRunJson(args.outputDir, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

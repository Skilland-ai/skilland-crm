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
const GERENCIA_CONFIG_DIR = '/home/reboot/.config/gws_gerencia';
const SALES_CONFIG_DIR = '/home/reboot/.config/gws';
const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');
const DEFAULT_ATTACHMENT = '/home/reboot/Escritorio/agentic-scrapping-Experiment-scrappling/04_outputs/skilland-ia-mujeres/Mujeres, IA y el futuro del Trabajo - Presentación — SkilLand (1).pdf';
const EXPECTED_ATTACHMENT_NAME = 'Mujeres, IA y el futuro del Trabajo - Presentacion corta — SkilLand.pdf';
const ALLOWED_TEST_RECIPIENTS = new Set([
  RECIPIENT_EMAIL,
  SENDER_EMAIL,
  'direccion@skilland.ai',
]);

const LINKS = [
  ['Romina Ojeda Brito', 'https://www.linkedin.com/in/romina-ojeda-brito/'],
  ['Women In STEAM Empowerment Canarias', 'https://www.elespejocanario.es/secciones/wise-canarias-la-primera-asociacion-de-mujeres-steam-del-archipielago/'],
  ['la brecha que se esta abriendo con la adopcion de la inteligencia artificial', 'https://www.fuerteventuradigital.com/articulo/podcasts/romina-ojeda-presidenta-asociacion-canaria-mujeres-cientificas-tecnologicas-wise/20240601092114001713.html'],
  ['aprovechar una tecnologia que lo cambia todo', 'https://www.atlanticohoy.com/sociedad/escasez-mujeres-en-ciencia-tecnologia-genera-comunidad_1531733_102.html'],
  ['SkilLand', 'http://www.skilland.ai/'],
];

const paragraphs = [
  'Estimado equipo de ventas,',
  'Me llamo <a href="https://www.linkedin.com/in/romina-ojeda-brito/">Romina Ojeda Brito</a>. Durante los ultimos anos he liderado Reboot Academy, un proyecto que nacio en Canarias con una idea muy concreta: ayudar a personas que necesitaban reiniciar su trayectoria profesional, muchas de ellas en situaciones de desempleo, vulnerabilidad o falta de acceso a oportunidades tecnologicas, a formarse en habilidades realmente demandadas por el mercado.',
  'Desde ahi hemos formado a mas de 1.000 estudiantes, y esa experiencia nos llevo a impulsar el Instituto de Innovacion Tecnologica y Educativa para el Desarrollo: una evolucion natural para seguir conectando formacion, tecnologia, metodologia e impacto real en el territorio.',
  'Tambien presido <a href="https://www.elespejocanario.es/secciones/wise-canarias-la-primera-asociacion-de-mujeres-steam-del-archipielago/">Women In STEAM Empowerment Canarias</a>, y desde esa responsabilidad veo con especial claridad <a href="https://www.fuerteventuradigital.com/articulo/podcasts/romina-ojeda-presidenta-asociacion-canaria-mujeres-cientificas-tecnologicas-wise/20240601092114001713.html">la brecha que se esta abriendo con la adopcion de la inteligencia artificial</a>.',
  'Le escribo porque creo que esta conversacion puede ser especialmente relevante para Reboot Academy/Canarias, por el papel que tienen las organizaciones de formacion, empleo y desarrollo profesional en el acceso a oportunidades reales para las mujeres.',
  'La inteligencia artificial puede convertirse en una nueva capa de exclusion laboral femenina o en una oportunidad historica para cerrar brechas, dependiendo de si actuamos a tiempo. En Canarias, ademas, la paradoja es especialmente clara: hay talento femenino, formacion y capacidad, pero no siempre se convierte en empleo cualificado, autonomia economica o acceso a los nuevos roles que esta creando la tecnologia; ni en la posibilidad de <a href="https://www.atlanticohoy.com/sociedad/escasez-mujeres-en-ciencia-tecnologia-genera-comunidad_1531733_102.html">aprovechar una tecnologia que lo cambia todo</a>.',
  'En las ultimas semanas hemos trabajado un documento estrategico sobre mujeres, IA y futuro del trabajo. Le adjunto una presentacion breve de <a href="http://www.skilland.ai/">SkilLand</a> donde resumimos el diagnostico y una posible forma de colaboracion.',
  'La idea no es enviarle un programa cerrado, sino empezar por una reunion inicial, valorar una posible accion de divulgacion en territorio y, si tiene sentido, disenar un proyecto a medida con objetivos, financiacion y KPIs de impacto.',
  '¿Tendria sentido que lo hablaramos en una primera reunion? Podemos adaptarnos al formato que les resulte mas comodo: llamada, videollamada o encuentro presencial.',
  'Un saludo,',
];

function parseArgs(argv) {
  const args = {
    createDraft: false,
    verifyDraft: false,
    deleteDraft: false,
    send: false,
    confirmInternalSend: false,
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
    else if (arg === '--confirm-internal-send') args.confirmInternalSend = true;
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
  if (args.send && !args.draftId) {
    throw new Error('Sending requires --draft-id=<gmail-draft-id>. Review the draft before sending.');
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

function buildBodies(signatureHtml) {
  const bodyHtml = [
    '<div dir="ltr">',
    ...paragraphs.map((paragraph) => paragraph === 'Un saludo,'
      ? `<p>${paragraph}</p>`
      : `<p>${paragraph}</p>`),
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

function verifyMessageShape(message, attachmentFilename) {
  const headers = extractHeaders(message);
  const parts = flattenParts(message.payload);
  const filenames = parts.map((part) => part.filename).filter(Boolean);
  const mimeTypes = parts.map((part) => part.mimeType).filter(Boolean);

  return {
    fromOk: (headers.from ?? '').includes(SENDER_EMAIL),
    toOk: (headers.to ?? '').includes(RECIPIENT_EMAIL),
    subjectOk: (headers.subject ?? '') === SUBJECT,
    linksPresent: LINKS.map(([text, url]) => ({ text, url, present: paragraphs.join('\n').includes(url) })),
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
      ...fields.metadata,
    },
    ...fields,
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
    mode: args.createDraft || args.verifyDraft || args.deleteDraft || args.send || args.checkReception || args.checkReplies || args.checkBounce ? 'apply-safe' : 'dry-run',
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
    const shape = verifyMessageShape(draftFull.message, rendered.attachmentFilename);
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
    const shape = verifyMessageShape(draftFull.message, rendered.attachmentFilename);
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
    const preSendShape = verifyMessageShape(draftFull.message, rendered.attachmentFilename);
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
    report.validations.reception = reception;
    report.actions.push({ type: 'reception_checked', resultSizeEstimate: reception.resultSizeEstimate });
  }

  if (args.checkReplies) {
    const replies = await checkReplies(args.threadId);
    report.validations.replies = replies;
    report.actions.push({ type: 'replies_checked', hasReply: replies.hasReply ?? false, messageCount: replies.messageCount ?? 0 });
  }

  if (args.checkBounce) {
    const bounces = await checkBounce();
    report.validations.bounces = bounces;
    report.actions.push({ type: 'bounce_checked', totalEstimate: bounces.reduce((sum, item) => sum + item.resultSizeEstimate, 0) });
  }

  report.report_path = writeRunJson(args.outputDir, report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

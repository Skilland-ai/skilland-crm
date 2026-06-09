#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const CAMPAIGN_NAME = 'IA Mujeres 2026';
const SENDER_EMAIL = 'gerencia@skilland.ai';
const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');
const DEFAULT_EVENTS_PATH = path.join(DEFAULT_OUTPUT_DIR, 'events.ndjson');
const TIME_ZONE = 'Atlantic/Canary';

function parseArgs(argv) {
  const args = {
    week: '2026-06-08',
    outputDir: DEFAULT_OUTPUT_DIR,
    eventsPath: DEFAULT_EVENTS_PATH,
    crmAuditPath: path.join(DEFAULT_OUTPUT_DIR, '2026-06-08_crm_audit.json'),
    emailDraft: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--week=')) args.week = arg.slice('--week='.length);
    else if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    else if (arg.startsWith('--events=')) args.eventsPath = path.resolve(arg.slice('--events='.length));
    else if (arg.startsWith('--crm-audit=')) args.crmAuditPath = path.resolve(arg.slice('--crm-audit='.length));
    else if (arg === '--email-draft') args.emailDraft = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.week)) {
    throw new Error(`Invalid --week date: ${args.week}`);
  }

  if (args.emailDraft) {
    throw new Error('--email-draft is intentionally not implemented yet. Generate local HTML/MD first and review it.');
  }

  return args;
}

function printHelp() {
  console.log(`IA Mujeres weekly report

Usage:
  node scripts/ia_mujeres_weekly_report.mjs
  node scripts/ia_mujeres_weekly_report.mjs --week=2026-06-08
  node scripts/ia_mujeres_weekly_report.mjs --week=2026-06-08 --events=04_outputs/ia_mujeres_crm_execution/events.ndjson
  node scripts/ia_mujeres_weekly_report.mjs --crm-audit=04_outputs/ia_mujeres_crm_execution/2026-06-08_crm_audit.json

This script reads local events plus the latest CRM audit if present. It does not send email and does not mutate CRM.
`);
}

function addDays(dateOnly, days) {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function localDateOnly(isoDate) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(isoDate));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function localDateTime(isoDate) {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(isoDate));
}

function readEvents(eventsPath) {
  if (!fs.existsSync(eventsPath)) return [];
  return fs
    .readFileSync(eventsPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`Invalid JSON in ${eventsPath}:${index + 1}: ${error.message}`);
      }
    })
    .filter((event) => event.campaign_name === CAMPAIGN_NAME);
}

function readCrmAudit(crmAuditPath) {
  if (!fs.existsSync(crmAuditPath)) return null;
  return JSON.parse(fs.readFileSync(crmAuditPath, 'utf8'));
}

function countWhere(events, predicate) {
  return events.filter(predicate).length;
}

function uniqueCount(events, field) {
  return new Set(events.map((event) => event[field]).filter(Boolean)).size;
}

function operationalThreadId(event) {
  return event.metadata?.sender_mailbox_thread_id || event.thread_id || event.draft_id;
}

function summarize(events) {
  const commercialEvents = events.filter((event) => event.crm_deal_id);
  const labEvents = events.filter((event) => !event.crm_deal_id);
  const bounceEvents = commercialEvents.filter((event) =>
    event.event_type === 'bounce_detected' ||
    (event.event_type === 'bounce_checked' && Number(event.metadata?.total_estimate ?? 0) > 0),
  );
  const emailSentEvents = commercialEvents.filter((event) => event.event_type === 'email_sent');
  const bouncedThreads = new Set(bounceEvents.map(operationalThreadId).filter(Boolean));
  const bouncedRecipients = new Set(bounceEvents.map((event) => event.recipient_email).filter(Boolean));

  return {
    localEvents: events.length,
    commercialEvents: commercialEvents.length,
    labEvents: labEvents.length,
    draftsCreated: countWhere(commercialEvents, (event) => event.event_type === 'draft_created'),
    emailsSent: emailSentEvents.length,
    emailsSentWithoutBounce: emailSentEvents.filter((event) => !bouncedThreads.has(operationalThreadId(event))).length,
    receptionsDetected: countWhere(commercialEvents, (event) => event.event_type === 'reception_detected'),
    repliesDetected: countWhere(commercialEvents, (event) => event.event_type === 'reply_detected'),
    bouncesDetected: bounceEvents.length,
    uniqueThreads: new Set(commercialEvents.map(operationalThreadId).filter(Boolean)).size,
    uniqueRecipients: uniqueCount(commercialEvents.filter((event) => event.recipient_email !== SENDER_EMAIL), 'recipient_email'),
    uniqueRecipientsWithoutBounce: new Set(emailSentEvents.map((event) => event.recipient_email).filter(Boolean).filter((email) => !bouncedRecipients.has(email))).size,
    labEmailsSent: countWhere(labEvents, (event) => event.event_type === 'email_sent'),
    labRepliesDetected: countWhere(labEvents, (event) => event.event_type === 'reply_detected'),
  };
}

function groupByThread(events) {
  const grouped = new Map();
  for (const event of events) {
    const key = operationalThreadId(event) || 'without_thread';
    const group = grouped.get(key) ?? [];
    group.push(event);
    grouped.set(key, group);
  }

  return [...grouped.entries()].map(([threadId, threadEvents]) => {
    const sent = threadEvents.find((event) => event.event_type === 'email_sent');
    const reception = threadEvents.find((event) => event.event_type === 'reception_detected');
    const reply = threadEvents.find((event) => event.event_type === 'reply_detected');
    const bounce = threadEvents.find((event) => event.event_type === 'bounce_detected');
    const lastEvent = [...threadEvents].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)).at(-1);

    return {
      threadId,
      recipient: sent?.recipient_email ?? threadEvents[0]?.recipient_email ?? '',
      draftId: threadEvents.find((event) => event.draft_id)?.draft_id,
      messageId: sent?.message_id,
      status: bounce ? 'bounce' : reply ? 'reply_detected' : reception ? 'received' : sent ? 'sent' : 'draft_only',
      eventCount: threadEvents.length,
      lastEventType: lastEvent?.event_type,
      lastEventAt: lastEvent?.occurred_at,
    };
  });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderCrmStageRows(crmAudit) {
  return Object.entries(crmAudit?.opportunities?.byIaMujeresFunnelStage ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([stage, count]) => `| ${stage} | ${count} |`);
}

function renderMarkdown({ weekStart, weekEnd, events, metrics, threads, crmAudit }) {
  const rows = threads.map((thread) =>
    `| ${thread.threadId} | ${thread.recipient} | ${thread.status} | ${thread.eventCount} | ${thread.lastEventType ?? ''} | ${thread.lastEventAt ? localDateTime(thread.lastEventAt) : ''} |`,
  );
  const crmStageRows = renderCrmStageRows(crmAudit);

  return `# Weekly Report — IA Mujeres

Periodo local: ${weekStart} a ${weekEnd}

## Resumen

| Métrica | Valor |
|---|---:|
| Eventos locales totales | ${metrics.localEvents} |
| Eventos comerciales | ${metrics.commercialEvents} |
| Eventos laboratorio interno | ${metrics.labEvents} |
| Drafts comerciales creados | ${metrics.draftsCreated} |
| Emails comerciales enviados | ${metrics.emailsSent} |
| Emails comerciales sin bounce detectado | ${metrics.emailsSentWithoutBounce} |
| Recepciones comerciales detectadas | ${metrics.receptionsDetected} |
| Replies comerciales detectados | ${metrics.repliesDetected} |
| Bounces comerciales detectados | ${metrics.bouncesDetected} |
| Hilos comerciales únicos | ${metrics.uniqueThreads} |
| Destinatarios comerciales únicos | ${metrics.uniqueRecipients} |
| Destinatarios enviados sin bounce detectado | ${metrics.uniqueRecipientsWithoutBounce} |
| Oportunidades IA Mujeres en CRM | ${crmAudit?.opportunities?.campaign ?? 'sin audit'} |
| Con Gmail thread en CRM | ${crmAudit?.opportunities?.withGmailThreadId ?? 'sin audit'} |
| Revisión manual marcada | ${crmAudit?.opportunities?.needsManualReview ?? 'sin audit'} |

## Estado CRM

| IA Mujeres funnel stage | Deals |
|---|---:|
${crmStageRows.length ? crmStageRows.join('\n') : '| sin audit | 0 |'}

## Estado de hilos

| Thread/Draft | Destinatario | Estado | Eventos | Último evento | Fecha local |
|---|---|---|---:|---|---|
${rows.length ? rows.join('\n') : '| - | - | - | 0 | - | - |'}

## Lectura operativa

- Experimento 0 interno: ${metrics.labEmailsSent > 0 && metrics.labRepliesDetected > 0 ? 'OK' : 'pendiente o incompleto'}.
- Métricas principales: cuentan solo eventos comerciales con \`crm_deal_id\`.
- Aperturas: no se tratan como KPI principal.
- Clicks: no instrumentados porque los links aprobados no se reescriben.
- Pendientes, reuniones y nurturing: disponibles por CRM cuando el runner registre eventos productivos.

## Próximas acciones

- Revisar la vista \`IA Mujeres — Funnel\`.
- Revisar \`batch_<id>_draft_review.md\` antes de crear cualquier draft externo.
- Mantener autorización humana explícita para cualquier envío externo.
`;
}

function renderHtml({ weekStart, weekEnd, events, metrics, threads, crmAudit }) {
  const threadRows = threads.map((thread) => `
        <tr>
          <td><code>${escapeHtml(thread.threadId)}</code></td>
          <td>${escapeHtml(thread.recipient)}</td>
          <td>${escapeHtml(thread.status)}</td>
          <td class="number">${thread.eventCount}</td>
          <td>${escapeHtml(thread.lastEventType)}</td>
          <td>${escapeHtml(thread.lastEventAt ? localDateTime(thread.lastEventAt) : '')}</td>
        </tr>`).join('');
  const crmRows = Object.entries(crmAudit?.opportunities?.byIaMujeresFunnelStage ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([stage, count]) => `
        <tr>
          <td><code>${escapeHtml(stage)}</code></td>
          <td class="number">${escapeHtml(count)}</td>
        </tr>`).join('');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Weekly Report — IA Mujeres</title>
  <style>
    body { margin: 0; background: #f6f7f9; color: #1d2430; font: 14px/1.5 Arial, sans-serif; }
    main { max-width: 920px; margin: 0 auto; padding: 32px 20px; }
    h1 { margin: 0 0 4px; font-size: 26px; }
    h2 { margin: 28px 0 10px; font-size: 18px; }
    .muted { color: #5c6675; margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin-top: 18px; }
    .metric { background: #fff; border: 1px solid #d9dde4; border-radius: 6px; padding: 12px; }
    .metric strong { display: block; font-size: 24px; }
    .metric span { color: #5c6675; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #d9dde4; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e7eaf0; text-align: left; vertical-align: top; }
    th { background: #eef1f5; font-size: 12px; text-transform: uppercase; letter-spacing: .02em; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
    .number { text-align: right; }
    ul { background: #fff; border: 1px solid #d9dde4; border-radius: 6px; margin: 0; padding: 14px 18px 14px 28px; }
  </style>
</head>
<body>
  <main>
    <h1>Weekly Report — IA Mujeres</h1>
    <p class="muted">Periodo local: ${escapeHtml(weekStart)} a ${escapeHtml(weekEnd)}</p>

    <section class="grid" aria-label="Métricas">
      <div class="metric"><strong>${metrics.localEvents}</strong><span>Eventos locales</span></div>
      <div class="metric"><strong>${metrics.commercialEvents}</strong><span>Eventos comerciales</span></div>
      <div class="metric"><strong>${metrics.draftsCreated}</strong><span>Drafts</span></div>
      <div class="metric"><strong>${metrics.emailsSent}</strong><span>Enviados</span></div>
      <div class="metric"><strong>${metrics.emailsSentWithoutBounce}</strong><span>Sin bounce</span></div>
      <div class="metric"><strong>${metrics.receptionsDetected}</strong><span>Recibidos</span></div>
      <div class="metric"><strong>${metrics.repliesDetected}</strong><span>Replies</span></div>
      <div class="metric"><strong>${metrics.bouncesDetected}</strong><span>Bounces</span></div>
      <div class="metric"><strong>${escapeHtml(crmAudit?.opportunities?.campaign ?? 'sin audit')}</strong><span>Deals CRM IA Mujeres</span></div>
      <div class="metric"><strong>${escapeHtml(crmAudit?.opportunities?.withGmailThreadId ?? 'sin audit')}</strong><span>Con Gmail thread</span></div>
    </section>

    <h2>Estado CRM</h2>
    <table>
      <thead>
        <tr>
          <th>IA Mujeres funnel stage</th>
          <th>Deals</th>
        </tr>
      </thead>
      <tbody>
        ${crmRows || '<tr><td colspan="2">Sin audit CRM disponible.</td></tr>'}
      </tbody>
    </table>

    <h2>Estado de hilos</h2>
    <table>
      <thead>
        <tr>
          <th>Thread/Draft</th>
          <th>Destinatario</th>
          <th>Estado</th>
          <th>Eventos</th>
          <th>Último evento</th>
          <th>Fecha local</th>
        </tr>
      </thead>
      <tbody>
        ${threadRows || '<tr><td colspan="6">Sin eventos en el periodo.</td></tr>'}
      </tbody>
    </table>

    <h2>Lectura operativa</h2>
    <ul>
      <li>Experimento 0 interno: ${metrics.labEmailsSent > 0 && metrics.labRepliesDetected > 0 ? 'OK' : 'pendiente o incompleto'}.</li>
      <li>Las métricas principales cuentan solo eventos comerciales con crm_deal_id.</li>
      <li>Aperturas: no se tratan como KPI principal.</li>
      <li>Clicks: no instrumentados porque los links aprobados no se reescriben.</li>
      <li>Pendientes, reuniones y nurturing se leerán del CRM cuando el runner registre eventos productivos.</li>
    </ul>

    <h2>Próximas acciones</h2>
    <ul>
      <li>Revisar la vista IA Mujeres — Funnel.</li>
      <li>Revisar batch_&lt;id&gt;_draft_review.md antes de crear cualquier draft externo.</li>
      <li>Mantener autorización humana explícita para cualquier envío externo.</li>
    </ul>
  </main>
</body>
</html>
`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const weekStart = args.week;
  const weekEndExclusive = addDays(weekStart, 7);
  const weekEnd = addDays(weekEndExclusive, -1);
  const events = readEvents(args.eventsPath).filter((event) => {
    const localDate = localDateOnly(event.occurred_at);
    return localDate >= weekStart && localDate < weekEndExclusive;
  });
  const metrics = summarize(events);
  const threads = groupByThread(events.filter((event) => event.crm_deal_id));
  const crmAudit = readCrmAudit(args.crmAuditPath);

  fs.mkdirSync(args.outputDir, { recursive: true });
  const mdPath = path.join(args.outputDir, `weekly_report_${weekStart}.md`);
  const htmlPath = path.join(args.outputDir, `weekly_report_${weekStart}.html`);

  fs.writeFileSync(mdPath, renderMarkdown({ weekStart, weekEnd, events, metrics, threads, crmAudit }));
  fs.writeFileSync(htmlPath, renderHtml({ weekStart, weekEnd, events, metrics, threads, crmAudit }));

  console.log(JSON.stringify({
    status: 'ok',
    campaign: CAMPAIGN_NAME,
    week_start: weekStart,
    week_end: weekEnd,
    events: events.length,
    outputs: { markdown: mdPath, html: htmlPath },
    crmAudit: crmAudit ? args.crmAuditPath : null,
    metrics,
  }, null, 2));
}

main();

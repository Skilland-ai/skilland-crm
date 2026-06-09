#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BUSINESS_LINE_NAME = 'SkilLand IA Mujeres';
const CAMPAIGN_NAME = 'IA Mujeres 2026';
const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');
const DEFAULT_EVENTS_PATH = path.join(DEFAULT_OUTPUT_DIR, 'events.ndjson');
const TEMPLATE_DIR = path.resolve('shared/templates/ia-mujeres');
const EMAIL_01_TEMPLATE = path.join(TEMPLATE_DIR, 'email_01.html');
const TEMPLATE_METADATA = path.join(TEMPLATE_DIR, 'template_metadata.json');
const DEFAULT_SENDER = 'gerencia@skilland.ai';
const EMAIL_01_SUBJECT = 'Una preocupación que quería compartir con usted';
const TODAY = '2026-06-08';
const RAUL_ARTILES_WORKSPACE_MEMBER_ID = '323c2357-853d-45bc-ad7d-1703de9deef6';
const RAUL_ARTILES_EMAIL = 'raul@reboot.academy';
const TASK_REVIEW_DRAFT_EMAIL_1 = '[IA Mujeres] Revisar draft Email 1';
const TASK_REVIEW_FOLLOW_UP_1 = '[IA Mujeres] Revisar respuesta / preparar Follow-up 1';

const IA_STAGE_OPTIONS = [
  ['NOT_SENT', 'Sin enviar', 'gray'],
  ['DRAFT_CREATED', 'Draft creado', 'blue'],
  ['EMAIL_1_SENT', 'Email 1 enviado', 'sky'],
  ['EMAIL_1_RECEIVED_SIGNAL', 'Email 1 recibido / señal débil', 'turquoise'],
  ['NO_REPLY', 'Sin respuesta', 'orange'],
  ['FOLLOW_UP_1_PENDING', 'Follow-up 1 pendiente', 'yellow'],
  ['FOLLOW_UP_1_DRAFTED', 'Follow-up 1 draft creado', 'blue'],
  ['FOLLOW_UP_1_SENT', 'Follow-up 1 enviado', 'sky'],
  ['FOLLOW_UP_2_PENDING', 'Follow-up 2 pendiente', 'yellow'],
  ['FOLLOW_UP_2_DRAFTED', 'Follow-up 2 draft creado', 'blue'],
  ['FOLLOW_UP_2_SENT', 'Follow-up 2 enviado', 'sky'],
  ['NURTURING', 'Nurturing', 'purple'],
  ['REPLY_RECEIVED', 'Respuesta recibida', 'green'],
  ['MEETING_PROPOSED', 'Reunión propuesta', 'green'],
  ['MEETING_SCHEDULED', 'Reunión agendada', 'green'],
  ['MEETING_DONE', 'Reunión realizada', 'green'],
  ['NOT_INTERESTED', 'No interesado', 'red'],
  ['WRONG_CONTACT_MANUAL_REVIEW', 'Contacto incorrecto / revisión manual', 'pink'],
];

const IA_STAGE_VALUES = new Set(IA_STAGE_OPTIONS.map(([value]) => value));

const TRACKING_FIELDS = [
  { name: 'iaMujeresFunnelStage', label: 'IA Mujeres Funnel Stage', type: 'SELECT', options: IA_STAGE_OPTIONS },
  { name: 'gmailDraftId', label: 'Gmail Draft ID', type: 'TEXT' },
  { name: 'gmailMessageId', label: 'Gmail Message ID', type: 'TEXT' },
  { name: 'gmailThreadId', label: 'Gmail Thread ID', type: 'TEXT' },
  { name: 'lastEmailEventAt', label: 'Last Email Event At', type: 'DATE_TIME' },
  { name: 'lastEmailEventType', label: 'Last Email Event Type', type: 'TEXT' },
  { name: 'activeBatchId', label: 'Active Batch ID', type: 'TEXT' },
  { name: 'lastEmailTemplate', label: 'Last Email Template', type: 'TEXT' },
  { name: 'lastEmailSubject', label: 'Last Email Subject', type: 'TEXT' },
];

const VIEW_FIELDS = [
  ['name', 320],
  ['company', 240],
  ['pointOfContact', 220],
  ['iaMujeresFunnelStage', 220],
  ['stage', 190],
  ['outreachStatus', 190],
  ['followUpDueAt', 190],
  ['lastEmailSentAt', 190],
  ['lastReplyAt', 190],
  ['gmailThreadId', 190],
  ['needsManualReview', 160],
];

const SUPPORTING_VIEWS = [
  // Intentionally empty: the CRM must expose one IA Mujeres funnel view only.
];

function parseArgs(argv) {
  const args = {
    mode: undefined,
    apply: false,
    limit: 5,
    outputDir: DEFAULT_OUTPUT_DIR,
    eventsPath: DEFAULT_EVENTS_PATH,
    batchId: undefined,
    draftMap: undefined,
    sentMap: undefined,
    approvedBy: undefined,
    confirmCreateExternalDrafts: false,
    confirmSend: false,
    initializeStages: true,
  };

  for (const arg of argv) {
    if (arg === '--prepare-next-batch') args.mode = 'select-batch';
    else if (arg.startsWith('--mode=')) args.mode = arg.slice('--mode='.length);
    else if (arg === '--apply') args.apply = true;
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    else if (arg.startsWith('--events=')) args.eventsPath = path.resolve(arg.slice('--events='.length));
    else if (arg.startsWith('--batch-id=')) args.batchId = arg.slice('--batch-id='.length);
    else if (arg.startsWith('--draft-map=')) args.draftMap = path.resolve(arg.slice('--draft-map='.length));
    else if (arg.startsWith('--sent-map=')) args.sentMap = path.resolve(arg.slice('--sent-map='.length));
    else if (arg.startsWith('--approved-by=')) args.approvedBy = arg.slice('--approved-by='.length);
    else if (arg === '--confirm-create-external-drafts') args.confirmCreateExternalDrafts = true;
    else if (arg === '--confirm-send') args.confirmSend = true;
    else if (arg === '--no-initialize-stages') args.initializeStages = false;
    else if (arg === '--create-drafts') args.mode = 'prepare-drafts';
    else if (arg === '--send-approved') args.mode = 'send-approved';
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  args.mode = args.mode ?? 'audit';
  const allowedModes = new Set([
    'audit',
    'setup-crm',
    'select-batch',
    'prepare-drafts',
    'mark-draft-created',
    'mark-email-sent',
    'send-approved',
    'sync-replies',
    'sync-bounces',
    'prepare-followups',
    'reconcile-tasks',
  ]);
  if (!allowedModes.has(args.mode)) throw new Error(`Unsupported --mode=${args.mode}`);
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 5) {
    throw new Error('--limit must be an integer between 1 and 5.');
  }
  if (['prepare-drafts', 'mark-draft-created', 'mark-email-sent', 'send-approved'].includes(args.mode) && !args.batchId) {
    throw new Error(`--mode=${args.mode} requires --batch-id=<id>.`);
  }
  if (args.mode === 'mark-draft-created' && args.apply && !args.draftMap) {
    throw new Error('--mode=mark-draft-created --apply requires --draft-map=<json>.');
  }
  if (args.mode === 'mark-email-sent' && args.apply && !args.sentMap) {
    throw new Error('--mode=mark-email-sent --apply requires --sent-map=<json>.');
  }
  if (args.mode === 'send-approved') {
    throw new Error('send-approved remains blocked in this phase. Enable only after external draft review and explicit campaign approval.');
  }

  return args;
}

function printHelp() {
  console.log(`IA Mujeres CRM batch runner

Usage:
  node scripts/ia_mujeres_batch_runner.mjs --mode=audit
  node scripts/ia_mujeres_batch_runner.mjs --mode=setup-crm --apply
  node scripts/ia_mujeres_batch_runner.mjs --mode=select-batch --limit=5
  node scripts/ia_mujeres_batch_runner.mjs --mode=prepare-drafts --batch-id=<id>
  node scripts/ia_mujeres_batch_runner.mjs --mode=mark-draft-created --batch-id=<id> --draft-map=<json> --apply
  node scripts/ia_mujeres_batch_runner.mjs --mode=mark-email-sent --batch-id=<id> --sent-map=<json> --apply
  node scripts/ia_mujeres_batch_runner.mjs --mode=sync-replies
  node scripts/ia_mujeres_batch_runner.mjs --mode=sync-bounces
  node scripts/ia_mujeres_batch_runner.mjs --mode=prepare-followups --limit=5
  node scripts/ia_mujeres_batch_runner.mjs --mode=reconcile-tasks --apply

All CRM mutations require --apply. No external email is sent by this runner.
`);
}

function readCredentials() {
  const raw = fs.readFileSync('/home/reboot/.claude.json', 'utf8');
  const keyMatch = raw.match(/"TWENTY_API_KEY"\s*:\s*"([^"]+)"/);
  const baseMatch = raw.match(/"TWENTY_BASE_URL"\s*:\s*"([^"]+)"/);
  if (!keyMatch) throw new Error('TWENTY_API_KEY not found in /home/reboot/.claude.json');
  return {
    apiKey: keyMatch[1],
    baseUrl: (baseMatch ? baseMatch[1] : 'https://crm.skilland.ai').replace(/\/+$/, ''),
  };
}

class TwentyClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async requestJson(url, init = {}) {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(url, {
        ...init,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
      const text = await response.text();
      const json = text ? JSON.parse(text) : {};
      if (response.status === 429 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 65000));
        continue;
      }
      if (!response.ok || json.errors?.length) {
        throw new Error(`Twenty API error ${response.status}: ${JSON.stringify(json).slice(0, 900)}`);
      }
      return json;
    }
    throw new Error('Twenty API retry loop exhausted.');
  }

  async gql(query, variables = {}) {
    const json = await this.requestJson(`${this.baseUrl}/graphql`, {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    });
    return json.data;
  }

  async metadata(query, variables = {}) {
    const json = await this.requestJson(`${this.baseUrl}/metadata`, {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    });
    return json.data;
  }

  async rest(pathName, init = {}) {
    return this.requestJson(`${this.baseUrl}/rest${pathName}`, init);
  }

  async metadataObjects() {
    const json = await this.requestJson(`${this.baseUrl}/rest/metadata/objects`, { method: 'GET' });
    return json.data.objects;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonIfExists(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function htmlEscape(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

function renderEmail01(candidate) {
  let html = fs.readFileSync(EMAIL_01_TEMPLATE, 'utf8');
  const replacements = {
    nombre: displaySpanishValue(candidate.person_name || 'equipo'),
    entidad: displaySpanishValue(candidate.company_name || candidate.deal_name || 'su entidad'),
    territorio: displaySpanishValue(candidate.island || candidate.municipality || 'Canarias'),
    area: displaySpanishValue(candidate.department_area || 'igualdad, empleo o desarrollo local'),
    tipo_organizacion: candidate.organization_type || 'entidad pública',
    personalizacion_1: buildPersonalization(candidate),
  };
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(`{{${key}}}`, htmlEscape(value));
  }
  return {
    subject: EMAIL_01_SUBJECT,
    html,
    text: htmlToText(html),
  };
}

function buildPersonalization(candidate) {
  const entity = displaySpanishValue(candidate.company_name || candidate.deal_name || 'su entidad');
  const territory = displaySpanishValue(candidate.island || candidate.municipality || 'Canarias');
  const area = displaySpanishValue(candidate.department_area || 'formación, empleo, igualdad o desarrollo profesional');
  return `Le escribo porque creo que esta conversación puede ser especialmente relevante para ${entity}, por el papel que tienen las organizaciones vinculadas a ${area} en el acceso a oportunidades reales para las mujeres en ${territory}.`;
}

function displaySpanishValue(value) {
  return String(value ?? '')
    .replaceAll('Politicas', 'Políticas')
    .replaceAll('politicas', 'políticas')
    .replaceAll('Participacion', 'Participación')
    .replaceAll('participacion', 'participación')
    .replaceAll('Educacion', 'Educación')
    .replaceAll('educacion', 'educación')
    .replaceAll('Formacion', 'Formación')
    .replaceAll('formacion', 'formación')
    .replaceAll('Informacion', 'Información')
    .replaceAll('informacion', 'información')
    .replaceAll('Accion', 'Acción')
    .replaceAll('accion', 'acción')
    .replaceAll('Mogan', 'Mogán')
    .replaceAll('Guimar', 'Güímar')
    .replaceAll('Aguimes', 'Agüimes')
    .replaceAll('Guia de Isora', 'Guía de Isora')
    .replaceAll('Santa Brigida', 'Santa Brígida')
    .replaceAll('San Nicolas', 'San Nicolás');
}

function addDaysIso(dateLike, days) {
  const date = new Date(dateLike);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
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
    });
}

function eventSentRecipients(events) {
  return new Set(
    events
      .filter((event) => event.campaign_name === CAMPAIGN_NAME && event.event_type === 'email_sent')
      .map((event) => String(event.recipient_email ?? '').toLowerCase())
      .filter(Boolean),
  );
}

function isEmailLike(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function primaryEmail(opportunity) {
  return (
    opportunity.pointOfContact?.emails?.primaryEmail ||
    opportunity.company?.emailMain ||
    ''
  ).trim().toLowerCase();
}

function personName(person) {
  return [person?.name?.firstName, person?.name?.lastName].filter(Boolean).join(' ').trim();
}

function toCandidate(opportunity, sentRecipients) {
  const email = primaryEmail(opportunity);
  const reasons = [];
  if (opportunity.businessLineName !== BUSINESS_LINE_NAME) reasons.push('business_line_mismatch');
  if (opportunity.campaignName !== CAMPAIGN_NAME) reasons.push('campaign_mismatch');
  if (!['pending_first_email', 'not_sent', 'draft_created', null, undefined].includes(opportunity.outreachStatus)) {
    reasons.push('not_pending_first_email');
  }
  if (opportunity.iaMujeresFunnelStage && opportunity.iaMujeresFunnelStage !== 'NOT_SENT') {
    reasons.push('ia_stage_not_not_sent');
  }
  if (!email) reasons.push('missing_email');
  if (email && !isEmailLike(email)) reasons.push('invalid_email');
  if (opportunity.needsManualReview) reasons.push('needs_manual_review');
  if (opportunity.duplicatePossible) reasons.push('duplicate_possible');
  if (opportunity.genericEmail) reasons.push('generic_email');
  if (opportunity.highConfidence !== true) reasons.push('not_high_confidence');
  if (opportunity.firstEmailSentAt || opportunity.lastEmailSentAt) reasons.push('already_has_sent_timestamp');
  if (opportunity.lastReplyAt) reasons.push('already_has_reply_timestamp');
  if (opportunity.gmailThreadId || opportunity.gmailMessageId) reasons.push('already_has_gmail_ids');
  if (email && sentRecipients.has(email)) reasons.push('already_sent_in_events');

  return {
    crm_deal_id: opportunity.id,
    deal_name: displaySpanishValue(opportunity.name),
    company_id: opportunity.company?.id ?? null,
    company_name: opportunity.company?.name ? displaySpanishValue(opportunity.company.name) : null,
    person_id: opportunity.pointOfContact?.id ?? null,
    person_name: personName(opportunity.pointOfContact) || null,
    email,
    organization_type: opportunity.organizationType ?? null,
    department_area: opportunity.departmentArea ? displaySpanishValue(opportunity.departmentArea) : null,
    island: opportunity.island ? displaySpanishValue(opportunity.island) : null,
    municipality: opportunity.municipality ? displaySpanishValue(opportunity.municipality) : null,
    icp_segment: opportunity.icpSegment ?? null,
    quality_flags: opportunity.qualityFlags ?? null,
    outreach_status: opportunity.outreachStatus ?? null,
    ia_mujeres_funnel_stage: opportunity.iaMujeresFunnelStage ?? null,
    high_confidence: opportunity.highConfidence ?? null,
    generic_email: opportunity.genericEmail ?? null,
    needs_manual_review: opportunity.needsManualReview ?? null,
    duplicate_possible: opportunity.duplicatePossible ?? null,
    eligible: reasons.length === 0,
    exclusion_reasons: reasons,
  };
}

async function fetchMetadataSnapshot(client) {
  const objects = await client.metadataObjects();
  const opportunity = objects.find((object) => object.nameSingular === 'opportunity');
  const task = objects.find((object) => object.nameSingular === 'task');
  const note = objects.find((object) => object.nameSingular === 'note');
  if (!opportunity) throw new Error('Opportunity metadata not found');
  return {
    objects,
    opportunity,
    task,
    note,
    fieldByName: new Map(opportunity.fields.map((field) => [field.name, field])),
  };
}

async function fetchViews(client, opportunityObjectId) {
  const data = await client.metadata(
    `query Views($objectMetadataId: String!) {
      getCoreViews(objectMetadataId: $objectMetadataId) {
        id
        name
        type
        key
        position
        icon
        visibility
        isCompact
        mainGroupByFieldMetadataId
        shouldHideEmptyGroups
        viewFields { id fieldMetadataId isVisible position size }
        viewFilters { id fieldMetadataId operand value subFieldName viewFilterGroupId positionInViewFilterGroup }
        viewGroups { id fieldValue isVisible position }
      }
    }`,
    { objectMetadataId: opportunityObjectId },
  );
  return data.getCoreViews;
}

async function fetchOpportunities(client, includeNewFields = true) {
  const extraFields = includeNewFields ? `
            iaMujeresFunnelStage
            gmailDraftId
            gmailMessageId
            gmailThreadId
            lastEmailEventAt
            lastEmailEventType
            activeBatchId
            lastEmailTemplate
            lastEmailSubject
  ` : '';
  const data = await client.gql(`
    query IaMujeresBatchCandidates {
      opportunities(first: 500) {
        edges {
          node {
            id
            name
            stage
            businessLineName
            campaignName
            outreachStatus
            organizationType
            departmentArea
            island
            municipality
            icpSegment
            qualityFlags
            highConfidence
            genericEmail
            needsManualReview
            duplicatePossible
            firstEmailSentAt
            lastEmailSentAt
            lastReplyAt
            followUpDueAt
            meetingStatus
            meetingDate
            ${extraFields}
            company {
              id
              name
              emailMain
              domainName { primaryLinkUrl }
            }
            pointOfContact {
              id
              name { firstName lastName }
              emails { primaryEmail additionalEmails }
            }
          }
        }
      }
    }
  `);
  return data.opportunities.edges.map(({ node }) => node);
}

function campaignOpportunities(opportunities) {
  return opportunities.filter(
    (opportunity) =>
      opportunity.businessLineName === BUSINESS_LINE_NAME ||
      opportunity.campaignName === CAMPAIGN_NAME,
  );
}

function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const value = item[key] ?? '(empty)';
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function validateViewFilters(views, fieldById) {
  return views.flatMap((view) =>
    view.viewFilters.map((filter) => {
      const field = fieldById.get(filter.fieldMetadataId);
      const valid = field?.type === 'TEXT'
        ? ['CONTAINS', 'DOES_NOT_CONTAIN', 'IS_EMPTY', 'IS_NOT_EMPTY'].includes(filter.operand)
        : true;
      return {
        view: view.name,
        filterId: filter.id,
        fieldName: field?.name ?? '(unknown)',
        fieldType: field?.type ?? '(unknown)',
        operand: filter.operand,
        valid,
      };
    }),
  );
}

function selectCandidates({ opportunities, sentRecipients, limit }) {
  const allCampaign = campaignOpportunities(opportunities).map((opportunity) => toCandidate(opportunity, sentRecipients));
  const eligible = allCampaign.filter((candidate) => candidate.eligible).slice(0, limit);
  const excluded = allCampaign.filter((candidate) => !candidate.eligible);
  const batchId = new Date().toISOString().replace(/[:.]/g, '-');

  return {
    schema_version: '1.0',
    batch_id: batchId,
    generated_at: new Date().toISOString(),
    mode: 'dry-run',
    campaign_name: CAMPAIGN_NAME,
    business_line: BUSINESS_LINE_NAME,
    limit,
    safeguards: [
      'No Gmail draft creation in select-batch.',
      'No external send in this runner.',
      'Limit capped at 5.',
      'Requires IA stage NOT_SENT/empty, highConfidence=true, no manual review, no duplicate flag, non-generic email.',
      'Excludes recipients already present in local email_sent events.',
    ],
    summary: {
      crm_opportunities_seen: opportunities.length,
      campaign_opportunities_seen: allCampaign.length,
      eligible_count: allCampaign.filter((candidate) => candidate.eligible).length,
      selected_count: eligible.length,
      excluded_count: excluded.length,
    },
    selected: eligible,
    excluded,
  };
}

function renderReview(plan) {
  const selectedRows = plan.selected.map((candidate, index) =>
    `| ${index + 1} | ${candidate.deal_name} | ${candidate.company_name ?? ''} | ${candidate.person_name ?? ''} | ${candidate.email} | ${candidate.organization_type ?? ''} | ${candidate.ia_mujeres_funnel_stage ?? ''} |`,
  );
  const excludedRows = plan.excluded.slice(0, 30).map((candidate) =>
    `| ${candidate.deal_name} | ${candidate.email || '-'} | ${candidate.exclusion_reasons.join(', ')} |`,
  );

  return `# IA Mujeres Batch Review

Batch ID: \`${plan.batch_id}\`

Modo: \`${plan.mode}\`

## Resumen

| Métrica | Valor |
|---|---:|
| Opportunities CRM vistas | ${plan.summary.crm_opportunities_seen} |
| Opportunities IA Mujeres vistas | ${plan.summary.campaign_opportunities_seen} |
| Elegibles | ${plan.summary.eligible_count} |
| Seleccionadas | ${plan.summary.selected_count} |
| Excluidas | ${plan.summary.excluded_count} |

## Selección propuesta

| # | Deal | Company | Contacto | Email | Tipo | Estado IA |
|---:|---|---|---|---|---|---|
${selectedRows.length ? selectedRows.join('\n') : '| - | - | - | - | - | - | - |'}

## Excluidas principales

| Deal | Email | Motivos |
|---|---|---|
${excludedRows.length ? excludedRows.join('\n') : '| - | - | - |'}

## Safeguards

${plan.safeguards.map((item) => `- ${item}`).join('\n')}

## Siguiente paso

Revisar esta selección. La creación de drafts externos sigue bloqueada hasta aprobación humana explícita y uso del modo correspondiente.
`;
}

function writeBatchPlan(outputDir, plan) {
  ensureDir(outputDir);
  const jsonPath = path.join(outputDir, `batch_${plan.batch_id}_plan.json`);
  const reviewPath = path.join(outputDir, `batch_${plan.batch_id}_review.md`);
  writeJson(jsonPath, plan);
  fs.writeFileSync(reviewPath, renderReview(plan));
  return { jsonPath, reviewPath };
}

function batchPlanPath(outputDir, batchId) {
  return path.join(outputDir, `batch_${batchId}_plan.json`);
}

function buildFieldOptions(options) {
  return options.map(([value, label, color], position) => ({
    id: crypto.randomUUID(),
    value,
    label,
    color,
    position,
  }));
}

async function createField(client, opportunityObjectId, fieldDef) {
  const payload = {
    objectMetadataId: opportunityObjectId,
    name: fieldDef.name,
    label: fieldDef.label,
    type: fieldDef.type,
    isCustom: true,
    isActive: true,
    isNullable: true,
  };
  if (fieldDef.options) payload.options = buildFieldOptions(fieldDef.options);

  const data = await client.metadata(
    `mutation CreateField($input: CreateOneFieldMetadataInput!) {
      createOneField(input: $input) { id name label type }
    }`,
    { input: { field: payload } },
  );
  return data.createOneField;
}

function viewFilterExists(view, fieldMetadataId, operand, value) {
  return view.viewFilters.some((filter) => {
    const raw = filter.value;
    return filter.fieldMetadataId === fieldMetadataId &&
      filter.operand === operand &&
      (raw === value || raw === JSON.stringify(value));
  });
}

async function ensureViewFilter(client, view, fieldByName, fieldName, operand, value, report) {
  const field = fieldByName.get(fieldName);
  if (!field) {
    report.views.missingFields.push({ view: view.name, fieldName });
    return;
  }
  const normalizedOperand = field.type === 'TEXT' && operand === 'IS' ? 'CONTAINS' : operand;
  if (viewFilterExists(view, field.id, normalizedOperand, value)) return;

  const data = await client.metadata(
    `mutation CreateViewFilter($input: CreateViewFilterInput!) {
      createCoreViewFilter(input: $input) { id }
    }`,
    {
      input: {
        viewId: view.id,
        fieldMetadataId: field.id,
        operand: normalizedOperand,
        value: field.type === 'TEXT' ? value : JSON.stringify(value),
      },
    },
  );
  report.views.filtersCreated.push({ view: view.name, fieldName, operand: normalizedOperand, value, id: data.createCoreViewFilter.id });
}

async function ensureViewField(client, view, fieldByName, fieldName, size, position, report) {
  const field = fieldByName.get(fieldName);
  if (!field) {
    report.views.missingFields.push({ view: view.name, fieldName });
    return;
  }
  if (view.viewFields.some((viewField) => viewField.fieldMetadataId === field.id)) return;

  const data = await client.metadata(
    `mutation CreateViewField($input: CreateViewFieldInput!) {
      createCoreViewField(input: $input) { id }
    }`,
    { input: { viewId: view.id, fieldMetadataId: field.id, isVisible: true, size, position } },
  );
  report.views.fieldsCreated.push({ view: view.name, fieldName, id: data.createCoreViewField.id });
}

async function ensureViewGroup(client, view, value, position, report) {
  const existing = view.viewGroups.find((group) => group.fieldValue === value);
  if (existing) {
    if (!existing.isVisible) {
      await client.metadata(
        `mutation UpdateViewGroup($input: UpdateViewGroupInput!) {
          updateCoreViewGroup(input: $input) { id isVisible }
        }`,
        { input: { id: existing.id, update: { isVisible: true, position } } },
      );
      report.views.groupsUpdated.push({ view: view.name, fieldValue: value, action: 'made_visible' });
    }
    return;
  }

  const data = await client.metadata(
    `mutation CreateViewGroup($input: CreateViewGroupInput!) {
      createCoreViewGroup(input: $input) { id fieldValue }
    }`,
    { input: { viewId: view.id, fieldValue: value, isVisible: true, position } },
  );
  report.views.groupsCreated.push({ view: view.name, fieldValue: value, id: data.createCoreViewGroup.id });
}

async function hideLegacyGroups(client, view, report) {
  for (const group of view.viewGroups) {
    if (IA_STAGE_VALUES.has(group.fieldValue) || !group.isVisible) continue;
    await client.metadata(
      `mutation UpdateViewGroup($input: UpdateViewGroupInput!) {
        updateCoreViewGroup(input: $input) { id isVisible }
      }`,
      { input: { id: group.id, update: { isVisible: false } } },
    );
    report.views.groupsUpdated.push({ view: view.name, fieldValue: group.fieldValue, action: 'hidden_legacy_group' });
  }
}

async function ensureCoreView(client, snapshot, views, report) {
  const { opportunity, fieldByName } = snapshot;
  const iaStageField = fieldByName.get('iaMujeresFunnelStage');
  let view = views.find((item) => item.name === 'IA Mujeres — Funnel') ?? views.find((item) => item.name === 'IA Mujeres Funnel');

  if (!view) {
    const data = await client.metadata(
      `mutation CreateView($input: CreateViewInput!) {
        createCoreView(input: $input) { id name type }
      }`,
      {
        input: {
          name: 'IA Mujeres — Funnel',
          objectMetadataId: opportunity.id,
          type: 'KANBAN',
          icon: 'IconLayoutKanban',
          position: 20,
          visibility: 'WORKSPACE',
          mainGroupByFieldMetadataId: iaStageField.id,
          shouldHideEmptyGroups: false,
        },
      },
    );
    report.views.created.push({ name: 'IA Mujeres — Funnel', id: data.createCoreView.id });
    views = await fetchViews(client, opportunity.id);
    view = views.find((item) => item.id === data.createCoreView.id);
  } else {
    await client.metadata(
      `mutation UpdateView($id: String!, $input: UpdateViewInput!) {
        updateCoreView(id: $id, input: $input) { id name type mainGroupByFieldMetadataId }
      }`,
      {
        id: view.id,
        input: {
          name: 'IA Mujeres — Funnel',
          type: 'KANBAN',
          icon: 'IconLayoutKanban',
          position: 20,
          visibility: 'WORKSPACE',
          mainGroupByFieldMetadataId: iaStageField.id,
          shouldHideEmptyGroups: false,
        },
      },
    );
    report.views.updated.push({ from: view.name, to: 'IA Mujeres — Funnel', id: view.id, mainGroupBy: 'iaMujeresFunnelStage' });
    views = await fetchViews(client, opportunity.id);
    view = views.find((item) => item.id === view.id);
  }

  await ensureBaseViewConfiguration(client, view, fieldByName, report);
  await hideLegacyGroups(client, view, report);
  for (const [value, _label, _color] of IA_STAGE_OPTIONS) {
    await ensureViewGroup(client, view, value, IA_STAGE_OPTIONS.findIndex(([candidate]) => candidate === value), report);
  }
}

async function ensureBaseViewConfiguration(client, view, fieldByName, report) {
  await ensureViewFilter(client, view, fieldByName, 'campaignName', 'IS', CAMPAIGN_NAME, report);
  for (const [fieldName, size] of VIEW_FIELDS) {
    await ensureViewField(client, view, fieldByName, fieldName, size, VIEW_FIELDS.findIndex(([candidate]) => candidate === fieldName), report);
  }
}

async function ensureSupportingViews(client, snapshot, views, report) {
  const { opportunity, fieldByName } = snapshot;
  for (const viewDef of SUPPORTING_VIEWS) {
    let view = views.find((item) => item.name === viewDef.name);
    if (!view && viewDef.name === 'IA Mujeres — Lista') {
      view = views.find((item) => item.name === 'IA Mujeres — Todos');
    }

    if (!view) {
      const data = await client.metadata(
        `mutation CreateView($input: CreateViewInput!) {
          createCoreView(input: $input) { id name type }
        }`,
        {
          input: {
            name: viewDef.name,
            objectMetadataId: opportunity.id,
            type: viewDef.type,
            icon: viewDef.icon,
            position: viewDef.position,
            visibility: 'WORKSPACE',
          },
        },
      );
      report.views.created.push({ name: viewDef.name, id: data.createCoreView.id });
      views = await fetchViews(client, opportunity.id);
      view = views.find((item) => item.id === data.createCoreView.id);
    } else if (view.name !== viewDef.name || view.position !== viewDef.position) {
      await client.metadata(
        `mutation UpdateView($id: String!, $input: UpdateViewInput!) {
          updateCoreView(id: $id, input: $input) { id name }
        }`,
        { id: view.id, input: { name: viewDef.name, icon: viewDef.icon, position: viewDef.position, visibility: 'WORKSPACE' } },
      );
      report.views.updated.push({ from: view.name, to: viewDef.name, id: view.id });
      views = await fetchViews(client, opportunity.id);
      view = views.find((item) => item.id === view.id);
    }

    await ensureBaseViewConfiguration(client, view, fieldByName, report);
    for (const [fieldName, operand, value] of viewDef.filters) {
      await ensureViewFilter(client, view, fieldByName, fieldName, operand, value, report);
    }
  }
}

async function ensureTrackingFields(client, snapshot, report, apply) {
  const existing = snapshot.fieldByName;
  for (const fieldDef of TRACKING_FIELDS) {
    const current = existing.get(fieldDef.name);
    if (current) {
      report.fields.reused.push({ name: fieldDef.name, id: current.id, type: current.type });
      if (current.type !== fieldDef.type) {
        report.fields.typeMismatches.push({ name: fieldDef.name, expected: fieldDef.type, actual: current.type });
      }
      continue;
    }
    if (!apply) {
      report.fields.planned.push({ name: fieldDef.name, type: fieldDef.type });
      continue;
    }
    const created = await createField(client, snapshot.opportunity.id, fieldDef);
    report.fields.created.push(created);
  }
}

async function initializeIaStages(client, opportunities, report, apply) {
  const ia = campaignOpportunities(opportunities);
  const needsInit = ia.filter((opportunity) => !opportunity.iaMujeresFunnelStage);
  report.initialization = {
    campaignOpportunities: ia.length,
    alreadyInitialized: ia.length - needsInit.length,
    toInitialize: needsInit.length,
    updated: 0,
    mode: apply ? 'apply' : 'dry-run',
  };
  if (!apply) return;

  for (const opportunity of needsInit) {
    await updateOpportunity(client, opportunity.id, {
      iaMujeresFunnelStage: 'NOT_SENT',
      outreachStatus: opportunity.outreachStatus || 'pending_first_email',
    });
    report.initialization.updated += 1;
  }
}

async function updateOpportunity(client, id, data) {
  const response = await client.gql(
    `mutation UpdateOpportunity($id: UUID!, $data: OpportunityUpdateInput!) {
      updateOpportunity(id: $id, data: $data) { id name }
    }`,
    { id, data },
  );
  return response.updateOpportunity;
}

async function updateTask(client, id, data) {
  const response = await client.gql(
    `mutation UpdateTask($id: UUID!, $data: TaskUpdateInput!) {
      updateTask(id: $id, data: $data) {
        id
        title
        status
        assignee { id userEmail name { firstName lastName } }
      }
    }`,
    { id, data },
  );
  return response.updateTask;
}

async function createNote(client, { title, markdown, opportunityId, personId, companyId }, apply) {
  if (!apply) return { planned: true, title, opportunityId };
  const note = await client.rest('/notes', {
    method: 'POST',
    body: JSON.stringify({ title, bodyV2: { markdown, blocknote: null } }),
  });
  const noteId = note.data?.createNote?.id;
  if (!noteId) throw new Error(`Note created but id missing: ${JSON.stringify(note).slice(0, 500)}`);
  await linkNote(client, noteId, { opportunityId, personId, companyId });
  return { id: noteId, title };
}

async function createTask(client, { title, markdown, dueAt, opportunityId, personId, companyId, assigneeId = RAUL_ARTILES_WORKSPACE_MEMBER_ID }, apply) {
  if (!apply) return { planned: true, title, opportunityId, assigneeId };
  const payload = { title, status: 'TODO', assigneeId, bodyV2: { markdown, blocknote: null } };
  if (dueAt) payload.dueAt = dueAt;
  const task = await client.rest('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const taskId = task.data?.createTask?.id;
  if (!taskId) throw new Error(`Task created but id missing: ${JSON.stringify(task).slice(0, 500)}`);
  await linkTask(client, taskId, { opportunityId, personId, companyId });
  return { id: taskId, title, dueAt, assigneeId };
}

async function linkNote(client, noteId, { opportunityId, personId, companyId }) {
  const targets = [
    ['targetOpportunityId', opportunityId],
    ['targetPersonId', personId],
    ['targetCompanyId', companyId],
  ].filter(([, id]) => id);
  for (const [key, id] of targets) {
    await client.rest('/noteTargets', {
      method: 'POST',
      body: JSON.stringify({ noteId, [key]: id }),
    });
  }
}

async function linkTask(client, taskId, { opportunityId, personId, companyId }) {
  const targets = [
    ['targetOpportunityId', opportunityId],
    ['targetPersonId', personId],
    ['targetCompanyId', companyId],
  ].filter(([, id]) => id);
  for (const [key, id] of targets) {
    await client.rest('/taskTargets', {
      method: 'POST',
      body: JSON.stringify({ taskId, [key]: id }),
    });
  }
}

async function fetchIaMujeresTasks(client) {
  const data = await client.gql(
    `query IaMujeresTasks($filter: TaskFilterInput!) {
      tasks(first: 200, filter: $filter) {
        edges {
          node {
            id
            title
            status
            dueAt
            assignee { id userEmail name { firstName lastName } }
            taskTargets {
              edges {
                node {
                  targetOpportunity {
                    id
                    name
                    iaMujeresFunnelStage
                    outreachStatus
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { filter: { title: { ilike: '%[IA Mujeres]%' } } },
  );
  return data.tasks.edges.map((edge) => edge.node);
}

function taskOpportunityIds(task) {
  return (task.taskTargets?.edges ?? [])
    .map((edge) => edge.node?.targetOpportunity?.id)
    .filter(Boolean);
}

function taskOpportunityStages(task) {
  return (task.taskTargets?.edges ?? [])
    .map((edge) => edge.node?.targetOpportunity?.iaMujeresFunnelStage)
    .filter(Boolean);
}

function matchingOpenTasksForOpportunity(tasks, opportunityId, title) {
  return tasks.filter((task) =>
    task.title === title &&
    task.status !== 'DONE' &&
    taskOpportunityIds(task).includes(opportunityId),
  );
}

async function completeTasks(client, tasks, apply) {
  const changed = [];
  for (const task of tasks) {
    const updateData = { status: 'DONE' };
    if (task.assignee?.id !== RAUL_ARTILES_WORKSPACE_MEMBER_ID) {
      updateData.assigneeId = RAUL_ARTILES_WORKSPACE_MEMBER_ID;
    }
    if (apply) await updateTask(client, task.id, updateData);
    changed.push({
      id: task.id,
      title: task.title,
      previousStatus: task.status,
      previousAssigneeId: task.assignee?.id ?? null,
      updateData,
    });
  }
  return changed;
}

async function modeSetupCrm(client, args) {
  const report = {
    date: TODAY,
    mode: args.apply ? 'apply' : 'dry-run',
    fields: { planned: [], reused: [], created: [], typeMismatches: [] },
    views: {
      before: [],
      created: [],
      updated: [],
      fieldsCreated: [],
      filtersCreated: [],
      groupsCreated: [],
      groupsUpdated: [],
      missingFields: [],
      after: [],
    },
    initialization: null,
  };

  let snapshot = await fetchMetadataSnapshot(client);
  let views = await fetchViews(client, snapshot.opportunity.id);
  report.views.before = views.map((view) => ({ id: view.id, name: view.name, type: view.type, position: view.position }));

  await ensureTrackingFields(client, snapshot, report, args.apply);
  if (args.apply && report.fields.created.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    snapshot = await fetchMetadataSnapshot(client);
  }

  if (args.apply) {
    views = await fetchViews(client, snapshot.opportunity.id);
    await ensureCoreView(client, snapshot, views, report);
    views = await fetchViews(client, snapshot.opportunity.id);
    report.views.after = views.map((view) => ({ id: view.id, name: view.name, type: view.type, position: view.position }));
  }

  if (args.initializeStages) {
    const opportunities = await fetchOpportunities(client, args.apply);
    await initializeIaStages(client, opportunities, report, args.apply);
  }

  ensureDir(args.outputDir);
  const suffix = args.apply ? 'apply' : 'dry_run';
  const reportPath = path.join(args.outputDir, `${TODAY}_crm_setup_${suffix}_report.json`);
  writeJson(reportPath, report);
  return { status: 'ok', reportPath, report };
}

async function modeAudit(client, args) {
  const snapshot = await fetchMetadataSnapshot(client);
  const views = await fetchViews(client, snapshot.opportunity.id);
  const fieldById = new Map(snapshot.opportunity.fields.map((field) => [field.id, field]));
  const includeNewFields = snapshot.fieldByName.has('iaMujeresFunnelStage');
  const opportunities = await fetchOpportunities(client, includeNewFields);
  const ia = campaignOpportunities(opportunities);
  const report = {
    date: TODAY,
    campaign: CAMPAIGN_NAME,
    businessLine: BUSINESS_LINE_NAME,
    fields: TRACKING_FIELDS.map((field) => ({
      name: field.name,
      exists: snapshot.fieldByName.has(field.name),
      type: snapshot.fieldByName.get(field.name)?.type ?? null,
    })),
    views: views.map((view) => ({
      id: view.id,
      name: view.name,
      type: view.type,
      position: view.position,
      mainGroupByFieldMetadataId: view.mainGroupByFieldMetadataId,
      filters: view.viewFilters.length,
      fields: view.viewFields.length,
      groups: view.viewGroups.length,
    })),
    viewFilterValidation: validateViewFilters(views, fieldById),
    opportunities: {
      total: opportunities.length,
      campaign: ia.length,
      byStage: countBy(ia, 'stage'),
      byOutreachStatus: countBy(ia, 'outreachStatus'),
      byIaMujeresFunnelStage: includeNewFields ? countBy(ia, 'iaMujeresFunnelStage') : {},
      needsManualReview: ia.filter((opportunity) => opportunity.needsManualReview).length,
      duplicatePossible: ia.filter((opportunity) => opportunity.duplicatePossible).length,
      genericEmail: ia.filter((opportunity) => opportunity.genericEmail).length,
      withGmailThreadId: includeNewFields ? ia.filter((opportunity) => opportunity.gmailThreadId).length : 0,
    },
  };
  ensureDir(args.outputDir);
  const reportPath = path.join(args.outputDir, `${TODAY}_crm_audit.json`);
  writeJson(reportPath, report);
  return { status: 'ok', reportPath, report };
}

async function modeSelectBatch(client, args) {
  const snapshot = await fetchMetadataSnapshot(client);
  const opportunities = await fetchOpportunities(client, snapshot.fieldByName.has('iaMujeresFunnelStage'));
  const events = readEvents(args.eventsPath);
  const plan = selectCandidates({ opportunities, sentRecipients: eventSentRecipients(events), limit: args.limit });
  const outputs = writeBatchPlan(args.outputDir, plan);
  return { status: 'ok', batch_id: plan.batch_id, summary: plan.summary, outputs };
}

async function modePrepareDrafts(args) {
  const plan = readJsonIfExists(batchPlanPath(args.outputDir, args.batchId), null);
  if (!plan) throw new Error(`Batch plan not found: ${batchPlanPath(args.outputDir, args.batchId)}`);
  const metadata = readJsonIfExists(TEMPLATE_METADATA, {});
  const payloads = plan.selected.map((candidate) => {
    const rendered = renderEmail01(candidate);
    return {
      crm_deal_id: candidate.crm_deal_id,
      company_id: candidate.company_id,
      person_id: candidate.person_id,
      recipient_email: candidate.email,
      sender_email: DEFAULT_SENDER,
      subject: rendered.subject,
      template_name: 'email_01',
      attachment_policy: metadata.email_01?.attachmentPolicy ?? 'short_presentation',
      attachment_mime_name: metadata.email_01?.attachmentMimeName,
      html: rendered.html,
      text: rendered.text,
      safeguards: ['payload_only', 'no_gmail_draft_created', 'no_email_sent'],
    };
  });
  const payloadPath = path.join(args.outputDir, `batch_${args.batchId}_draft_payloads.json`);
  const reviewPath = path.join(args.outputDir, `batch_${args.batchId}_draft_review.md`);
  writeJson(payloadPath, { batch_id: args.batchId, generated_at: new Date().toISOString(), payloads });
  fs.writeFileSync(reviewPath, renderDraftReview(args.batchId, payloads));
  return { status: 'ok', payloads: payloads.length, outputs: { payloadPath, reviewPath } };
}

function renderDraftReview(batchId, payloads) {
  const rows = payloads.map((payload, index) =>
    `| ${index + 1} | ${payload.recipient_email} | ${payload.subject} | ${payload.template_name} | ${payload.attachment_policy} |`,
  );
  return `# IA Mujeres Draft Payload Review

Batch ID: \`${batchId}\`

No se ha creado ningún draft Gmail. No se ha enviado ningún email.

| # | Destinatario | Asunto | Template | Adjunto |
|---:|---|---|---|---|
${rows.length ? rows.join('\n') : '| - | - | - | - | - |'}

## Validación pendiente

- Revisar personalización.
- Confirmar autorización humana.
- Crear drafts externos solo con modo dedicado y flags de confirmación.
`;
}

async function modeMarkDraftCreated(client, args) {
  const draftMap = readJsonIfExists(args.draftMap, null);
  if (!draftMap) throw new Error(`Draft map not found: ${args.draftMap}`);
  const entries = Array.isArray(draftMap) ? draftMap : draftMap.drafts;
  if (!Array.isArray(entries)) throw new Error('Draft map must be an array or { drafts: [...] }.');
  const report = { mode: args.apply ? 'apply' : 'dry-run', batch_id: args.batchId, updated: [], planned: [] };
  for (const entry of entries) {
    const required = ['crm_deal_id', 'gmailDraftId'];
    for (const key of required) {
      if (!entry[key]) throw new Error(`Draft map entry missing ${key}: ${JSON.stringify(entry)}`);
    }
    const updateData = {
      gmailDraftId: entry.gmailDraftId,
      iaMujeresFunnelStage: 'DRAFT_CREATED',
      outreachStatus: 'draft_created',
      lastEmailEventAt: new Date().toISOString(),
      lastEmailEventType: 'draft_created',
      activeBatchId: args.batchId,
      lastEmailTemplate: entry.template_name ?? 'email_01',
      lastEmailSubject: entry.subject ?? EMAIL_01_SUBJECT,
    };
    if (entry.gmailMessageId) updateData.gmailMessageId = entry.gmailMessageId;
    if (entry.gmailThreadId) updateData.gmailThreadId = entry.gmailThreadId;
    if (args.apply) await updateOpportunity(client, entry.crm_deal_id, updateData);
    const note = await createNote(client, {
      title: `[IA Mujeres] Draft Email 1 creado`,
      markdown: `Draft Email 1 creado el ${new Date().toISOString()} desde ${DEFAULT_SENDER}.\n\nGmail draft ID: ${entry.gmailDraftId}\n\nPendiente de revisión humana antes de cualquier envío externo.`,
      opportunityId: entry.crm_deal_id,
      personId: entry.person_id,
      companyId: entry.company_id,
    }, args.apply);
    const task = await createTask(client, {
      title: `[IA Mujeres] Revisar draft Email 1`,
      markdown: `Revisar cuerpo, personalización, firma, links y adjunto antes de autorizar envío.\n\nBatch: ${args.batchId}`,
      opportunityId: entry.crm_deal_id,
      personId: entry.person_id,
      companyId: entry.company_id,
    }, args.apply);
    report[args.apply ? 'updated' : 'planned'].push({ crm_deal_id: entry.crm_deal_id, updateData, note, task });
  }
  const reportPath = path.join(args.outputDir, `batch_${args.batchId}_mark_draft_created_report.json`);
  writeJson(reportPath, report);
  return { status: 'ok', reportPath, changed: report.updated.length, planned: report.planned.length };
}

async function modeMarkEmailSent(client, args) {
  const sentMap = readJsonIfExists(args.sentMap, null);
  if (!sentMap) throw new Error(`Sent map not found: ${args.sentMap}`);
  const entries = Array.isArray(sentMap) ? sentMap : sentMap.sent;
  if (!Array.isArray(entries)) throw new Error('Sent map must be an array or { sent: [...] }.');
  const report = { mode: args.apply ? 'apply' : 'dry-run', batch_id: args.batchId, updated: [], planned: [] };
  const currentOpportunities = await fetchOpportunities(client, true);
  const currentById = new Map(currentOpportunities.map((opportunity) => [opportunity.id, opportunity]));
  const existingTasks = await fetchIaMujeresTasks(client);
  for (const entry of entries) {
    const required = ['crm_deal_id', 'gmailMessageId', 'gmailThreadId'];
    for (const key of required) {
      if (!entry[key]) throw new Error(`Sent map entry missing ${key}: ${JSON.stringify(entry)}`);
    }
    const sentAt = entry.sentAt ?? new Date().toISOString();
    const followUpDueAt = entry.followUpDueAt ?? addDaysIso(sentAt, 10);
    const updateData = {
      gmailMessageId: entry.gmailMessageId,
      gmailThreadId: entry.gmailThreadId,
      iaMujeresFunnelStage: 'EMAIL_1_SENT',
      outreachStatus: 'sent_first_email',
      firstEmailSentAt: entry.firstEmailSentAt ?? sentAt,
      lastEmailSentAt: sentAt,
      followUpDueAt,
      lastEmailEventAt: sentAt,
      lastEmailEventType: 'email_sent',
      activeBatchId: args.batchId,
      lastEmailTemplate: entry.template_name ?? 'email_01',
      lastEmailSubject: entry.subject ?? EMAIL_01_SUBJECT,
    };
    const currentOpportunity = currentById.get(entry.crm_deal_id);
    const alreadyRecorded =
      currentOpportunity?.iaMujeresFunnelStage === 'EMAIL_1_SENT' &&
      currentOpportunity?.gmailMessageId === entry.gmailMessageId &&
      currentOpportunity?.gmailThreadId === entry.gmailThreadId;
    const closedPreviousTasks = await completeTasks(
      client,
      matchingOpenTasksForOpportunity(existingTasks, entry.crm_deal_id, TASK_REVIEW_DRAFT_EMAIL_1),
      args.apply,
    );
    const existingFollowUpTasks = matchingOpenTasksForOpportunity(existingTasks, entry.crm_deal_id, TASK_REVIEW_FOLLOW_UP_1);
    if (alreadyRecorded) {
      const task = existingFollowUpTasks[0]
        ? { reused: true, id: existingFollowUpTasks[0].id, title: existingFollowUpTasks[0].title }
        : await createTask(client, {
            title: `[IA Mujeres] Revisar respuesta / preparar Follow-up 1`,
            markdown: `Revisar si hubo respuesta y, si no la hubo, preparar Follow-up 1.\n\nThread: ${entry.gmailThreadId}\nBatch: ${args.batchId}`,
            dueAt: currentOpportunity.followUpDueAt ?? followUpDueAt,
            opportunityId: entry.crm_deal_id,
            personId: entry.person_id,
            companyId: entry.company_id,
          }, args.apply);
      report[args.apply ? 'updated' : 'planned'].push({
        crm_deal_id: entry.crm_deal_id,
        alreadyRecorded: true,
        updateData: null,
        closedPreviousTasks,
        note: { skipped: true, reason: 'email_sent_already_recorded' },
        task,
      });
      continue;
    }
    if (args.apply) await updateOpportunity(client, entry.crm_deal_id, updateData);
    const note = await createNote(client, {
      title: `[IA Mujeres] Email 1 enviado`,
      markdown: `Email 1 enviado el ${sentAt} desde ${entry.sender_email ?? DEFAULT_SENDER}.\n\nAsunto: ${entry.subject ?? EMAIL_01_SUBJECT}\nGmail message ID: ${entry.gmailMessageId}\nGmail thread ID: ${entry.gmailThreadId}`,
      opportunityId: entry.crm_deal_id,
      personId: entry.person_id,
      companyId: entry.company_id,
    }, args.apply);
    const task = existingFollowUpTasks[0]
      ? { reused: true, id: existingFollowUpTasks[0].id, title: existingFollowUpTasks[0].title }
      : await createTask(client, {
          title: `[IA Mujeres] Revisar respuesta / preparar Follow-up 1`,
          markdown: `Revisar si hubo respuesta y, si no la hubo, preparar Follow-up 1.\n\nThread: ${entry.gmailThreadId}\nBatch: ${args.batchId}`,
          dueAt: followUpDueAt,
          opportunityId: entry.crm_deal_id,
          personId: entry.person_id,
          companyId: entry.company_id,
        }, args.apply);
    report[args.apply ? 'updated' : 'planned'].push({ crm_deal_id: entry.crm_deal_id, updateData, closedPreviousTasks, note, task });
  }
  const reportPath = path.join(args.outputDir, `batch_${args.batchId}_mark_email_sent_report.json`);
  writeJson(reportPath, report);
  return { status: 'ok', reportPath, changed: report.updated.length, planned: report.planned.length };
}

async function modeSyncFromEvents(client, args, eventType) {
  const snapshot = await fetchMetadataSnapshot(client);
  const opportunities = await fetchOpportunities(client, snapshot.fieldByName.has('iaMujeresFunnelStage'));
  const byThread = new Map(campaignOpportunities(opportunities).filter((opportunity) => opportunity.gmailThreadId).map((opportunity) => [opportunity.gmailThreadId, opportunity]));
  const events = readEvents(args.eventsPath).filter((event) => event.campaign_name === CAMPAIGN_NAME);
  const relevant = events.filter((event) => event.event_type === eventType);
  const report = { mode: args.apply ? 'apply' : 'dry-run', eventType, matched: [], unmatched: [] };
  const existingTasks = await fetchIaMujeresTasks(client);
  for (const event of relevant) {
    const opportunity = byThread.get(event.thread_id);
    if (!opportunity) {
      report.unmatched.push({ event_id: event.event_id, thread_id: event.thread_id });
      continue;
    }
    const isReply = eventType === 'reply_detected';
    const updateData = isReply
      ? {
          iaMujeresFunnelStage: 'REPLY_RECEIVED',
          outreachStatus: 'replied',
          lastReplyAt: event.occurred_at,
          lastEmailEventAt: event.occurred_at,
          lastEmailEventType: 'reply_detected',
          stage: 'CONTACTED',
        }
      : {
          iaMujeresFunnelStage: 'WRONG_CONTACT_MANUAL_REVIEW',
          outreachStatus: 'bounce_detected',
          lastEmailEventAt: event.occurred_at,
          lastEmailEventType: 'bounce_detected',
        };
    const taskTitle = isReply
      ? `[IA Mujeres] Responder y valorar reunión`
      : `[IA Mujeres] Revisar bounce / contacto incorrecto`;
    const noteTitle = isReply
      ? `[IA Mujeres] Respuesta detectada`
      : `[IA Mujeres] Bounce detectado`;
    const closedPreviousTasks = await completeTasks(
      client,
      [
        ...matchingOpenTasksForOpportunity(existingTasks, opportunity.id, TASK_REVIEW_FOLLOW_UP_1),
        ...matchingOpenTasksForOpportunity(existingTasks, opportunity.id, TASK_REVIEW_DRAFT_EMAIL_1),
      ],
      args.apply,
    );
    const existingNextTasks = matchingOpenTasksForOpportunity(existingTasks, opportunity.id, taskTitle);
    const alreadyRecorded =
      opportunity.lastEmailEventType === eventType &&
      (
        (isReply && opportunity.iaMujeresFunnelStage === 'REPLY_RECEIVED') ||
        (!isReply && opportunity.iaMujeresFunnelStage === 'WRONG_CONTACT_MANUAL_REVIEW')
      );
    if (alreadyRecorded) {
      const task = existingNextTasks[0]
        ? { reused: true, id: existingNextTasks[0].id, title: existingNextTasks[0].title }
        : await createTask(client, {
            title: taskTitle,
            markdown: `Revisar evento ${eventType} y decidir siguiente acción comercial.\n\nThread: ${event.thread_id}`,
            opportunityId: opportunity.id,
            personId: opportunity.pointOfContact?.id,
            companyId: opportunity.company?.id,
          }, args.apply);
      report.matched.push({
        crm_deal_id: opportunity.id,
        event_id: event.event_id,
        alreadyRecorded: true,
        updateData: null,
        closedPreviousTasks,
        note: { skipped: true, reason: `${eventType}_already_recorded` },
        task,
      });
      continue;
    }
    if (args.apply) await updateOpportunity(client, opportunity.id, updateData);
    const note = await createNote(client, {
      title: noteTitle,
      markdown: `Evento ${eventType} detectado el ${event.occurred_at}.\n\nThread: ${event.thread_id}\nMessage: ${event.message_id ?? 'n/a'}`,
      opportunityId: opportunity.id,
      personId: opportunity.pointOfContact?.id,
      companyId: opportunity.company?.id,
    }, args.apply);
    const task = existingNextTasks[0]
      ? { reused: true, id: existingNextTasks[0].id, title: existingNextTasks[0].title }
      : await createTask(client, {
          title: taskTitle,
          markdown: `Revisar evento ${eventType} y decidir siguiente acción comercial.\n\nThread: ${event.thread_id}`,
          opportunityId: opportunity.id,
          personId: opportunity.pointOfContact?.id,
          companyId: opportunity.company?.id,
        }, args.apply);
    report.matched.push({ crm_deal_id: opportunity.id, event_id: event.event_id, updateData, closedPreviousTasks, note, task });
  }
  const reportPath = path.join(args.outputDir, `${TODAY}_${eventType}_sync_report.json`);
  writeJson(reportPath, report);
  return { status: 'ok', reportPath, matched: report.matched.length, unmatched: report.unmatched.length };
}

async function modePrepareFollowups(client, args) {
  const snapshot = await fetchMetadataSnapshot(client);
  const opportunities = await fetchOpportunities(client, snapshot.fieldByName.has('iaMujeresFunnelStage'));
  const now = Date.now();
  const due = campaignOpportunities(opportunities)
    .filter((opportunity) =>
      ['EMAIL_1_SENT', 'NO_REPLY', 'FOLLOW_UP_1_PENDING'].includes(opportunity.iaMujeresFunnelStage) &&
      opportunity.followUpDueAt &&
      new Date(opportunity.followUpDueAt).getTime() <= now &&
      !opportunity.lastReplyAt,
    )
    .slice(0, args.limit);
  const report = {
    mode: 'dry-run',
    generated_at: new Date().toISOString(),
    selected: due.map((opportunity) => ({
      crm_deal_id: opportunity.id,
      name: opportunity.name,
      email: primaryEmail(opportunity),
      iaMujeresFunnelStage: opportunity.iaMujeresFunnelStage,
      followUpDueAt: opportunity.followUpDueAt,
    })),
  };
  const reportPath = path.join(args.outputDir, `${TODAY}_followup_candidates.json`);
  writeJson(reportPath, report);
  return { status: 'ok', reportPath, selected: report.selected.length };
}

async function modeReconcileTasks(client, args) {
  const tasks = await fetchIaMujeresTasks(client);
  const advancedStages = new Set([
    'EMAIL_1_SENT',
    'EMAIL_1_RECEIVED_SIGNAL',
    'NO_REPLY',
    'FOLLOW_UP_1_PENDING',
    'FOLLOW_UP_1_DRAFTED',
    'FOLLOW_UP_1_SENT',
    'FOLLOW_UP_2_PENDING',
    'FOLLOW_UP_2_DRAFTED',
    'FOLLOW_UP_2_SENT',
    'NURTURING',
    'REPLY_RECEIVED',
    'MEETING_PROPOSED',
    'MEETING_SCHEDULED',
    'MEETING_DONE',
    'NOT_INTERESTED',
    'WRONG_CONTACT_MANUAL_REVIEW',
  ]);
  const report = {
    mode: args.apply ? 'apply' : 'dry-run',
    generated_at: new Date().toISOString(),
    assignee: {
      id: RAUL_ARTILES_WORKSPACE_MEMBER_ID,
      email: RAUL_ARTILES_EMAIL,
      name: 'Raúl Artiles',
    },
    inspected: tasks.length,
    updated: [],
    planned: [],
  };

  for (const task of tasks) {
    const updateData = {};
    const stages = taskOpportunityStages(task);
    const shouldCloseDraftReview =
      task.title === TASK_REVIEW_DRAFT_EMAIL_1 &&
      task.status !== 'DONE' &&
      stages.some((stage) => advancedStages.has(stage));

    if (task.assignee?.id !== RAUL_ARTILES_WORKSPACE_MEMBER_ID) {
      updateData.assigneeId = RAUL_ARTILES_WORKSPACE_MEMBER_ID;
    }
    if (shouldCloseDraftReview) {
      updateData.status = 'DONE';
    }

    if (!Object.keys(updateData).length) continue;
    if (args.apply) await updateTask(client, task.id, updateData);
    report[args.apply ? 'updated' : 'planned'].push({
      id: task.id,
      title: task.title,
      previousStatus: task.status,
      previousAssigneeId: task.assignee?.id ?? null,
      opportunityIds: taskOpportunityIds(task),
      opportunityStages: stages,
      updateData,
    });
  }

  const modeSuffix = args.apply ? 'apply' : 'dry_run';
  const reportPath = path.join(args.outputDir, `${TODAY}_task_reconciliation_${modeSuffix}_report.json`);
  writeJson(reportPath, report);
  return {
    status: 'ok',
    reportPath,
    inspected: report.inspected,
    changed: report.updated.length,
    planned: report.planned.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  ensureDir(args.outputDir);
  const client = new TwentyClient(readCredentials());
  let result;
  if (args.mode === 'setup-crm') result = await modeSetupCrm(client, args);
  else if (args.mode === 'audit') result = await modeAudit(client, args);
  else if (args.mode === 'select-batch') result = await modeSelectBatch(client, args);
  else if (args.mode === 'prepare-drafts') result = await modePrepareDrafts(args);
  else if (args.mode === 'mark-draft-created') result = await modeMarkDraftCreated(client, args);
  else if (args.mode === 'mark-email-sent') result = await modeMarkEmailSent(client, args);
  else if (args.mode === 'sync-replies') result = await modeSyncFromEvents(client, args, 'reply_detected');
  else if (args.mode === 'sync-bounces') result = await modeSyncFromEvents(client, args, 'bounce_detected');
  else if (args.mode === 'prepare-followups') result = await modePrepareFollowups(client, args);
  else if (args.mode === 'reconcile-tasks') result = await modeReconcileTasks(client, args);
  else throw new Error(`Unhandled mode: ${args.mode}`);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

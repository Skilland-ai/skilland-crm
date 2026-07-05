#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { readTwentyCredentials } from './crm_manual_update_crew/twenty-client.mjs';

const BUSINESS_LINE_NAME = 'SkilLand IA Mujeres';
const CAMPAIGN_NAME = 'IA Mujeres 2026';
const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');
const DEFAULT_EVENTS_PATH = path.join(DEFAULT_OUTPUT_DIR, 'events.ndjson');
const DEFAULT_LIMIT = 20;
const SUB_BATCH_SIZE = 5;

function parseArgs(argv) {
  const args = {
    limit: DEFAULT_LIMIT,
    outputDir: DEFAULT_OUTPUT_DIR,
    eventsPath: DEFAULT_EVENTS_PATH,
    organizationType: undefined,
    batchLabel: undefined,
  };

  for (const arg of argv) {
    if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    else if (arg.startsWith('--events=')) args.eventsPath = path.resolve(arg.slice('--events='.length));
    else if (arg.startsWith('--organization-type=')) args.organizationType = arg.slice('--organization-type='.length);
    else if (arg.startsWith('--batch-label=')) args.batchLabel = arg.slice('--batch-label='.length);
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 50) {
    throw new Error('--limit must be an integer between 1 and 50.');
  }

  return args;
}

function printHelp() {
  console.log(`IA Mujeres authorized bulk planner

Usage:
  node scripts/ia_mujeres_authorized_bulk_batch.mjs --limit=20
  node scripts/ia_mujeres_authorized_bulk_batch.mjs --limit=10 --organization-type=ayuntamiento --batch-label=ayuntamientos-email01

This planner creates local batch_<id>_plan.json files only. It does not create
Gmail drafts, send email, or mutate CRM. It is designed for an already-approved
bulk send, split into safe sub-batches of five.
`);
}

class TwentyClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async gql(query, variables = {}) {
    const response = await fetch(`${this.baseUrl}/graphql`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok || json.errors?.length) {
      throw new Error(`Twenty API error ${response.status}: ${JSON.stringify(json).slice(0, 900)}`);
    }
    return json.data;
  }
}

async function fetchOpportunities(client) {
  const data = await client.gql(`
    query IaMujeresAuthorizedBulkCandidates {
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
            iaMujeresFunnelStage
            gmailDraftId
            gmailMessageId
            gmailThreadId
            lastEmailEventAt
            lastEmailEventType
            activeBatchId
            lastEmailTemplate
            lastEmailSubject
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

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function slug(value) {
  return normalize(value)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'batch';
}

function organizationTypeMatches(candidate, expectedType) {
  if (!expectedType) return true;
  return normalize(candidate.organization_type) === normalize(expectedType);
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

function primaryEmail(opportunity) {
  return (
    opportunity.pointOfContact?.emails?.primaryEmail ||
    opportunity.company?.emailMain ||
    ''
  ).trim().toLowerCase();
}

function isEmailLike(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function personName(person) {
  return [person?.name?.firstName, person?.name?.lastName].filter(Boolean).join(' ').trim();
}

function isCampaignOpportunity(opportunity) {
  return opportunity.businessLineName === BUSINESS_LINE_NAME || opportunity.campaignName === CAMPAIGN_NAME;
}

function hardExclusionReasons(opportunity) {
  const entityHaystack = normalize([
    opportunity.name,
    opportunity.company?.name,
    opportunity.municipality,
    opportunity.organizationType,
    opportunity.island,
  ].filter(Boolean).join(' '));
  const reasons = [];
  if (entityHaystack.includes('santa cruz')) reasons.push('hard_excluded_santa_cruz');
  if (entityHaystack.includes('cabildo') && entityHaystack.includes('tenerife')) {
    reasons.push('hard_excluded_cabildo_tenerife');
  }
  return reasons;
}

function toCandidate(opportunity, sentRecipients) {
  const email = primaryEmail(opportunity);
  const exclusionReasons = [];
  const warnings = [];
  const hardReasons = hardExclusionReasons(opportunity);

  if (!isCampaignOpportunity(opportunity)) exclusionReasons.push('not_ia_mujeres_campaign');
  if (!['pending_first_email', 'not_sent', 'draft_created', null, undefined, ''].includes(opportunity.outreachStatus)) {
    exclusionReasons.push('not_pending_first_email');
  }
  if (opportunity.iaMujeresFunnelStage && !['NOT_SENT', 'DRAFT_CREATED'].includes(opportunity.iaMujeresFunnelStage)) {
    exclusionReasons.push('ia_stage_not_available_for_email_1');
  }
  if (!email) exclusionReasons.push('missing_email');
  if (email && !isEmailLike(email)) exclusionReasons.push('invalid_email');
  if (opportunity.highConfidence !== true) exclusionReasons.push('not_high_confidence');
  if (opportunity.firstEmailSentAt || opportunity.lastEmailSentAt) exclusionReasons.push('already_has_sent_timestamp');
  if (opportunity.lastReplyAt) exclusionReasons.push('already_has_reply_timestamp');
  if (opportunity.gmailThreadId || opportunity.gmailMessageId) exclusionReasons.push('already_has_gmail_ids');
  if (email && sentRecipients.has(email)) exclusionReasons.push('already_sent_in_events');
  exclusionReasons.push(...hardReasons);

  if (opportunity.genericEmail) warnings.push('generic_email_authorized_by_user');
  if (opportunity.needsManualReview) warnings.push('manual_review_flag_authorized_by_user');
  if (opportunity.duplicatePossible) warnings.push('duplicate_possible_authorized_by_user');

  const qualityScore =
    (opportunity.genericEmail ? 10 : 0) +
    (opportunity.needsManualReview ? 20 : 0) +
    (opportunity.duplicatePossible ? 40 : 0);

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
    authorized_bulk_quality_score: qualityScore,
    authorized_bulk_warnings: warnings,
    eligible: exclusionReasons.length === 0,
    exclusion_reasons: exclusionReasons,
  };
}

function renderReview(plan) {
  const selectedRows = plan.selected.map((candidate, index) =>
    `| ${index + 1} | ${candidate.deal_name} | ${candidate.company_name ?? ''} | ${candidate.person_name ?? ''} | ${candidate.email} | ${candidate.organization_type ?? ''} | ${candidate.authorized_bulk_warnings.join(', ') || 'limpio'} |`,
  );
  const excludedRows = plan.excluded.slice(0, 50).map((candidate) =>
    `| ${candidate.deal_name} | ${candidate.email || '-'} | ${candidate.exclusion_reasons.join(', ')} |`,
  );

  return `# IA Mujeres Authorized Bulk Batch Review

Batch ID: \`${plan.batch_id}\`

Modo: \`${plan.mode}\`

## Resumen

| Métrica | Valor |
|---|---:|
| Opportunities CRM vistas | ${plan.summary.crm_opportunities_seen} |
| Opportunities IA Mujeres vistas | ${plan.summary.campaign_opportunities_seen} |
| Elegibles ampliadas | ${plan.summary.eligible_count} |
| Seleccionadas | ${plan.summary.selected_count} |
| Excluidas | ${plan.summary.excluded_count} |

## Selección

| # | Deal | Company | Contacto | Email | Tipo | Avisos |
|---:|---|---|---|---|---|---|
${selectedRows.length ? selectedRows.join('\n') : '| - | - | - | - | - | - | - |'}

## Excluidas principales

| Deal | Email | Motivos |
|---|---|---|
${excludedRows.length ? excludedRows.join('\n') : '| - | - | - |'}

## Safeguards

${plan.safeguards.map((item) => `- ${item}`).join('\n')}
`;
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeBatchPlan(outputDir, plan) {
  const jsonPath = path.join(outputDir, `batch_${plan.batch_id}_plan.json`);
  const reviewPath = path.join(outputDir, `batch_${plan.batch_id}_review.md`);
  writeJson(jsonPath, plan);
  fs.writeFileSync(reviewPath, renderReview(plan));
  return { jsonPath, reviewPath };
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function renderMasterReport(report) {
  const rows = report.sub_batches.flatMap((batch) =>
    batch.selected.map((candidate, index) =>
      `| ${batch.batch_id} | ${index + 1} | ${candidate.deal_name} | ${candidate.person_name ?? ''} | ${candidate.email} | ${candidate.authorized_bulk_warnings.join(', ') || 'limpio'} |`,
    ),
  );
  const hardRows = report.hard_excluded.map((candidate) =>
    `| ${candidate.deal_name} | ${candidate.email || '-'} | ${candidate.exclusion_reasons.join(', ')} |`,
  );

  return `# IA Mujeres Authorized Bulk Plan

Generado: ${report.generated_at}
Scope: ${report.scope.organization_type ? `organizationType=${report.scope.organization_type}` : 'all'}

## Resumen

| Métrica | Valor |
|---|---:|
| Solicitadas | ${report.requested_limit} |
| Seleccionadas | ${report.selected_count} |
| Sublotes | ${report.sub_batches.length} |
| Excluidas por Santa Cruz / Cabildo Tenerife | ${report.hard_excluded.length} |

## Selección

| Batch | # | Deal | Contacto | Email | Avisos |
|---|---:|---|---|---|---|
${rows.length ? rows.join('\n') : '| - | - | - | - | - | - |'}

## Exclusiones duras

| Deal | Email | Motivos |
|---|---|---|
${hardRows.length ? hardRows.join('\n') : '| - | - | - |'}

## Decisión operativa

- El usuario autorizó una tanda real de ${report.requested_limit}.
- Filtro operativo aplicado: ${report.scope.organization_type ? `solo organizationType=${report.scope.organization_type}` : 'sin filtro de organizationType'}.
- No se selecciona ningún deal con Santa Cruz.
- No se selecciona ningún deal de Cabildo de Tenerife.
- Los sublotes quedan en archivos estándar \`batch_<id>_plan.json\` para reutilizar los runners con límite de 5.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(args.outputDir, { recursive: true });

  const client = new TwentyClient(readTwentyCredentials());
  const opportunities = await fetchOpportunities(client);
  const events = readEvents(args.eventsPath);
  const sentRecipients = eventSentRecipients(events);
  const scopeSlug = args.organizationType ? `org-${slug(args.organizationType)}` : 'all';
  const batchLabel = slug(args.batchLabel ?? `${scopeSlug}-bulk${args.limit}`);
  const campaignCandidates = opportunities
    .map((opportunity, index) => ({ candidate: toCandidate(opportunity, sentRecipients), index }))
    .filter(({ candidate }) => candidate.exclusion_reasons[0] !== 'not_ia_mujeres_campaign')
    .map(({ candidate, index }) => {
      const scopedCandidate = { ...candidate, exclusion_reasons: [...candidate.exclusion_reasons] };
      if (!organizationTypeMatches(scopedCandidate, args.organizationType)) {
        scopedCandidate.exclusion_reasons.push('organization_type_mismatch');
        scopedCandidate.eligible = false;
      }
      return { candidate: scopedCandidate, index };
    });

  const eligible = campaignCandidates
    .filter(({ candidate }) => candidate.eligible)
    .sort((a, b) => (
      a.candidate.authorized_bulk_quality_score - b.candidate.authorized_bulk_quality_score ||
      a.index - b.index
    ))
    .slice(0, args.limit)
    .map(({ candidate }) => candidate);

  const excluded = campaignCandidates
    .filter(({ candidate }) => !candidate.eligible)
    .map(({ candidate }) => candidate);

  if (eligible.length < args.limit) {
    throw new Error(`Only ${eligible.length} eligible opportunities available after hard exclusions; requested ${args.limit}.`);
  }

  const generatedAt = new Date().toISOString();
  const timestamp = generatedAt.replace(/[:.]/g, '-');
  const baseBatchId = `${timestamp}_${batchLabel}`;
  const hardExcluded = excluded.filter((candidate) =>
    candidate.exclusion_reasons.includes('hard_excluded_santa_cruz') ||
    candidate.exclusion_reasons.includes('hard_excluded_cabildo_tenerife')
  );

  const subBatches = chunk(eligible, SUB_BATCH_SIZE).map((selected, index) => {
    const batchId = `${baseBatchId}-${String(index + 1).padStart(2, '0')}`;
    const selectedIds = new Set(selected.map((candidate) => candidate.crm_deal_id));
    const batchExcluded = excluded.filter((candidate) => !selectedIds.has(candidate.crm_deal_id));
    const plan = {
      schema_version: '1.0',
      batch_id: batchId,
      generated_at: generatedAt,
      mode: 'authorized-bulk-plan',
      campaign_name: CAMPAIGN_NAME,
      business_line: BUSINESS_LINE_NAME,
      limit: selected.length,
      safeguards: [
        'Planning only; no Gmail draft creation.',
        'Planning only; no external send.',
        'Sub-batch size stays at 5 for the existing Gmail safeguards.',
        'User explicitly authorized this real Email 1 batch.',
        ...(args.organizationType ? [`Scope filter: organizationType=${args.organizationType}.`] : []),
        'Hard excludes: Santa Cruz and Cabildo de Tenerife.',
        'Generic/manual/duplicate flags are not hard blockers in this authorized bulk run; they are retained as warnings.',
      ],
      summary: {
        crm_opportunities_seen: opportunities.length,
        campaign_opportunities_seen: campaignCandidates.length,
        eligible_count: eligible.length,
        selected_count: selected.length,
        excluded_count: batchExcluded.length,
      },
      selected,
      excluded: batchExcluded,
    };
    const outputs = writeBatchPlan(args.outputDir, plan);
    return { batch_id: batchId, selected, outputs };
  });

  const report = {
    schema_version: '1.0',
    generated_at: generatedAt,
    requested_limit: args.limit,
    selected_count: eligible.length,
    campaign_opportunities_seen: campaignCandidates.length,
    scope: {
      organization_type: args.organizationType ?? null,
      batch_label: batchLabel,
    },
    hard_excluded: hardExcluded,
    sub_batches: subBatches,
  };
  const reportBase = `${timestamp}_${batchLabel}_authorized_bulk_plan`;
  const jsonPath = path.join(args.outputDir, `${reportBase}.json`);
  const mdPath = path.join(args.outputDir, `${reportBase}.md`);
  writeJson(jsonPath, report);
  fs.writeFileSync(mdPath, renderMasterReport(report));

  console.log(JSON.stringify({
    status: 'ok',
    selected: eligible.length,
    sub_batches: subBatches.map((batch) => batch.batch_id),
    outputs: { jsonPath, mdPath },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const BUSINESS_LINE_NAME = 'SkilLand IA Mujeres';
const CAMPAIGN_NAME = 'IA Mujeres 2026';
const OUTREACH_STATUS = 'pending_first_email';
const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');
const DEFAULT_EVENTS_PATH = path.join(DEFAULT_OUTPUT_DIR, 'events.ndjson');

function parseArgs(argv) {
  const args = {
    prepareNextBatch: false,
    limit: 5,
    outputDir: DEFAULT_OUTPUT_DIR,
    eventsPath: DEFAULT_EVENTS_PATH,
  };

  for (const arg of argv) {
    if (arg === '--prepare-next-batch') args.prepareNextBatch = true;
    else if (arg === '--create-drafts' || arg === '--verify-drafts' || arg === '--send-approved') {
      throw new Error(`${arg} is intentionally not implemented yet. Prepare and review a batch plan first.`);
    } else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice('--limit='.length));
    else if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    else if (arg.startsWith('--events=')) args.eventsPath = path.resolve(arg.slice('--events='.length));
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 5) {
    throw new Error('--limit must be an integer between 1 and 5.');
  }

  if (!args.prepareNextBatch) {
    throw new Error('Use --prepare-next-batch. This runner is dry-run only for now.');
  }

  return args;
}

function printHelp() {
  console.log(`IA Mujeres batch runner

Safe dry-run only.

Usage:
  node scripts/ia_mujeres_batch_runner.mjs --prepare-next-batch --limit=5

Outputs:
  04_outputs/ia_mujeres_crm_execution/batch_<id>_plan.json
  04_outputs/ia_mujeres_crm_execution/batch_<id>_review.md
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

  async gql(query, variables = {}) {
    const response = await fetch(`${this.baseUrl}/graphql`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = await response.json();
    if (json.errors?.length) throw new Error(JSON.stringify(json.errors, null, 2));
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(json).slice(0, 300)}`);
    return json.data;
  }
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

async function fetchOpportunities(client) {
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
            company {
              id
              name
              emailMain
              domainName {
                primaryLinkUrl
              }
            }
            pointOfContact {
              id
              name {
                firstName
                lastName
              }
              emails {
                primaryEmail
                additionalEmails
              }
            }
          }
        }
      }
    }
  `);

  return data.opportunities.edges.map(({ node }) => node);
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

function exclusionReasons(opportunity, sentRecipients) {
  const email = primaryEmail(opportunity);
  const reasons = [];

  if (opportunity.businessLineName !== BUSINESS_LINE_NAME) reasons.push('business_line_mismatch');
  if (opportunity.campaignName !== CAMPAIGN_NAME) reasons.push('campaign_mismatch');
  if (opportunity.outreachStatus !== OUTREACH_STATUS) reasons.push('not_pending_first_email');
  if (!email) reasons.push('missing_email');
  if (email && !isEmailLike(email)) reasons.push('invalid_email');
  if (opportunity.needsManualReview) reasons.push('needs_manual_review');
  if (opportunity.duplicatePossible) reasons.push('duplicate_possible');
  if (opportunity.genericEmail) reasons.push('generic_email');
  if (opportunity.highConfidence !== true) reasons.push('not_high_confidence');
  if (opportunity.firstEmailSentAt || opportunity.lastEmailSentAt) reasons.push('already_has_sent_timestamp');
  if (opportunity.lastReplyAt) reasons.push('already_has_reply_timestamp');
  if (email && sentRecipients.has(email)) reasons.push('already_sent_in_events');

  return reasons;
}

function toCandidate(opportunity, sentRecipients) {
  const email = primaryEmail(opportunity);
  const reasons = exclusionReasons(opportunity, sentRecipients);

  return {
    crm_deal_id: opportunity.id,
    deal_name: opportunity.name,
    company_id: opportunity.company?.id ?? null,
    company_name: opportunity.company?.name ?? null,
    person_id: opportunity.pointOfContact?.id ?? null,
    person_name: personName(opportunity.pointOfContact) || null,
    email,
    organization_type: opportunity.organizationType ?? null,
    department_area: opportunity.departmentArea ?? null,
    island: opportunity.island ?? null,
    municipality: opportunity.municipality ?? null,
    icp_segment: opportunity.icpSegment ?? null,
    quality_flags: opportunity.qualityFlags ?? null,
    outreach_status: opportunity.outreachStatus ?? null,
    high_confidence: opportunity.highConfidence ?? null,
    generic_email: opportunity.genericEmail ?? null,
    needs_manual_review: opportunity.needsManualReview ?? null,
    duplicate_possible: opportunity.duplicatePossible ?? null,
    eligible: reasons.length === 0,
    exclusion_reasons: reasons,
  };
}

function buildBatchPlan({ opportunities, sentRecipients, limit }) {
  const allCampaign = opportunities
    .filter((opportunity) =>
      opportunity.businessLineName === BUSINESS_LINE_NAME ||
      opportunity.campaignName === CAMPAIGN_NAME,
    )
    .map((opportunity) => toCandidate(opportunity, sentRecipients));

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
      'No draft creation in this runner version.',
      'No external send in this runner version.',
      'Limit capped at 5.',
      'Requires pending_first_email, highConfidence=true, no manual review, no duplicate flag, non-generic email.',
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
    `| ${index + 1} | ${candidate.deal_name} | ${candidate.company_name ?? ''} | ${candidate.person_name ?? ''} | ${candidate.email} | ${candidate.organization_type ?? ''} |`,
  );
  const excludedRows = plan.excluded.slice(0, 25).map((candidate) =>
    `| ${candidate.deal_name} | ${candidate.email || '-'} | ${candidate.exclusion_reasons.join(', ')} |`,
  );

  return `# IA Mujeres Batch Review

Batch ID: \`${plan.batch_id}\`

Modo: \`${plan.mode}\`

## Resumen

| Metrica | Valor |
|---|---:|
| Opportunities CRM vistas | ${plan.summary.crm_opportunities_seen} |
| Opportunities IA Mujeres vistas | ${plan.summary.campaign_opportunities_seen} |
| Elegibles | ${plan.summary.eligible_count} |
| Seleccionadas | ${plan.summary.selected_count} |
| Excluidas | ${plan.summary.excluded_count} |

## Seleccion propuesta

| # | Deal | Company | Contacto | Email | Tipo |
|---:|---|---|---|---|---|
${selectedRows.length ? selectedRows.join('\n') : '| - | - | - | - | - | - |'}

## Excluidas principales

| Deal | Email | Motivos |
|---|---|---|
${excludedRows.length ? excludedRows.join('\n') : '| - | - | - |'}

## Safeguards

${plan.safeguards.map((item) => `- ${item}`).join('\n')}

## Siguiente paso

Revisar esta seleccion. La creacion de drafts externos sigue bloqueada hasta cerrar mapeo Gmail ID en CRM y autorizacion humana explicita.
`;
}

function writePlan(outputDir, plan) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `batch_${plan.batch_id}_plan.json`);
  const reviewPath = path.join(outputDir, `batch_${plan.batch_id}_review.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(plan, null, 2));
  fs.writeFileSync(reviewPath, renderReview(plan));
  return { jsonPath, reviewPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const credentials = readCredentials();
  const client = new TwentyClient(credentials);
  const events = readEvents(args.eventsPath);
  const sentRecipients = eventSentRecipients(events);
  const opportunities = await fetchOpportunities(client);
  const plan = buildBatchPlan({ opportunities, sentRecipients, limit: args.limit });
  const outputs = writePlan(args.outputDir, plan);

  console.log(JSON.stringify({
    status: 'ok',
    mode: plan.mode,
    batch_id: plan.batch_id,
    summary: plan.summary,
    outputs,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

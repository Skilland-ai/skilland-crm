#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  readTwentyCredentials,
  TwentyClient,
} from './crm_manual_update_crew/twenty-client.mjs';

const BUSINESS_LINE_NAME = 'SkilLand IA Mujeres';
const CAMPAIGN_NAME = 'IA Mujeres 2026';
const OPPORTUNITY_STAGE = 'POSSIBLE_OPPORTUNITY';
const OUTREACH_STATUS = 'pending_first_email';
const IA_STAGE = 'NOT_SENT';
const OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');

const DEFAULT_TEST_EMAIL = 'sales@reboot.academy';
const SOURCE_TYPE = 'internal_email_01_v3_validation';
const SOURCE_FILE = 'scripts/ia_mujeres_email_01_v3_internal_test.mjs';

let TEST_EMAIL = DEFAULT_TEST_EMAIL;
let TEST_COMPANY_NAME = 'Reboot Academy/Canarias — Test IA Mujeres Email 1 v3';
let TEST_OPPORTUNITY_NAME = 'Reboot Academy/Canarias — IA Mujeres 2026 — Test Email 1 v3';
let TEST_PERSON_FIRST_NAME = 'Equipo';
let TEST_PERSON_LAST_NAME = 'Ventas Reboot';
let TEST_JOB_TITLE = 'Equipo interno de ventas';

function parseArgs(argv) {
  const args = {
    apply: false,
    outputDir: OUTPUT_DIR,
    batchId: undefined,
    recipientEmail: DEFAULT_TEST_EMAIL,
  };

  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    else if (arg.startsWith('--batch-id=')) args.batchId = arg.slice('--batch-id='.length);
    else if (arg.startsWith('--recipient-email=')) args.recipientEmail = arg.slice('--recipient-email='.length).trim().toLowerCase();
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.recipientEmail)) {
    throw new Error(`Invalid --recipient-email: ${args.recipientEmail}`);
  }

  return args;
}

function printHelp() {
  console.log(`IA Mujeres Email 1 v3 internal CRM test

Usage:
  node scripts/ia_mujeres_email_01_v3_internal_test.mjs
  node scripts/ia_mujeres_email_01_v3_internal_test.mjs --apply
  node scripts/ia_mujeres_email_01_v3_internal_test.mjs --recipient-email=direccion@skilland.ai --apply

Creates/reuses an internal IA Mujeres test deal for the configured recipient and
writes a one-record batch plan. It does not create Gmail drafts or send email.
`);
}

function configureRecipient(recipientEmail) {
  TEST_EMAIL = recipientEmail;

  if (recipientEmail === 'sales@reboot.academy') {
    TEST_PERSON_FIRST_NAME = 'Equipo';
    TEST_PERSON_LAST_NAME = 'Ventas Reboot';
    TEST_JOB_TITLE = 'Equipo interno de ventas';
    TEST_COMPANY_NAME = 'Reboot Academy/Canarias — Test IA Mujeres Email 1 v3';
    TEST_OPPORTUNITY_NAME = 'Reboot Academy/Canarias — IA Mujeres 2026 — Test Email 1 v3';
    return;
  }

  if (recipientEmail === 'direccion@skilland.ai') {
    TEST_PERSON_FIRST_NAME = 'Equipo';
    TEST_PERSON_LAST_NAME = 'Dirección Skilland';
    TEST_JOB_TITLE = 'Equipo interno de dirección';
    TEST_COMPANY_NAME = 'Skilland Dirección — Test IA Mujeres Email 1 v3';
    TEST_OPPORTUNITY_NAME = 'Skilland Dirección — IA Mujeres 2026 — Test Email 1 v3';
    return;
  }

  const localPart = recipientEmail.split('@')[0] || 'interno';
  const label = localPart
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
  TEST_PERSON_FIRST_NAME = 'Equipo';
  TEST_PERSON_LAST_NAME = label;
  TEST_JOB_TITLE = `Equipo interno ${label}`;
  TEST_COMPANY_NAME = `${label} — Test IA Mujeres Email 1 v3`;
  TEST_OPPORTUNITY_NAME = `${label} — IA Mujeres 2026 — Test Email 1 v3`;
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function personName(person) {
  return [person?.name?.firstName, person?.name?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
}

function emailsOf(person) {
  return [
    person.emails?.primaryEmail,
    ...(person.emails?.additionalEmails ?? []),
  ].filter(Boolean);
}

async function fetchWorkspaceData(client) {
  const data = await client.gql(`
    query IaMujeresEmail01V3InternalTestData {
      businessLines(first: 100) {
        edges { node { id name } }
      }
      companies(first: 500) {
        edges { node { id name } }
      }
      people(first: 500) {
        edges {
          node {
            id
            name { firstName lastName }
            emails { primaryEmail additionalEmails }
            company { id name }
          }
        }
      }
      opportunities(first: 500) {
        edges {
          node {
            id
            name
            iaMujeresFunnelStage
            outreachStatus
            gmailDraftId
            gmailMessageId
            gmailThreadId
          }
        }
      }
    }
  `);

  return {
    businessLines: data.businessLines.edges.map((edge) => edge.node),
    companies: data.companies.edges.map((edge) => edge.node),
    people: data.people.edges.map((edge) => edge.node),
    opportunities: data.opportunities.edges.map((edge) => edge.node),
  };
}

function companyData() {
  return {
    name: TEST_COMPANY_NAME,
    businessLineName: BUSINESS_LINE_NAME,
    campaignName: CAMPAIGN_NAME,
    organizationType: 'internal_test',
    departmentArea: 'Validación CRM/GWS',
    island: 'Canarias',
    municipality: 'Canarias',
    emailMain: TEST_EMAIL,
    sourceType: SOURCE_TYPE,
    sourceFile: SOURCE_FILE,
    icpSegment: 'internal_test',
    qualityFlags: 'internal_test;email_01_v3;dossier_blue_v2',
    highConfidence: true,
    genericEmail: false,
    needsManualReview: false,
    duplicatePossible: false,
  };
}

function personData(companyId) {
  return {
    name: {
      firstName: TEST_PERSON_FIRST_NAME,
      lastName: TEST_PERSON_LAST_NAME,
    },
    emails: {
      primaryEmail: TEST_EMAIL,
      additionalEmails: [],
    },
    jobTitle: TEST_JOB_TITLE,
    company: companyId
      ? {
          connect: {
            where: {
              id: companyId,
            },
          },
        }
      : undefined,
    businessLineName: BUSINESS_LINE_NAME,
    campaignName: CAMPAIGN_NAME,
    organizationType: 'internal_test',
    departmentArea: 'Validación CRM/GWS',
    island: 'Canarias',
    municipality: 'Canarias',
    sourceType: SOURCE_TYPE,
    sourceFile: SOURCE_FILE,
    icpSegment: 'internal_test',
    qualityFlags: 'internal_test;email_01_v3;dossier_blue_v2',
    highConfidence: true,
    genericEmail: false,
    needsManualReview: false,
    duplicatePossible: false,
    emailType: 'internal_test',
  };
}

function opportunityData({ companyId, personId, businessLineId, batchId }) {
  return {
    name: TEST_OPPORTUNITY_NAME,
    stage: OPPORTUNITY_STAGE,
    company: companyId
      ? {
          connect: {
            where: {
              id: companyId,
            },
          },
        }
      : undefined,
    pointOfContact: personId
      ? {
          connect: {
            where: {
              id: personId,
            },
          },
        }
      : undefined,
    businessLine: businessLineId
      ? {
          connect: {
            where: {
              id: businessLineId,
            },
          },
        }
      : undefined,
    businessLineName: BUSINESS_LINE_NAME,
    campaignName: CAMPAIGN_NAME,
    organizationType: 'internal_test',
    departmentArea: 'Validación CRM/GWS',
    island: 'Canarias',
    municipality: 'Canarias',
    sourceType: SOURCE_TYPE,
    sourceFile: SOURCE_FILE,
    icpSegment: 'internal_test',
    qualityFlags: 'internal_test;email_01_v3;dossier_blue_v2',
    highConfidence: true,
    genericEmail: false,
    needsManualReview: false,
    duplicatePossible: false,
    outreachStatus: OUTREACH_STATUS,
    iaMujeresFunnelStage: IA_STAGE,
    activeBatchId: batchId,
    lastEmailTemplate: 'email_01',
    lastEmailSubject: 'Una preocupación que quería compartir con usted',
  };
}

async function upsertCompany(client, existing, apply) {
  const data = companyData();
  if (!apply) {
    return existing
      ? { action: 'planned_update_existing', id: existing.id, name: existing.name }
      : { action: 'planned_create', id: null, name: data.name };
  }

  if (existing) {
    const response = await client.gql(
      `mutation UpdateCompany($id: UUID!, $data: CompanyUpdateInput!) {
        updateCompany(id: $id, data: $data) { id name }
      }`,
      { id: existing.id, data },
    );
    return { action: 'updated_existing', ...response.updateCompany };
  }

  const response = await client.gql(
    `mutation CreateCompany($data: CompanyCreateInput!) {
      createCompany(data: $data) { id name }
    }`,
    { data },
  );
  return { action: 'created', ...response.createCompany };
}

async function upsertPerson(client, existing, companyId, apply) {
  const data = personData(companyId);
  if (!apply) {
    return existing
      ? { action: 'planned_update_existing', id: existing.id, name: personName(existing) }
      : { action: 'planned_create', id: null, name: `${TEST_PERSON_FIRST_NAME} ${TEST_PERSON_LAST_NAME}` };
  }

  if (existing) {
    const response = await client.gql(
      `mutation UpdatePerson($id: UUID!, $data: PersonUpdateInput!) {
        updatePerson(id: $id, data: $data) { id name { firstName lastName } }
      }`,
      { id: existing.id, data },
    );
    return {
      action: 'updated_existing',
      id: response.updatePerson.id,
      name: personName(response.updatePerson),
    };
  }

  const response = await client.gql(
    `mutation CreatePerson($data: PersonCreateInput!) {
      createPerson(data: $data) { id name { firstName lastName } }
    }`,
    { data },
  );
  return {
    action: 'created',
    id: response.createPerson.id,
    name: personName(response.createPerson),
  };
}

async function upsertOpportunity(client, existing, ids, apply) {
  const data = opportunityData(ids);
  if (!apply) {
    return existing
      ? { action: 'planned_update_existing', id: existing.id, name: existing.name }
      : { action: 'planned_create', id: null, name: data.name };
  }

  if (existing) {
    const response = await client.gql(
      `mutation UpdateOpportunity($id: UUID!, $data: OpportunityUpdateInput!) {
        updateOpportunity(id: $id, data: $data) { id name }
      }`,
      { id: existing.id, data },
    );
    return { action: 'updated_existing', ...response.updateOpportunity };
  }

  const response = await client.gql(
    `mutation CreateOpportunity($data: OpportunityCreateInput!) {
      createOpportunity(data: $data) { id name }
    }`,
    { data },
  );
  return { action: 'created', ...response.createOpportunity };
}

async function createNote(client, { opportunityId, personId, companyId, batchId }, apply) {
  const title = '[IA Mujeres] Experimento interno Email 1 v3';
  const markdown = [
    'Experimento interno para validar Email 1 v3 antes de nuevas tandas reales.',
    '',
    `- Destinatario: ${TEST_EMAIL}`,
    '- Template: email_01',
    '- Version: 2026-06-09_email_01_v3',
    '- Adjunto: Mujeres, IA y el Futuro del Trabajo · Dossier — SkilLand v2.pdf',
    `- Batch: ${batchId}`,
    '- Alcance: deal interno, no contacto externo.',
  ].join('\n');

  if (!apply) return { action: 'planned_create', title };

  const note = await client.rest('/notes', {
    method: 'POST',
    body: JSON.stringify({
      title,
      bodyV2: { markdown, blocknote: null },
    }),
  });
  const noteId = note.data?.createNote?.id;
  if (!noteId) throw new Error(`Note id missing: ${JSON.stringify(note).slice(0, 500)}`);

  for (const body of [
    { noteId, targetOpportunityId: opportunityId },
    { noteId, targetPersonId: personId },
    { noteId, targetCompanyId: companyId },
  ]) {
    await client.rest('/noteTargets', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  return { action: 'created', id: noteId, title };
}

function buildPlan({ batchId, opportunity, company, person }) {
  const candidate = {
    crm_deal_id: opportunity.id,
    deal_name: TEST_OPPORTUNITY_NAME,
    company_id: company.id,
    company_name: TEST_COMPANY_NAME,
    person_id: person.id,
    person_name: `${TEST_PERSON_FIRST_NAME} ${TEST_PERSON_LAST_NAME}`,
    email: TEST_EMAIL,
    organization_type: 'internal_test',
    department_area: 'Validación CRM/GWS',
    island: 'Canarias',
    municipality: 'Canarias',
    icp_segment: 'internal_test',
    quality_flags: 'internal_test;email_01_v3;dossier_blue_v2',
    outreach_status: OUTREACH_STATUS,
    ia_mujeres_funnel_stage: IA_STAGE,
    high_confidence: true,
    generic_email: false,
    needs_manual_review: false,
    duplicate_possible: false,
    eligible: true,
    exclusion_reasons: [],
    internal_test: true,
  };

  return {
    schema_version: '1.0',
    batch_id: batchId,
    generated_at: new Date().toISOString(),
    mode: 'internal-email-01-v3-test',
    campaign_name: CAMPAIGN_NAME,
    business_line: BUSINESS_LINE_NAME,
    limit: 1,
    safeguards: [
      `Internal recipient only: ${TEST_EMAIL}.`,
      'Uses normal Email 1 v3 payload generation and Gmail draft creation path.',
      'No external public-sector contact is touched by this batch.',
      'Send requires the dedicated approved-draft sender confirmation.',
    ],
    summary: {
      crm_opportunities_seen: 1,
      campaign_opportunities_seen: 1,
      eligible_count: 1,
      selected_count: 1,
      excluded_count: 0,
    },
    selected: [candidate],
    excluded: [],
  };
}

function renderReview(plan, report) {
  return `# IA Mujeres Email 1 v3 Internal Test

Batch ID: \`${plan.batch_id}\`

## CRM

- Company: ${report.company.action} ${report.company.id ?? ''}
- Person: ${report.person.action} ${report.person.id ?? ''}
- Opportunity: ${report.opportunity.action} ${report.opportunity.id ?? ''}
- Recipient: ${TEST_EMAIL}

## Payload Target

| Deal | Contacto | Email | Entidad | Territorio |
|---|---|---|---|---|
| ${TEST_OPPORTUNITY_NAME} | ${TEST_PERSON_FIRST_NAME} ${TEST_PERSON_LAST_NAME} | ${TEST_EMAIL} | ${TEST_COMPANY_NAME} | Canarias |

## Safeguards

${plan.safeguards.map((item) => `- ${item}`).join('\n')}
`;
}

function writeOutputs(outputDir, plan, report) {
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, `batch_${plan.batch_id}_plan.json`);
  const reviewPath = path.join(outputDir, `batch_${plan.batch_id}_review.md`);
  const reportPath = path.join(outputDir, `2026-06-09_email_01_v3_internal_test_report.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(plan, null, 2));
  fs.writeFileSync(reviewPath, renderReview(plan, report));
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return { jsonPath, reviewPath, reportPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  configureRecipient(args.recipientEmail);
  const client = new TwentyClient(readTwentyCredentials());
  const batchId = args.batchId ?? `${new Date().toISOString().replace(/[:.]/g, '-')}_email01v3-internal`;
  const workspace = await fetchWorkspaceData(client);

  const businessLine = workspace.businessLines.find((item) => item.name === BUSINESS_LINE_NAME);
  if (!businessLine) throw new Error(`Business line not found: ${BUSINESS_LINE_NAME}`);

  const existingCompany = workspace.companies.find(
    (company) => normalizeText(company.name) === normalizeText(TEST_COMPANY_NAME),
  );
  const existingPerson = workspace.people.find((person) =>
    emailsOf(person).some((email) => String(email).toLowerCase() === TEST_EMAIL),
  );
  const existingOpportunity = workspace.opportunities.find(
    (opportunity) => normalizeText(opportunity.name) === normalizeText(TEST_OPPORTUNITY_NAME),
  );

  const company = await upsertCompany(client, existingCompany, args.apply);
  const companyId = args.apply ? company.id : existingCompany?.id ?? crypto.randomUUID();
  const person = await upsertPerson(client, existingPerson, companyId, args.apply);
  const personId = args.apply ? person.id : existingPerson?.id ?? crypto.randomUUID();
  const opportunity = await upsertOpportunity(
    client,
    existingOpportunity,
    {
      companyId,
      personId,
      businessLineId: businessLine.id,
      batchId,
    },
    args.apply,
  );
  const opportunityId = args.apply ? opportunity.id : existingOpportunity?.id ?? crypto.randomUUID();

  const note = await createNote(
    client,
    {
      opportunityId,
      personId,
      companyId,
      batchId,
    },
    args.apply,
  );

  const report = {
    generated_at: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'dry-run',
    batch_id: batchId,
    company,
    person,
    opportunity,
    note,
  };
  const plan = buildPlan({
    batchId,
    opportunity: { id: opportunityId },
    company: { id: companyId },
    person: { id: personId },
  });
  const outputs = writeOutputs(args.outputDir, plan, report);

  console.log(JSON.stringify({
    status: 'ok',
    mode: report.mode,
    batch_id: batchId,
    company_id: companyId,
    person_id: personId,
    opportunity_id: opportunityId,
    outputs,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

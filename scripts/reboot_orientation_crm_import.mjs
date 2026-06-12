#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import {
  readTwentyCredentials,
  TwentyClient,
} from './crm_manual_update_crew/twenty-client.mjs';

const ROOT_DIR = process.cwd();
const FUNNEL_DIR =
  '/home/reboot/Escritorio/REBOOT_ACADEMY/Reboot-Intro-Cualification-Funnel';
const OUTPUT_DIR = path.join(ROOT_DIR, '04_outputs', 'reboot_orientation_crm_import');

const BUSINESS_LINE_NAME = 'Skilland School';
const CAMPAIGN_NAME = 'Reboot Intro Qualification Funnel';
const OWNER_EMAIL = 'raul@reboot.academy';
const STAGE = 'IN_MEETINGS';
const TASK_TITLE = 'Sesion 1:1 Orientacion y prospeccion';
const SOURCE_TYPE = 'supabase_orientation_funnel';
const SOURCE_FILE = 'Reboot-Intro-Cualification-Funnel/orientation_leads';

const TASK_DATES_BY_EMAIL = new Map([
  ['michelnory_noestoyaqui@hotmail.com', '2026-06-12'],
  ['nerimatte85@gmail.com', '2026-06-15'],
  ['seergiohr98@gmail.com', '2026-06-09'],
  ['netnck@gmail.com', '2026-06-12'],
]);

const EXCLUDED_EMAILS = new Set(['jerm020690@gmail.com']);
const EXCLUDED_NORMALIZED_NAMES = new Set(['jesus rivas']);

function parseArgs(argv) {
  return {
    apply: argv.includes('--apply'),
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readEnvFile(filePath) {
  const env = fs.readFileSync(filePath, 'utf8');
  return Object.fromEntries(
    env
      .split(/\n/)
      .map((line) => line.match(/^([^#=]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [
        match[1].trim(),
        match[2].trim().replace(/^['"]|['"]$/g, ''),
      ]),
  );
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value) {
  return String(value ?? '')
    .replace(/\p{Cf}/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanPhone(value) {
  return String(value ?? '')
    .replace(/\p{Cf}/gu, '')
    .trim();
}

function fullName(lead) {
  return cleanText(`${lead.first_name ?? ''} ${lead.last_name ?? ''}`);
}

function personNameInput(lead) {
  return {
    firstName: cleanText(lead.first_name) || 'Unknown',
    lastName: cleanText(lead.last_name),
  };
}

function emailsInput(email) {
  const trimmed = cleanText(email).toLowerCase();
  return trimmed
    ? {
        primaryEmail: trimmed,
        additionalEmails: [],
      }
    : undefined;
}

function phonesInput(phone) {
  const trimmed = cleanPhone(phone);
  return trimmed
    ? {
        primaryPhoneNumber: trimmed,
        additionalPhones: [],
      }
    : undefined;
}

function structuredPhoneInput(phone, residence) {
  const trimmed = cleanPhone(phone).replace(/\s+/g, '');
  if (!trimmed) return '';
  if (trimmed.startsWith('+')) return trimmed;

  const digits = trimmed.replace(/[^\d]/g, '');
  const normalizedResidence = normalizeText(residence);
  const looksSpanish =
    /^[6789]\d{8}$/.test(digits) &&
    (normalizedResidence.includes('espana') ||
      normalizedResidence.includes('palmas') ||
      normalizedResidence.includes('gran canaria') ||
      normalizedResidence.includes('canarias'));

  return looksSpanish ? `+34${digits}` : '';
}

function amountForInvestmentRange(range) {
  const normalized = normalizeText(range);

  if (normalized.includes('menos de 500')) return 500;
  if (normalized.includes('500') && normalized.includes('1.000')) return 750;
  if (normalized.includes('1.000') && normalized.includes('2.000')) return 1500;
  if (normalized.includes('2.000') && normalized.includes('3.000')) return 2500;
  if (normalized.includes('mas de 3.000')) return 3000;

  return null;
}

function dueAtForDate(date) {
  return new Date(`${date}T09:00:00+01:00`).toISOString();
}

async function fetchSupabaseLeads() {
  const env = readEnvFile(path.join(FUNNEL_DIR, '.env.local'));
  const url = `${env.SUPABASE_URL.replace(
    /\/+$/,
    '',
  )}/rest/v1/orientation_leads?select=*&order=created_at.asc`;

  const response = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : [];

  if (!response.ok) {
    throw new Error(`Supabase error ${response.status}: ${text.slice(0, 800)}`);
  }

  return json;
}

async function fetchWorkspaceData(client) {
  const data = await client.gql(`
    query RebootOrientationWorkspaceData {
      businessLines(first: 200) {
        edges { node { id name } }
      }
      workspaceMembers(first: 100) {
        edges { node { id userEmail name { firstName lastName } } }
      }
      people(first: 500) {
        edges {
          node {
            id
            name { firstName lastName }
            emails { primaryEmail additionalEmails }
          }
        }
      }
      opportunities(first: 500) {
        edges {
          node {
            id
            name
            stage
            campaignName
            businessLineName
            pointOfContact {
              id
              emails { primaryEmail additionalEmails }
            }
            taskTargets {
              edges {
                node {
                  task {
                    id
                    title
                    dueAt
                    status
                  }
                }
              }
            }
            noteTargets {
              edges {
                node {
                  note {
                    id
                    title
                  }
                }
              }
            }
          }
        }
      }
    }
  `);

  return {
    businessLines: data.businessLines.edges.map((edge) => edge.node),
    workspaceMembers: data.workspaceMembers.edges.map((edge) => edge.node),
    people: data.people.edges.map((edge) => edge.node),
    opportunities: data.opportunities.edges.map((edge) => edge.node),
  };
}

function peopleByEmail(people) {
  const map = new Map();

  for (const person of people) {
    const emails = [
      person.emails?.primaryEmail,
      ...(person.emails?.additionalEmails ?? []),
    ].filter(Boolean);

    for (const email of emails) {
      map.set(String(email).toLowerCase(), person);
    }
  }

  return map;
}

function opportunitiesByKey(opportunities) {
  const byName = new Map();
  const byContactEmail = new Map();

  for (const opportunity of opportunities) {
    byName.set(normalizeText(opportunity.name), opportunity);

    const emails = [
      opportunity.pointOfContact?.emails?.primaryEmail,
      ...(opportunity.pointOfContact?.emails?.additionalEmails ?? []),
    ].filter(Boolean);

    for (const email of emails) {
      const key = `${String(email).toLowerCase()}::${CAMPAIGN_NAME}`;
      byContactEmail.set(key, opportunity);
    }
  }

  return { byName, byContactEmail };
}

function buildPersonData(lead) {
  const phone = cleanPhone(lead.whatsapp);
  const structuredPhone = structuredPhoneInput(phone, lead.residence);

  return {
    name: personNameInput(lead),
    emails: emailsInput(lead.email),
    phones: phonesInput(structuredPhone),
    phoneMain: phone,
    city: cleanText(lead.residence),
    businessLineName: BUSINESS_LINE_NAME,
    campaignName: CAMPAIGN_NAME,
    sourceType: SOURCE_TYPE,
    sourceFile: SOURCE_FILE,
    qualityFlags: (lead.lead_tags ?? []).join(';'),
    highConfidence: lead.lead_temperature === 'hot',
    needsManualReview: (lead.lead_tags ?? []).includes('minor'),
    duplicatePossible: false,
  };
}

function buildOpportunityData({ lead, personId, ownerId, businessLineId }) {
  const amount = amountForInvestmentRange(lead.investment_range);
  const taskDate = TASK_DATES_BY_EMAIL.get(cleanText(lead.email).toLowerCase());

  return {
    name: `${fullName(lead)} - Reboot Orientation Funnel`,
    stage: STAGE,
    amount: amount
      ? {
          amountMicros: Math.round(amount * 1_000_000),
          currencyCode: 'EUR',
        }
      : undefined,
    pointOfContactId: personId,
    ownerId,
    businessLineId,
    businessLineName: BUSINESS_LINE_NAME,
    campaignName: CAMPAIGN_NAME,
    sourceType: SOURCE_TYPE,
    sourceFile: SOURCE_FILE,
    qualityFlags: (lead.lead_tags ?? []).join(';'),
    highConfidence: lead.lead_temperature === 'hot',
    needsManualReview: (lead.lead_tags ?? []).includes('minor'),
    duplicatePossible: false,
    phoneMain: cleanPhone(lead.whatsapp),
    meetingStatus: 'Sesion 1:1 Orientacion y prospeccion pendiente',
    meetingDate: taskDate ? dueAtForDate(taskDate) : undefined,
    outreachStatus: 'pending_1_1_orientation_session',
  };
}

function renderLeadMarkdown(lead, amount) {
  const lines = [
    '# Lead Reboot Orientation Funnel',
    '',
    `- Nombre: ${fullName(lead)}`,
    `- Email: ${cleanText(lead.email).toLowerCase()}`,
    `- WhatsApp: ${cleanPhone(lead.whatsapp)}`,
    `- Entrada Supabase: ${lead.created_at}`,
    `- Lead score: ${lead.lead_score}`,
    `- Temperatura: ${lead.lead_temperature}`,
    `- Tags: ${(lead.lead_tags ?? []).join(', ') || 'sin tags'}`,
    `- Importe aproximado CRM: ${amount ? `${amount} EUR` : 'sin definir'}`,
    '',
    '## Resumen',
    '',
    lead.lead_summary || 'Sin resumen.',
    '',
    '## Respuestas',
    '',
    `- Edad: ${lead.age_range}`,
    `- Residencia: ${lead.residence}`,
    `- Situacion actual: ${lead.current_situation}`,
    `- Resultado buscado: ${lead.desired_outcome}`,
    `- Objetivo: ${lead.objective}`,
    `- Area de interes: ${lead.interest_area}`,
    `- Nivel actual: ${lead.current_level}`,
    `- Formacion previa: ${lead.education_background}`,
    `- Disponibilidad semanal: ${lead.weekly_availability}`,
    `- Modalidad preferida: ${lead.preferred_modality}`,
    `- Rango de inversion: ${lead.investment_range}`,
    `- Interes en financiacion: ${lead.financing_interest}`,
    `- Timing de inicio: ${lead.start_timing}`,
    '',
    '## Contexto adicional',
    '',
    lead.additional_context || 'Sin contexto adicional.',
  ];

  return `${lines.join('\n')}\n`;
}

function renderTaskMarkdown(lead, dueDate) {
  return [
    `Sesion 1:1 de orientacion y prospeccion para ${fullName(lead)}.`,
    '',
    `- Fecha indicada: ${dueDate}`,
    `- Email: ${cleanText(lead.email).toLowerCase()}`,
    `- WhatsApp: ${cleanPhone(lead.whatsapp)}`,
    `- Area de interes: ${lead.interest_area}`,
    `- Rango de inversion: ${lead.investment_range}`,
    `- Temperatura: ${lead.lead_temperature} (${lead.lead_score})`,
  ].join('\n');
}

async function createPerson(client, data, apply) {
  if (!apply) return { planned: true, data };

  const response = await client.gql(
    `mutation CreatePerson($data: PersonCreateInput!) {
      createPerson(data: $data) {
        id
        name { firstName lastName }
      }
    }`,
    { data },
  );

  return response.createPerson;
}

async function updatePerson(client, id, data, apply) {
  if (!apply) return { planned: true, id, data };

  const response = await client.gql(
    `mutation UpdatePerson($id: UUID!, $data: PersonUpdateInput!) {
      updatePerson(id: $id, data: $data) {
        id
        name { firstName lastName }
      }
    }`,
    { id, data },
  );

  return response.updatePerson;
}

async function createOpportunity(client, data, apply) {
  if (!apply) return { planned: true, data };

  const response = await client.gql(
    `mutation CreateOpportunity($data: OpportunityCreateInput!) {
      createOpportunity(data: $data) {
        id
        name
        stage
      }
    }`,
    { data },
  );

  return response.createOpportunity;
}

async function updateOpportunity(client, id, data, apply) {
  if (!apply) return { planned: true, id, data };

  const response = await client.gql(
    `mutation UpdateOpportunity($id: UUID!, $data: OpportunityUpdateInput!) {
      updateOpportunity(id: $id, data: $data) {
        id
        name
        stage
      }
    }`,
    { id, data },
  );

  return response.updateOpportunity;
}

async function createNote(client, { title, markdown, opportunityId, personId }, apply) {
  if (!apply) return { planned: true, title };

  const note = await client.rest('/notes', {
    method: 'POST',
    body: JSON.stringify({
      title,
      bodyV2: { markdown, blocknote: null },
    }),
  });
  const noteId = note.data?.createNote?.id;
  if (!noteId) throw new Error(`Note id missing: ${JSON.stringify(note)}`);

  for (const body of [
    { noteId, targetOpportunityId: opportunityId },
    { noteId, targetPersonId: personId },
  ]) {
    await client.rest('/noteTargets', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  return { id: noteId, title };
}

async function createTask(
  client,
  { title, markdown, dueAt, opportunityId, personId, assigneeId },
  apply,
) {
  if (!apply) return { planned: true, title, dueAt };

  const task = await client.rest('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title,
      status: 'TODO',
      assigneeId,
      dueAt,
      bodyV2: { markdown, blocknote: null },
    }),
  });
  const taskId = task.data?.createTask?.id;
  if (!taskId) throw new Error(`Task id missing: ${JSON.stringify(task)}`);

  for (const body of [
    { taskId, targetOpportunityId: opportunityId },
    { taskId, targetPersonId: personId },
  ]) {
    await client.rest('/taskTargets', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  return { id: taskId, title, dueAt };
}

function taskAlreadyExists(opportunity, dueAt) {
  return (opportunity?.taskTargets?.edges ?? []).some(({ node }) => {
    const task = node?.task;
    return task?.title === TASK_TITLE && task?.dueAt === dueAt;
  });
}

function noteAlreadyExists(opportunity, title) {
  return (opportunity?.noteTargets?.edges ?? []).some(
    ({ node }) => node?.note?.title === title,
  );
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const client = new TwentyClient(readTwentyCredentials());
  ensureDir(OUTPUT_DIR);

  const allLeads = await fetchSupabaseLeads();
  const leads = allLeads.filter((lead) => {
    const email = cleanText(lead.email).toLowerCase();
    const name = normalizeText(fullName(lead));

    return !EXCLUDED_EMAILS.has(email) && !EXCLUDED_NORMALIZED_NAMES.has(name);
  });

  const workspace = await fetchWorkspaceData(client);
  const businessLine = workspace.businessLines.find(
    (item) => item.name === BUSINESS_LINE_NAME,
  );
  const owner = workspace.workspaceMembers.find(
    (member) => member.userEmail === OWNER_EMAIL,
  );

  if (!businessLine) throw new Error(`Business line not found: ${BUSINESS_LINE_NAME}`);
  if (!owner) throw new Error(`Owner not found: ${OWNER_EMAIL}`);

  const existingPeopleByEmail = peopleByEmail(workspace.people);
  const existingOpportunities = opportunitiesByKey(workspace.opportunities);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'dry_run',
    sourceLeadCount: allLeads.length,
    excludedLeadCount: allLeads.length - leads.length,
    importedLeadCount: leads.length,
    businessLine,
    owner,
    campaignName: CAMPAIGN_NAME,
    stage: STAGE,
    results: [],
  };

  for (const lead of leads) {
    const email = cleanText(lead.email).toLowerCase();
    const dueDate = TASK_DATES_BY_EMAIL.get(email);
    if (!dueDate) throw new Error(`No task date configured for ${email}`);

    const amount = amountForInvestmentRange(lead.investment_range);
    const personData = buildPersonData(lead);
    const existingPerson = existingPeopleByEmail.get(email);
    const person = existingPerson
      ? await updatePerson(client, existingPerson.id, personData, args.apply)
      : await createPerson(client, personData, args.apply);
    const personId = args.apply ? person.id : existingPerson?.id ?? null;

    const opportunityData = buildOpportunityData({
      lead,
      personId,
      ownerId: owner.id,
      businessLineId: businessLine.id,
    });
    const opportunityNameKey = normalizeText(opportunityData.name);
    const existingOpportunity =
      existingOpportunities.byName.get(opportunityNameKey) ??
      existingOpportunities.byContactEmail.get(`${email}::${CAMPAIGN_NAME}`);
    const opportunity = existingOpportunity
      ? await updateOpportunity(
          client,
          existingOpportunity.id,
          opportunityData,
          args.apply,
        )
      : await createOpportunity(client, opportunityData, args.apply);
    const opportunityId = args.apply
      ? opportunity.id
      : existingOpportunity?.id ?? null;

    const noteTitle = `Lead Supabase - ${fullName(lead)}`;
    const note = existingOpportunity && noteAlreadyExists(existingOpportunity, noteTitle)
      ? { reused: true, title: noteTitle }
      : await createNote(
          client,
          {
            title: noteTitle,
            markdown: renderLeadMarkdown(lead, amount),
            opportunityId,
            personId,
          },
          args.apply,
        );

    const dueAt = dueAtForDate(dueDate);
    const task = existingOpportunity && taskAlreadyExists(existingOpportunity, dueAt)
      ? { reused: true, title: TASK_TITLE, dueAt }
      : await createTask(
          client,
          {
            title: TASK_TITLE,
            markdown: renderTaskMarkdown(lead, dueDate),
            dueAt,
            opportunityId,
            personId,
            assigneeId: owner.id,
          },
          args.apply,
        );

    report.results.push({
      lead: {
        name: fullName(lead),
        email,
        supabaseId: lead.id,
      },
      amount,
      dueDate,
      person: {
        action: existingPerson ? 'updated_existing' : 'created',
        id: args.apply ? person.id : existingPerson?.id ?? null,
      },
      opportunity: {
        action: existingOpportunity ? 'updated_existing' : 'created',
        id: args.apply ? opportunity.id : existingOpportunity?.id ?? null,
        name: opportunityData.name,
      },
      note,
      task,
    });

    if (args.apply) {
      existingPeopleByEmail.set(email, { id: person.id, emails: { primaryEmail: email } });
      existingOpportunities.byName.set(opportunityNameKey, {
        id: opportunity.id,
        name: opportunityData.name,
      });
      existingOpportunities.byContactEmail.set(`${email}::${CAMPAIGN_NAME}`, {
        id: opportunity.id,
        name: opportunityData.name,
      });
    }
  }

  const suffix = args.apply ? 'report' : 'dry_run';
  const baseName = `2026-06-09_reboot_orientation_crm_import_${suffix}`;
  const jsonPath = path.join(OUTPUT_DIR, `${baseName}.json`);
  const mdPath = path.join(OUTPUT_DIR, `${baseName}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderReportMarkdown(report));

  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        importedLeadCount: report.importedLeadCount,
        excludedLeadCount: report.excludedLeadCount,
        jsonPath,
        mdPath,
      },
      null,
      2,
    ),
  );
}

function renderReportMarkdown(report) {
  const lines = [
    '# Reboot Orientation CRM Import',
    '',
    `- Mode: ${report.mode}`,
    `- Generated at: ${report.generatedAt}`,
    `- Business Line: ${report.businessLine.name}`,
    `- Campaign: ${report.campaignName}`,
    `- Owner: ${report.owner.name.firstName} ${report.owner.name.lastName} (${report.owner.userEmail})`,
    `- Stage: ${report.stage}`,
    `- Source leads: ${report.sourceLeadCount}`,
    `- Excluded leads: ${report.excludedLeadCount}`,
    `- Imported leads: ${report.importedLeadCount}`,
    '',
    '## Results',
    '',
  ];

  for (const result of report.results) {
    lines.push(`### ${result.lead.name}`);
    lines.push('');
    lines.push(`- Email: ${result.lead.email}`);
    lines.push(`- Amount: ${result.amount ?? 'sin definir'} EUR`);
    lines.push(`- Task date: ${result.dueDate}`);
    lines.push(`- Person: ${result.person.action}${result.person.id ? ` (${result.person.id})` : ''}`);
    lines.push(
      `- Opportunity: ${result.opportunity.action}${result.opportunity.id ? ` (${result.opportunity.id})` : ''}`,
    );
    lines.push(`- Opportunity name: ${result.opportunity.name}`);
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

run().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

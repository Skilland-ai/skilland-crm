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
const MEETING_TASK_TITLE = 'Sesion 1:1 Orientacion y prospeccion';
const PREP_TASK_TITLE_PREFIX = 'Preparar material potencial';
const SOURCE_TYPE = 'supabase_orientation_funnel';
const SOURCE_FILE = 'Reboot-Intro-Cualification-Funnel/orientation_leads';

function parseArgs(argv) {
  const args = {
    apply: false,
    email: '',
    meetingDueAt: '',
    prepDueAt: '',
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      args.apply = true;
      continue;
    }

    if (arg.startsWith('--email=')) {
      args.email = arg.slice('--email='.length);
      continue;
    }

    if (arg.startsWith('--meeting-due-at=')) {
      args.meetingDueAt = arg.slice('--meeting-due-at='.length);
      continue;
    }

    if (arg.startsWith('--prep-due-at=')) {
      args.prepDueAt = arg.slice('--prep-due-at='.length);
    }
  }

  if (!args.email) throw new Error('Missing required --email');
  if (!args.meetingDueAt) throw new Error('Missing required --meeting-due-at');
  if (!args.prepDueAt) throw new Error('Missing required --prep-due-at');

  return args;
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
      normalizedResidence.includes('canarias') ||
      normalizedResidence.includes('telde'));

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

function normalizeDueAt(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid datetime: ${value}`);
  }
  return date.toISOString();
}

function formatLocalScheduleLabel(value) {
  return cleanText(value)
    .replace('T', ' ')
    .replace(/:00(?:[+-]\d{2}:\d{2}|Z)$/, '')
    .replace(/([+-]\d{2}:\d{2}|Z)$/, '');
}

async function fetchSupabaseLeadByEmail(email) {
  const env = readEnvFile(path.join(FUNNEL_DIR, '.env.local'));
  const url = new URL(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/orientation_leads`);
  url.searchParams.set('select', '*');
  url.searchParams.set('email', `eq.${cleanText(email).toLowerCase()}`);
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', '1');

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

  if (!json[0]) {
    throw new Error(`Lead not found in Supabase for ${email}`);
  }

  return json[0];
}

async function fetchWorkspaceData(client) {
  const data = await client.gql(`
    query RebootOrientationSingleLeadWorkspaceData {
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
            meetingDate
            meetingStatus
            outreachStatus
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

function buildOpportunityData({
  lead,
  personId,
  ownerId,
  businessLineId,
  meetingDueAt,
}) {
  const amount = amountForInvestmentRange(lead.investment_range);

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
    meetingDate: meetingDueAt,
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

function renderMeetingTaskMarkdown(lead, meetingLabel) {
  return [
    `Sesion 1:1 de orientacion y prospeccion para ${fullName(lead)}.`,
    '',
    `- Fecha indicada: ${meetingLabel} Atlantic/Canary`,
    `- Email: ${cleanText(lead.email).toLowerCase()}`,
    `- WhatsApp: ${cleanPhone(lead.whatsapp)}`,
    `- Area de interes: ${lead.interest_area}`,
    `- Rango de inversion: ${lead.investment_range}`,
    `- Temperatura: ${lead.lead_temperature} (${lead.lead_score})`,
    '',
    '## Resumen del lead',
    '',
    lead.lead_summary || 'Sin resumen.',
  ].join('\n');
}

function renderPrepTaskMarkdown(lead, prepLabel, meetingLabel) {
  return [
    `Preparar material potencial para presentar a ${fullName(lead)} en la sesion 1:1.`,
    '',
    `- Deadline de preparacion: ${prepLabel} Atlantic/Canary`,
    `- Sesion 1:1 prevista: ${meetingLabel} Atlantic/Canary`,
    `- Email: ${cleanText(lead.email).toLowerCase()}`,
    `- WhatsApp: ${cleanPhone(lead.whatsapp)}`,
    `- Area de interes: ${lead.interest_area}`,
    `- Objetivo: ${lead.objective}`,
    `- Rango de inversion: ${lead.investment_range}`,
    `- Temperatura: ${lead.lead_temperature} (${lead.lead_score})`,
    '',
    '## Contexto adicional',
    '',
    lead.additional_context || 'Sin contexto adicional.',
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
  if (!noteId) throw new Error(`Note id missing: ${JSON.stringify(note).slice(0, 500)}`);

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
  if (!taskId) throw new Error(`Task id missing: ${JSON.stringify(task).slice(0, 500)}`);

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

async function updateTask(client, id, data, apply) {
  if (!apply) return { planned: true, id, data };

  const response = await client.gql(
    `mutation UpdateTask($id: UUID!, $data: TaskUpdateInput!) {
      updateTask(id: $id, data: $data) {
        id
        title
        status
        dueAt
      }
    }`,
    { id, data },
  );

  return response.updateTask;
}

function noteAlreadyExists(opportunity, title) {
  return (opportunity?.noteTargets?.edges ?? []).some(
    ({ node }) => node?.note?.title === title,
  );
}

function findTaskByTitle(opportunity, title) {
  return (opportunity?.taskTargets?.edges ?? [])
    .map(({ node }) => node?.task)
    .find((task) => task?.title === title);
}

function outputBaseName(email) {
  return `${new Date().toISOString().replace(/[:.]/g, '-')}_${cleanText(email)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')}_orientation_single_import`;
}

function renderReportMarkdown(report) {
  const lines = [
    '# Reboot Orientation Single Lead Import',
    '',
    `- Mode: ${report.mode}`,
    `- Generated at: ${report.generatedAt}`,
    `- Lead: ${report.lead.name} <${report.lead.email}>`,
    `- Supabase ID: ${report.lead.supabaseId}`,
    `- Meeting due at: ${report.meetingTask.dueAt}`,
    `- Prep due at: ${report.prepTask.dueAt}`,
    '',
    '## Results',
    '',
    `- Person: ${report.person.action}${report.person.id ? ` (${report.person.id})` : ''}`,
    `- Opportunity: ${report.opportunity.action}${report.opportunity.id ? ` (${report.opportunity.id})` : ''}`,
    `- Note: ${report.note.action}${report.note.id ? ` (${report.note.id})` : ''}`,
    `- Meeting task: ${report.meetingTask.action}${report.meetingTask.id ? ` (${report.meetingTask.id})` : ''}`,
    `- Prep task: ${report.prepTask.action}${report.prepTask.id ? ` (${report.prepTask.id})` : ''}`,
    '',
  ];

  return `${lines.join('\n')}\n`;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const client = new TwentyClient(readTwentyCredentials());
  ensureDir(OUTPUT_DIR);

  const lead = await fetchSupabaseLeadByEmail(args.email);
  const workspace = await fetchWorkspaceData(client);
  const businessLine = workspace.businessLines.find(
    (item) => item.name === BUSINESS_LINE_NAME,
  );
  const owner = workspace.workspaceMembers.find(
    (member) => member.userEmail === OWNER_EMAIL,
  );

  if (!businessLine) throw new Error(`Business line not found: ${BUSINESS_LINE_NAME}`);
  if (!owner) throw new Error(`Owner not found: ${OWNER_EMAIL}`);

  const email = cleanText(lead.email).toLowerCase();
  const meetingDueAt = normalizeDueAt(args.meetingDueAt);
  const prepDueAt = normalizeDueAt(args.prepDueAt);
  const meetingLabel = formatLocalScheduleLabel(args.meetingDueAt);
  const prepLabel = formatLocalScheduleLabel(args.prepDueAt);
  const existingPeopleByEmail = peopleByEmail(workspace.people);
  const existingOpportunities = opportunitiesByKey(workspace.opportunities);

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
    meetingDueAt,
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
  const opportunityId = args.apply ? opportunity.id : existingOpportunity?.id ?? null;

  const noteTitle = `Lead Supabase - ${fullName(lead)}`;
  const note = existingOpportunity && noteAlreadyExists(existingOpportunity, noteTitle)
    ? {
        action: 'reused_existing',
        id: (existingOpportunity.noteTargets?.edges ?? [])
          .map(({ node }) => node?.note)
          .find((item) => item?.title === noteTitle)?.id ?? null,
        title: noteTitle,
      }
    : {
        action: 'created',
        ...(await createNote(
          client,
          {
            title: noteTitle,
            markdown: renderLeadMarkdown(lead, amount),
            opportunityId,
            personId,
          },
          args.apply,
        )),
      };

  const meetingExistingTask = findTaskByTitle(existingOpportunity, MEETING_TASK_TITLE);
  const meetingTask = meetingExistingTask
    ? {
        action: 'updated_existing',
        ...(await updateTask(
          client,
          meetingExistingTask.id,
          { dueAt: meetingDueAt, status: 'TODO' },
          args.apply,
        )),
      }
    : {
        action: 'created',
        ...(await createTask(
          client,
          {
            title: MEETING_TASK_TITLE,
            markdown: renderMeetingTaskMarkdown(lead, meetingLabel),
            dueAt: meetingDueAt,
            opportunityId,
            personId,
            assigneeId: owner.id,
          },
          args.apply,
        )),
      };

  const prepTaskTitle = `${PREP_TASK_TITLE_PREFIX} para ${fullName(lead)}`;
  const prepExistingTask = findTaskByTitle(existingOpportunity, prepTaskTitle);
  const prepTask = prepExistingTask
    ? {
        action: 'updated_existing',
        ...(await updateTask(
          client,
          prepExistingTask.id,
          { dueAt: prepDueAt, status: 'TODO' },
          args.apply,
        )),
      }
    : {
        action: 'created',
        ...(await createTask(
          client,
          {
            title: prepTaskTitle,
            markdown: renderPrepTaskMarkdown(lead, prepLabel, meetingLabel),
            dueAt: prepDueAt,
            opportunityId,
            personId,
            assigneeId: owner.id,
          },
          args.apply,
        )),
      };

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'dry_run',
    lead: {
      name: fullName(lead),
      email,
      supabaseId: lead.id,
    },
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
    meetingTask: {
      ...meetingTask,
      title: MEETING_TASK_TITLE,
      dueAt: meetingDueAt,
    },
    prepTask: {
      ...prepTask,
      title: prepTaskTitle,
      dueAt: prepDueAt,
    },
  };

  const baseName = outputBaseName(email);
  const jsonPath = path.join(OUTPUT_DIR, `${baseName}.json`);
  const mdPath = path.join(OUTPUT_DIR, `${baseName}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderReportMarkdown(report));

  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        lead: report.lead,
        person: report.person,
        opportunity: report.opportunity,
        note: report.note,
        meetingTask: report.meetingTask,
        prepTask: report.prepTask,
        jsonPath,
        mdPath,
      },
      null,
      2,
    ),
  );
}

run().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

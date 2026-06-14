#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import { fetchCrmMetadata } from './metadata.mjs';
import { fetchBusinessLines } from './retriever.mjs';
import {
  formatAmount,
  normalizeText,
  personName,
  truncate,
} from './text-utils.mjs';
import { TwentyClient, readTwentyCredentials } from './twenty-client.mjs';

const DEFAULT_OUTPUT_DIR = '04_outputs/crm_manual_update_session';
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 200;
const DEFAULT_TARGET_LIMIT = 100;
const POSSIBLE_OPPORTUNITY_VALUE = 'POSSIBLE_OPPORTUNITY';
const CLOSED_TASK_STATUSES = new Set([
  'DONE',
  'COMPLETED',
  'COMPLETE',
  'CANCELLED',
  'CANCELED',
  'ARCHIVED',
]);

function parseArgs(argv) {
  const args = {
    outputDir: DEFAULT_OUTPUT_DIR,
    pageSize: DEFAULT_PAGE_SIZE,
    maxPages: DEFAULT_MAX_PAGES,
    notesLimit: DEFAULT_TARGET_LIMIT,
    tasksLimit: DEFAULT_TARGET_LIMIT,
  };

  for (const arg of argv) {
    if (arg.startsWith('--output-dir=')) {
      args.outputDir = arg.slice('--output-dir='.length);
    } else if (arg.startsWith('--page-size=')) {
      args.pageSize = Number(arg.slice('--page-size='.length));
    } else if (arg.startsWith('--max-pages=')) {
      args.maxPages = Number(arg.slice('--max-pages='.length));
    } else if (arg.startsWith('--notes-limit=')) {
      args.notesLimit = Number(arg.slice('--notes-limit='.length));
    } else if (arg.startsWith('--tasks-limit=')) {
      args.tasksLimit = Number(arg.slice('--tasks-limit='.length));
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  for (const [name, value] of Object.entries(args)) {
    if (
      name !== 'outputDir' &&
      (!Number.isInteger(value) || value < 1 || value > 1000)
    ) {
      throw new Error(`--${kebab(name)} must be an integer between 1 and 1000.`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Read-only CRM deals snapshot

Usage:
  node scripts/crm_manual_update_crew/deals-snapshot.mjs
  node scripts/crm_manual_update_crew/deals-snapshot.mjs --output-dir=04_outputs/crm_manual_update_session

This script only performs Twenty metadata GET plus GraphQL query operations.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date();
  const timestamp = generatedAt.toISOString().replace(/[:.]/g, '-');
  const outputDir = path.resolve(args.outputDir);
  const markdownPath = path.join(outputDir, `deals_snapshot_${timestamp}.md`);
  const jsonPath = path.join(outputDir, `deals_snapshot_${timestamp}.json`);

  const credentials = readTwentyCredentials();
  const client = new TwentyClient(credentials);
  const metadata = await fetchCrmMetadata(client);
  const businessLines = await fetchBusinessLines(client).catch(() => []);
  const { opportunities, warnings } = await fetchAllOpportunities({
    client,
    metadata,
    pageSize: args.pageSize,
    maxPages: args.maxPages,
    notesLimit: args.notesLimit,
    tasksLimit: args.tasksLimit,
  });

  const stageLookup = buildStageLookup(metadata.stageOptions);
  const classified = classifyOpportunities(opportunities);
  const genericDeals = classified.generic;
  const reportContext = {
    generatedAt,
    timestamp,
    warnings,
    metadata,
    businessLines,
    stageLookup,
    pageSize: args.pageSize,
    maxPages: args.maxPages,
    notesLimit: args.notesLimit,
    tasksLimit: args.tasksLimit,
    totalFetched: opportunities.length,
    genericDeals,
    excludedIaMujeres: classified.excludedIaMujeres,
    possibleIaMujeres: classified.possibleIaMujeres,
  };

  const markdown = renderReport(reportContext);
  const json = buildSanitizedJson(reportContext);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(markdownPath, markdown, 'utf8');
  await fs.writeFile(jsonPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');

  console.log(markdown);
  console.log('\n---');
  console.log(`Markdown guardado: ${markdownPath}`);
  console.log(`JSON guardado: ${jsonPath}`);
}

async function fetchAllOpportunities({
  client,
  metadata,
  pageSize,
  maxPages,
  notesLimit,
  tasksLimit,
}) {
  const opportunities = [];
  const warnings = [];
  let after = null;
  let page = 0;

  while (page < maxPages) {
    page += 1;
    const data = await gqlQuery(
      client,
      buildOpportunitiesQuery(metadata),
      {
        first: pageSize,
        after,
        notesFirst: notesLimit,
        tasksFirst: tasksLimit,
      },
    );
    const connection = data.opportunities;

    for (const edge of connection.edges ?? []) {
      opportunities.push(normalizeOpportunity(edge.node, { warnings }));
    }

    if (!connection.pageInfo?.hasNextPage) break;
    after = connection.pageInfo.endCursor;
  }

  if (page >= maxPages) {
    warnings.push(
      `Se alcanzo --max-pages=${maxPages}; puede haber oportunidades no incluidas.`,
    );
  }

  return { opportunities, warnings: [...new Set(warnings)] };
}

async function gqlQuery(client, query, variables) {
  const compact = query.replace(/#[^\n]*/g, '').trim();

  if (!/^query\b/i.test(compact)) {
    throw new Error('Read-only guard blocked a non-query GraphQL operation.');
  }
  if (/\bmutation\b/i.test(compact)) {
    throw new Error('Read-only guard blocked a GraphQL mutation.');
  }

  return client.gql(query, variables);
}

function buildOpportunitiesQuery(metadata) {
  const extraFields = metadata.contextFields
    .map((fieldName) => `            ${fieldName}`)
    .join('\n');
  const businessLineSelection = metadata.hasBusinessLineRelation
    ? `
            businessLine {
              id
              name
            }`
    : '';
  const ownerSelection = metadata.hasOwnerRelation
    ? `
            owner {
              id
              userEmail
              name {
                firstName
                lastName
              }
            }`
    : '';

  return `
    query CrmManualDealsSnapshot(
      $first: Int!
      $after: String
      $notesFirst: Int!
      $tasksFirst: Int!
    ) {
      opportunities(first: $first, after: $after) {
        pageInfo {
          hasNextPage
          endCursor
        }
        edges {
          cursor
          node {
            id
            name
            stage
            amount {
              amountMicros
              currencyCode
            }
            closeDate
            createdAt
            updatedAt
${extraFields}
${businessLineSelection}
${ownerSelection}
            company {
              id
              name
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
            noteTargets(first: $notesFirst) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  note {
                    id
                    title
                    bodyV2 {
                      markdown
                    }
                    createdAt
                    updatedAt
                  }
                }
              }
            }
            taskTargets(first: $tasksFirst) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  task {
                    id
                    title
                    status
                    dueAt
                    bodyV2 {
                      markdown
                    }
                    createdAt
                    updatedAt
                    assignee {
                      id
                      userEmail
                      name {
                        firstName
                        lastName
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
}

function normalizeOpportunity(opportunity, { warnings }) {
  const noteTargets = opportunity.noteTargets;
  const taskTargets = opportunity.taskTargets;

  if (noteTargets?.pageInfo?.hasNextPage) {
    warnings.push(
      `El deal "${opportunity.name}" tiene mas notas que el limite consultado.`,
    );
  }
  if (taskTargets?.pageInfo?.hasNextPage) {
    warnings.push(
      `El deal "${opportunity.name}" tiene mas tareas que el limite consultado.`,
    );
  }

  const notes = (noteTargets?.edges ?? [])
    .map((edge) => edge.node?.note)
    .filter(Boolean)
    .sort(descendingRecordDate);
  const tasks = (taskTargets?.edges ?? [])
    .map((edge) => edge.node?.task)
    .filter(Boolean)
    .sort(descendingRecordDate);
  const openTasks = tasks.filter(isOpenTask).sort(openTaskSort);

  return {
    ...opportunity,
    notes,
    tasks,
    openTasks,
    contactDisplayName: personName(opportunity.pointOfContact),
    contactEmail: primaryEmail(opportunity.pointOfContact),
    businessLineDisplayName: firstText(
      opportunity.businessLine?.name,
      opportunity.businessLineName,
      '(sin business line)',
    ),
  };
}

function classifyOpportunities(opportunities) {
  const result = {
    generic: [],
    excludedIaMujeres: [],
    possibleIaMujeres: [],
  };

  for (const deal of opportunities) {
    const classification = iaMujeresClassification(deal);
    if (classification.status === 'confirmed') {
      result.excludedIaMujeres.push({ deal, reasons: classification.reasons });
    } else if (classification.status === 'possible') {
      result.possibleIaMujeres.push({ deal, reasons: classification.reasons });
    } else {
      result.generic.push(deal);
    }
  }

  return result;
}

function iaMujeresClassification(deal) {
  const confirmedChecks = [
    ['businessLine.name', deal.businessLine?.name],
    ['businessLineName', deal.businessLineName],
    ['campaignName', deal.campaignName],
  ];
  const confirmedReasons = confirmedChecks
    .filter(([, value]) => hasIaMujeresText(value))
    .map(([field, value]) => `${field}=${value}`);

  if (hasValue(deal.iaMujeresFunnelStage)) {
    confirmedReasons.push(`iaMujeresFunnelStage=${deal.iaMujeresFunnelStage}`);
  }

  if (confirmedReasons.length > 0) {
    return { status: 'confirmed', reasons: confirmedReasons };
  }

  const possibleChecks = [
    ['deal.name', deal.name],
    ['company.name', deal.company?.name],
    ['latestNote.title', deal.notes[0]?.title],
    ['latestNote.body', deal.notes[0]?.bodyV2?.markdown],
    ['latestTask.title', deal.tasks[0]?.title],
    ['latestTask.body', deal.tasks[0]?.bodyV2?.markdown],
  ];
  const possibleReasons = possibleChecks
    .filter(([, value]) => hasIaMujeresText(value))
    .map(([field]) => field);

  return possibleReasons.length > 0
    ? { status: 'possible', reasons: possibleReasons }
    : { status: 'generic', reasons: [] };
}

function renderReport(context) {
  const {
    generatedAt,
    warnings,
    metadata,
    stageLookup,
    totalFetched,
    genericDeals,
    excludedIaMujeres,
    possibleIaMujeres,
  } = context;
  const lines = [];
  const byBusinessLine = countBy(genericDeals, (deal) =>
    deal.businessLineDisplayName,
  );
  const byStage = countByStage(genericDeals, stageLookup);

  lines.push('# CRM DEALS SNAPSHOT - ACTUALIZACION MANUAL');
  lines.push('');
  lines.push(`Generado: ${formatDateTime(generatedAt.toISOString())}`);
  lines.push(
    'Modo CRM: solo lectura; metadata por GET y oportunidades por GraphQL query; sin mutations.',
  );
  lines.push(
    'Criterio de orden de stages: stageOptions.position descendente desde metadata; Possible Opportunity forzado al final.',
  );
  lines.push('');
  lines.push('## RESUMEN');
  lines.push('');
  lines.push(`Total oportunidades leidas: ${totalFetched}`);
  lines.push(`Deals genericos encontrados: ${genericDeals.length}`);
  lines.push(
    `Excluidos IA Mujeres confirmados: ${excludedIaMujeres.length}`,
  );
  lines.push(
    `Posibles IA Mujeres / revisar exclusion: ${possibleIaMujeres.length}`,
  );
  lines.push('');
  lines.push('Por Business Line:');
  appendCountLines(lines, byBusinessLine);
  lines.push('');
  lines.push('Por Stage:');
  appendCountLines(lines, byStage);

  if (warnings.length > 0) {
    lines.push('');
    lines.push('## AVISOS');
    for (const warning of warnings) lines.push(`- ${warning}`);
  }

  const grouped = groupByBusinessLineAndStage(genericDeals, stageLookup);

  for (const businessLineGroup of grouped) {
    lines.push('');
    lines.push(`# BUSINESS LINE: ${businessLineGroup.name}`);

    for (const stageGroup of businessLineGroup.stages) {
      lines.push('');
      lines.push(`## STAGE: ${stageGroup.label}`);
      lines.push('');

      stageGroup.deals.forEach((deal, index) => {
        appendDeal(lines, deal, index + 1, { stageLookup, metadata });
      });
    }
  }

  lines.push('');
  lines.push('# POSIBLES IA MUJERES / REVISAR EXCLUSION');
  lines.push('');
  if (possibleIaMujeres.length === 0) {
    lines.push('Sin deals dudosos detectados.');
  } else {
    possibleIaMujeres
      .sort((a, b) => dealName(a.deal).localeCompare(dealName(b.deal), 'es'))
      .forEach(({ deal, reasons }, index) => {
        lines.push(`[${index + 1}] ${dealName(deal)}`);
        lines.push(`Organizacion: ${companyName(deal)}`);
        lines.push(`Business Line: ${deal.businessLineDisplayName}`);
        lines.push(`Stage: ${stageLabel(deal.stage, stageLookup)}`);
        lines.push(`Motivos duda: ${reasons.join(', ')}`);
        lines.push('');
      });
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function appendDeal(lines, deal, index, { stageLookup }) {
  const latestNote = deal.notes[0] ?? null;
  const openTasks = deal.openTasks;
  const relevantTask = openTasks[0] ?? deal.tasks[0] ?? null;

  lines.push(`[${index}] ${dealName(deal)}`);
  lines.push(`Organizacion: ${companyName(deal)}`);
  lines.push(`Contacto: ${contactLine(deal)}`);
  lines.push(`Business Line: ${deal.businessLineDisplayName}`);
  lines.push(`Stage: ${stageLabel(deal.stage, stageLookup)}`);
  lines.push(`Value: ${formatAmount(deal.amount)}`);
  lines.push(`Updated: ${formatDateTime(deal.updatedAt)}`);
  lines.push(`Ultima nota: ${noteLine(latestNote)}`);
  lines.push('Tareas abiertas:');

  if (openTasks.length === 0) {
    lines.push('- sin tareas abiertas');
  } else {
    for (const task of openTasks) {
      lines.push(`- ${taskLine(task, { markNext: task === openTasks[0] })}`);
    }
  }

  lines.push(`Tarea relevante: ${taskLine(relevantTask)}`);
  lines.push('Punto actual sugerido:');
  lines.push(suggestCurrentPoint(deal, { latestNote, relevantTask }));
  lines.push('');
}

function groupByBusinessLineAndStage(deals, stageLookup) {
  const businessLineNames = [...new Set(deals.map((deal) => deal.businessLineDisplayName))]
    .sort((a, b) => a.localeCompare(b, 'es'));

  return businessLineNames.map((businessLineName) => {
    const businessLineDeals = deals
      .filter((deal) => deal.businessLineDisplayName === businessLineName)
      .sort((a, b) => dealName(a).localeCompare(dealName(b), 'es'));
    const stageValues = [...new Set(businessLineDeals.map((deal) => deal.stage))]
      .sort((a, b) => compareStages(a, b, stageLookup));

    return {
      name: businessLineName,
      stages: stageValues.map((stageValue) => ({
        value: stageValue,
        label: stageLabel(stageValue, stageLookup),
        deals: businessLineDeals.filter((deal) => deal.stage === stageValue),
      })),
    };
  });
}

function buildSanitizedJson(context) {
  const {
    generatedAt,
    timestamp,
    warnings,
    metadata,
    businessLines,
    pageSize,
    maxPages,
    notesLimit,
    tasksLimit,
    totalFetched,
    genericDeals,
    excludedIaMujeres,
    possibleIaMujeres,
    stageLookup,
  } = context;

  return {
    generatedAt: generatedAt.toISOString(),
    timestamp,
    mode: 'read-only',
    crmOperations: {
      metadata: 'GET /rest/metadata/objects',
      records: 'GraphQL query only',
      mutations: 0,
      restWrites: 0,
    },
    limits: {
      pageSize,
      maxPages,
      notesPerDeal: notesLimit,
      tasksPerDeal: tasksLimit,
    },
    ordering: {
      stageCriterion:
        'stageOptions.position descending from Twenty metadata; POSSIBLE_OPPORTUNITY forced last.',
      stageOptions: metadata.stageOptions,
    },
    warnings,
    businessLines,
    summary: {
      totalFetched,
      genericDeals: genericDeals.length,
      excludedIaMujeresConfirmed: excludedIaMujeres.length,
      possibleIaMujeresReview: possibleIaMujeres.length,
      byBusinessLine: countBy(genericDeals, (deal) =>
        deal.businessLineDisplayName,
      ),
      byStage: countByStage(genericDeals, stageLookup),
    },
    deals: genericDeals.map((deal) => dealToJson(deal, stageLookup)),
    possibleIaMujeresReview: possibleIaMujeres.map(({ deal, reasons }) => ({
      reasons,
      deal: dealToJson(deal, stageLookup),
    })),
    excludedIaMujeresConfirmed: {
      count: excludedIaMujeres.length,
      reasonCounts: countReasons(excludedIaMujeres),
    },
  };
}

function dealToJson(deal, stageLookup) {
  const latestNote = deal.notes[0] ?? null;
  const relevantTask = deal.openTasks[0] ?? deal.tasks[0] ?? null;

  return {
    id: deal.id,
    name: deal.name,
    businessLine: {
      id: deal.businessLine?.id ?? null,
      name: deal.businessLineDisplayName,
      textName: deal.businessLineName ?? null,
    },
    stage: {
      value: deal.stage,
      label: stageLabel(deal.stage, stageLookup),
      position: stageLookup.get(deal.stage)?.position ?? null,
    },
    company: {
      id: deal.company?.id ?? null,
      name: deal.company?.name ?? null,
      domain: deal.company?.domainName?.primaryLinkUrl ?? null,
    },
    pointOfContact: {
      id: deal.pointOfContact?.id ?? null,
      name: deal.contactDisplayName,
      email: deal.contactEmail,
      additionalEmails: deal.pointOfContact?.emails?.additionalEmails ?? [],
    },
    amount: deal.amount ?? null,
    amountDisplay: formatAmount(deal.amount),
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
    contextFields: pickContextFields(deal),
    latestNote: latestNote ? noteToJson(latestNote) : null,
    notes: deal.notes.map(noteToJson),
    openTasks: deal.openTasks.map(taskToJson),
    relevantTask: relevantTask ? taskToJson(relevantTask) : null,
    tasks: deal.tasks.map(taskToJson),
    currentPointSuggested: suggestCurrentPoint(deal, {
      latestNote,
      relevantTask,
    }),
  };
}

function noteToJson(note) {
  return {
    id: note.id,
    title: note.title ?? null,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    summary: summarizeMarkdown(note.bodyV2?.markdown),
    bodyMarkdown: note.bodyV2?.markdown ?? '',
  };
}

function taskToJson(task) {
  return {
    id: task.id,
    title: task.title ?? null,
    status: task.status ?? null,
    dueAt: task.dueAt ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    summary: summarizeMarkdown(task.bodyV2?.markdown),
    bodyMarkdown: task.bodyV2?.markdown ?? '',
    assignee: task.assignee
      ? {
          id: task.assignee.id,
          userEmail: task.assignee.userEmail,
          name: personName(task.assignee),
        }
      : null,
  };
}

function pickContextFields(deal) {
  const fields = {};
  for (const fieldName of [
    'businessLineName',
    'campaignName',
    'outreachStatus',
    'iaMujeresFunnelStage',
    'followUpDueAt',
    'lastEmailSentAt',
    'lastReplyAt',
    'meetingStatus',
    'meetingDate',
    'commercialStatus',
    'estadoComercial',
  ]) {
    if (deal[fieldName] !== undefined) fields[fieldName] = deal[fieldName];
  }
  return fields;
}

function suggestCurrentPoint(deal, { latestNote, relevantTask }) {
  const parts = [];

  if (deal.followUpDueAt) parts.push(`follow-up previsto ${formatDateTime(deal.followUpDueAt)}`);
  if (deal.lastReplyAt) parts.push(`ultima respuesta ${formatDateTime(deal.lastReplyAt)}`);
  if (deal.meetingStatus) parts.push(`meetingStatus=${deal.meetingStatus}`);
  if (deal.meetingDate) parts.push(`reunion ${formatDateTime(deal.meetingDate)}`);
  if (relevantTask && isOpenTask(relevantTask)) {
    parts.push(
      `siguiente tarea pendiente: ${taskTitle(relevantTask)}${dueSuffix(
        relevantTask,
      )}`,
    );
  } else if (relevantTask) {
    parts.push(
      `ultima tarea: ${taskTitle(relevantTask)} [${relevantTask.status ?? 'sin estado'}]`,
    );
  }
  if (latestNote) {
    parts.push(`ultima nota: ${summarizeMarkdown(latestNote.bodyV2?.markdown)}`);
  }

  if (parts.length === 0) {
    return 'Sin notas ni tareas recientes; revisar estado manualmente antes de actualizar.';
  }

  return truncate(parts.join('. '), 360);
}

function buildStageLookup(stageOptions) {
  return new Map(stageOptions.map((option) => [option.value, option]));
}

function compareStages(a, b, stageLookup) {
  const aPossible = isPossibleOpportunity(a, stageLookup);
  const bPossible = isPossibleOpportunity(b, stageLookup);
  if (aPossible && !bPossible) return 1;
  if (!aPossible && bPossible) return -1;

  const aPosition = stageLookup.get(a)?.position ?? Number.NEGATIVE_INFINITY;
  const bPosition = stageLookup.get(b)?.position ?? Number.NEGATIVE_INFINITY;
  if (aPosition !== bPosition) return bPosition - aPosition;

  return stageLabel(a, stageLookup).localeCompare(stageLabel(b, stageLookup), 'es');
}

function isPossibleOpportunity(stageValue, stageLookup) {
  const label = stageLookup.get(stageValue)?.label ?? '';
  return (
    stageValue === POSSIBLE_OPPORTUNITY_VALUE ||
    normalizeText(label).includes('posible oportunidad') ||
    normalizeText(label).includes('possible opportunity')
  );
}

function stageLabel(value, stageLookup) {
  const option = stageLookup.get(value);
  if (!value) return '(sin stage)';
  return option ? `${option.label} (${option.value})` : value;
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item) || '(sin valor)';
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort(([a], [b]) => a.localeCompare(b, 'es')),
  );
}

function countByStage(deals, stageLookup) {
  const stageValues = [...new Set(deals.map((deal) => deal.stage))].sort((a, b) =>
    compareStages(a, b, stageLookup),
  );

  return Object.fromEntries(
    stageValues.map((stageValue) => [
      stageLabel(stageValue, stageLookup),
      deals.filter((deal) => deal.stage === stageValue).length,
    ]),
  );
}

function appendCountLines(lines, counts) {
  const entries = Object.entries(counts);
  if (entries.length === 0) {
    lines.push('- sin registros');
    return;
  }

  for (const [key, count] of entries) lines.push(`- ${key}: ${count}`);
}

function countReasons(items) {
  const counts = {};
  for (const item of items) {
    for (const reason of item.reasons) {
      const reasonKey = reason.split('=')[0];
      counts[reasonKey] = (counts[reasonKey] ?? 0) + 1;
    }
  }
  return counts;
}

function noteLine(note) {
  if (!note) return 'sin notas';
  const title = note.title ?? '(sin titulo)';
  const date = formatDateTime(note.updatedAt ?? note.createdAt);
  return `${title} | ${date} | ${summarizeMarkdown(note.bodyV2?.markdown)}`;
}

function taskLine(task, options = {}) {
  if (!task) return 'sin tareas registradas';
  const prefix = options.markNext ? '[siguiente] ' : '';
  const due = task.dueAt ? ` | due ${formatDateTime(task.dueAt)}` : '';
  const status = task.status ?? 'sin estado';
  const summary = summarizeMarkdown(task.bodyV2?.markdown);
  return `${prefix}${taskTitle(task)} | status ${status}${due} | ${summary}`;
}

function contactLine(deal) {
  const name = deal.contactDisplayName;
  return deal.contactEmail ? `${name} <${deal.contactEmail}>` : name;
}

function primaryEmail(person) {
  return person?.emails?.primaryEmail || null;
}

function companyName(deal) {
  return firstText(deal.company?.name, '(sin organizacion)');
}

function dealName(deal) {
  return firstText(deal.name, '(sin nombre)');
}

function taskTitle(task) {
  return task.title ?? '(sin titulo)';
}

function dueSuffix(task) {
  return task.dueAt ? ` (due ${formatDateTime(task.dueAt)})` : '';
}

function summarizeMarkdown(markdown, maxLength = 260) {
  const text = String(markdown ?? '')
    .replace(/!\[[^\]]*]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text ? truncate(text, maxLength) : '(sin contenido)';
}

function hasIaMujeresText(value) {
  const normalized = normalizeText(value);
  return (
    normalized.includes('ia mujeres') ||
    normalized.includes('skilland ia mujeres') ||
    normalized.includes('skiland ia mujeres')
  );
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function firstText(...values) {
  for (const value of values) {
    if (hasValue(value)) return String(value).trim();
  }

  return '';
}

function isOpenTask(task) {
  if (!task?.status) return true;
  return !CLOSED_TASK_STATUSES.has(String(task.status).toUpperCase());
}

function openTaskSort(a, b) {
  const dueDiff = dateValue(a.dueAt, Number.POSITIVE_INFINITY) -
    dateValue(b.dueAt, Number.POSITIVE_INFINITY);
  if (dueDiff !== 0) return dueDiff;
  return descendingRecordDate(a, b);
}

function descendingRecordDate(a, b) {
  return (
    dateValue(b.updatedAt ?? b.createdAt, 0) -
    dateValue(a.updatedAt ?? a.createdAt, 0)
  );
}

function dateValue(value, fallback) {
  const timestamp = Date.parse(value ?? '');
  return Number.isFinite(timestamp) ? timestamp : fallback;
}

function formatDateTime(value) {
  if (!value) return 'sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString('es-ES', {
    timeZone: 'Atlantic/Canary',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function kebab(value) {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

main().catch((error) => {
  if (/TWENTY_API_KEY/.test(error.message)) {
    console.error(error.message);
  } else {
    console.error(error.stack ?? error.message);
  }
  process.exitCode = 1;
});

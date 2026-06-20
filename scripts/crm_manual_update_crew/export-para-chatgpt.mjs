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
const DEFAULT_NOTES_LIMIT = 100;
const DEFAULT_TASKS_LIMIT = 100;
const POSSIBLE_OPPORTUNITY_VALUE = 'POSSIBLE_OPPORTUNITY';
const CLOSED_TASK_STATUSES = new Set([
  'DONE',
  'COMPLETED',
  'COMPLETE',
  'CANCELLED',
  'CANCELED',
  'ARCHIVED',
]);
const FIELD_TYPES_SAFE_TO_QUERY = new Set([
  'TEXT',
  'UUID',
  'BOOLEAN',
  'DATE_TIME',
  'SELECT',
]);
const OPTIONAL_HELPFUL_FIELDS = [
  'lastEmailSubject',
  'lastEmailTemplate',
  'qualityFlags',
];

function parseArgs(argv) {
  const args = {
    outputDir: DEFAULT_OUTPUT_DIR,
    pageSize: DEFAULT_PAGE_SIZE,
    maxPages: DEFAULT_MAX_PAGES,
    notesLimit: DEFAULT_NOTES_LIMIT,
    tasksLimit: DEFAULT_TASKS_LIMIT,
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
  console.log(`Read-only CRM export for ChatGPT

Usage:
  node scripts/crm_manual_update_crew/export-para-chatgpt.mjs
  node scripts/crm_manual_update_crew/export-para-chatgpt.mjs --output-dir=04_outputs/crm_manual_update_session

This script only performs Twenty metadata GET plus GraphQL query operations.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const generatedAt = new Date();
  const timestamp = generatedAt.toISOString().replace(/[:.]/g, '-');
  const outputDir = path.resolve(args.outputDir);
  const markdownPath = path.join(
    outputDir,
    `crm_export_para_chatgpt_${timestamp}.md`,
  );

  const credentials = readTwentyCredentials();
  const client = new TwentyClient(credentials);
  const metadata = await fetchCrmMetadata(client);
  const businessLines = await fetchBusinessLines(client).catch(() => []);
  const stageLookup = buildStageLookup(metadata.stageOptions);
  const queryFieldNames = collectQueryFieldNames(metadata);
  const iaSpecificFieldNames = collectIaSpecificFieldNames(metadata);

  const { opportunities, warnings } = await fetchAllOpportunities({
    client,
    metadata,
    queryFieldNames,
    pageSize: args.pageSize,
    maxPages: args.maxPages,
    notesLimit: args.notesLimit,
    tasksLimit: args.tasksLimit,
  });

  const exclusionResult = excludeIaMujeresDeals(
    opportunities,
    iaSpecificFieldNames,
  );
  const groupedDeals = groupByBusinessLineAndStage(
    exclusionResult.exportedDeals,
    stageLookup,
    businessLines,
  );
  const summary = buildSummary(exclusionResult.exportedDeals);
  const markdown = renderMarkdown({
    generatedAt,
    warnings,
    totalFetched: opportunities.length,
    exportedDeals: exclusionResult.exportedDeals,
    excludedDeals: exclusionResult.excludedDeals,
    groupedDeals,
    stageLookup,
    summary,
    nextStepFieldName: metadata.nextStepFieldName,
  });

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(markdownPath, `${markdown}\n`, 'utf8');

  console.log(`Markdown generado: ${markdownPath}`);
  console.log(`Total deals leidos: ${opportunities.length}`);
  console.log(`Total deals exportados: ${exclusionResult.exportedDeals.length}`);
  console.log(
    `Total deals IA Mujeres excluidos: ${exclusionResult.excludedDeals.length}`,
  );
  console.log('No se escribio nada en CRM');
}

function collectQueryFieldNames(metadata) {
  const names = new Set(metadata.contextFields);

  if (metadata.nextStepFieldName) {
    names.add(metadata.nextStepFieldName);
  }

  for (const fieldName of OPTIONAL_HELPFUL_FIELDS) {
    if (metadata.opportunityFields.has(fieldName)) {
      names.add(fieldName);
    }
  }

  for (const field of metadata.opportunityObject.fields ?? []) {
    if (!FIELD_TYPES_SAFE_TO_QUERY.has(field.type)) continue;

    const label = String(field.label ?? '');
    const name = String(field.name ?? '');
    if (/(ia.?mujeres|mujeres)/i.test(`${name} ${label}`)) {
      names.add(name);
    }
  }

  return [...names];
}

function collectIaSpecificFieldNames(metadata) {
  return (metadata.opportunityObject.fields ?? [])
    .filter((field) => {
      if (!FIELD_TYPES_SAFE_TO_QUERY.has(field.type)) return false;
      const label = String(field.label ?? '');
      const name = String(field.name ?? '');
      return /(ia.?mujeres|mujeres)/i.test(`${name} ${label}`);
    })
    .map((field) => field.name);
}

async function fetchAllOpportunities({
  client,
  metadata,
  queryFieldNames,
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
      buildOpportunitiesQuery(metadata, queryFieldNames),
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

function buildOpportunitiesQuery(metadata, queryFieldNames) {
  const extraFields = queryFieldNames
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
    query CrmExportParaChatGpt(
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
      'Sin business line',
    ),
  };
}

function excludeIaMujeresDeals(opportunities, iaSpecificFieldNames) {
  const exportedDeals = [];
  const excludedDeals = [];

  for (const deal of opportunities) {
    const reasons = iaMujeresReasons(deal, iaSpecificFieldNames);
    if (reasons.length > 0) {
      excludedDeals.push({ deal, reasons });
    } else {
      exportedDeals.push(deal);
    }
  }

  return { exportedDeals, excludedDeals };
}

function iaMujeresReasons(deal, iaSpecificFieldNames) {
  const reasons = [];
  const textChecks = [
    ['businessLine.name', deal.businessLine?.name],
    ['businessLineName', deal.businessLineName],
    ['deal.name', deal.name],
    ['campaignName', deal.campaignName],
    ['company.name', deal.company?.name],
    ['lastEmailSubject', deal.lastEmailSubject],
    ['lastEmailTemplate', deal.lastEmailTemplate],
    ['qualityFlags', deal.qualityFlags],
  ];

  for (const [fieldName, value] of textChecks) {
    if (hasIaMujeresText(value)) {
      reasons.push(`${fieldName} contiene IA Mujeres`);
    }
  }

  if (hasValue(deal.iaMujeresFunnelStage)) {
    reasons.push('iaMujeresFunnelStage con valor');
  }

  for (const fieldName of iaSpecificFieldNames) {
    if (fieldName === 'iaMujeresFunnelStage') continue;
    if (hasValue(deal[fieldName])) {
      reasons.push(`${fieldName} con valor`);
    }
  }

  if (
    deal.notes.some(
      (note) =>
        hasIaMujeresText(note.title) ||
        hasIaMujeresText(note.bodyV2?.markdown),
    )
  ) {
    reasons.push('notas con referencia a IA Mujeres');
  }

  if (
    deal.tasks.some(
      (task) =>
        hasIaMujeresText(task.title) ||
        hasIaMujeresText(task.bodyV2?.markdown),
    )
  ) {
    reasons.push('tareas con referencia a IA Mujeres');
  }

  return [...new Set(reasons)];
}

function buildSummary(deals) {
  const withOpenTasks = deals.filter((deal) => deal.openTasks.length > 0);
  const withOverdueTasks = deals.filter((deal) =>
    deal.openTasks.some(isOverdueTask),
  );

  return {
    withOpenTasks: withOpenTasks.length,
    withOverdueTasks: withOverdueTasks.length,
    withoutOpenTasks: deals.length - withOpenTasks.length,
  };
}

function groupByBusinessLineAndStage(deals, stageLookup, businessLines) {
  const businessLineOrder = new Map(
    [...businessLines]
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
      .map((businessLine, index) => [businessLine.name, index]),
  );
  const businessLineNames = [...new Set(deals.map((deal) => deal.businessLineDisplayName))]
    .sort((a, b) => compareBusinessLines(a, b, businessLineOrder));

  return businessLineNames.map((businessLineName) => {
    const businessLineDeals = deals
      .filter((deal) => deal.businessLineDisplayName === businessLineName)
      .sort(compareDealsForExport);
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

function compareBusinessLines(a, b, businessLineOrder) {
  const aMissing = normalizeText(a) === normalizeText('Sin business line');
  const bMissing = normalizeText(b) === normalizeText('Sin business line');

  if (aMissing && !bMissing) return 1;
  if (!aMissing && bMissing) return -1;

  const aOrder = businessLineOrder.get(a);
  const bOrder = businessLineOrder.get(b);

  if (aOrder !== undefined && bOrder !== undefined && aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  if (aOrder !== undefined) return -1;
  if (bOrder !== undefined) return 1;

  return a.localeCompare(b, 'es');
}

function compareDealsForExport(a, b) {
  const updatedDiff =
    dateValue(b.updatedAt ?? b.createdAt, 0) -
    dateValue(a.updatedAt ?? a.createdAt, 0);
  if (updatedDiff !== 0) return updatedDiff;
  return dealName(a).localeCompare(dealName(b), 'es');
}

function renderMarkdown({
  generatedAt,
  warnings,
  totalFetched,
  exportedDeals,
  excludedDeals,
  groupedDeals,
  stageLookup,
  summary,
  nextStepFieldName,
}) {
  const lines = [];

  lines.push('# CRM Export para ChatGPT - Ronda actualizacion manual');
  lines.push('');
  lines.push(`Generado: ${formatDateTime(generatedAt.toISOString())}`);
  lines.push('Modo: solo lectura');
  lines.push('Sin mutations: si');
  lines.push('IA Mujeres excluido: si');
  lines.push('');
  lines.push('## Resumen');
  lines.push(`- Total deals leidos: ${totalFetched}`);
  lines.push(
    `- Total deals exportados, excluyendo IA Mujeres: ${exportedDeals.length}`,
  );
  lines.push(
    `- Total deals IA Mujeres excluidos: ${excludedDeals.length}`,
  );
  lines.push(`- Total con tareas abiertas: ${summary.withOpenTasks}`);
  lines.push(`- Total con tareas vencidas: ${summary.withOverdueTasks}`);
  lines.push(`- Total sin tareas abiertas: ${summary.withoutOpenTasks}`);

  if (warnings.length > 0) {
    lines.push('');
    lines.push('## Avisos de lectura');
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push('');
  lines.push('# PIPELINE CRM - EXCLUYENDO IA MUJERES');

  for (const businessLineGroup of groupedDeals) {
    lines.push('');
    lines.push(`## BUSINESS LINE: ${businessLineGroup.name}`);

    for (const stageGroup of businessLineGroup.stages) {
      lines.push('');
      lines.push(`### STAGE: ${stageGroup.label}`);

      for (const deal of stageGroup.deals) {
        appendDeal(lines, deal, stageLookup, nextStepFieldName);
      }
    }
  }

  if (groupedDeals.length === 0) {
    lines.push('');
    lines.push('_No hay deals exportables fuera de IA Mujeres._');
  }

  return lines.join('\n').trimEnd();
}

function appendDeal(lines, deal, stageLookup, nextStepFieldName) {
  const recentNotes = deal.notes.slice(0, 3);
  const relevantTask = deal.openTasks[0] ?? deal.tasks[0] ?? null;
  const helpfulContext = pickHelpfulContextFields(deal, nextStepFieldName);

  lines.push('');
  lines.push(`#### ${dealName(deal)}`);
  lines.push(`- Opportunity ID: ${deal.id}`);
  lines.push(`- Business Line: ${deal.businessLineDisplayName}`);
  lines.push(`- Stage: ${stageLabel(deal.stage, stageLookup)}`);
  lines.push(`- Organizacion: ${companyName(deal)}`);
  lines.push(`- Contacto principal: ${deal.contactDisplayName}`);
  lines.push(`- Email: ${deal.contactEmail ?? 'sin email'}`);
  lines.push(`- Value: ${formatAmount(deal.amount)}`);
  lines.push(`- Updated: ${formatDateTime(deal.updatedAt)}`);

  if (recentNotes.length === 0) {
    lines.push('- Ultimas notas: sin notas');
  } else {
    lines.push('- Ultimas notas:');
    for (const note of recentNotes) {
      lines.push(`  - ${noteLine(note)}`);
    }
  }

  if (deal.openTasks.length === 0) {
    lines.push('- Tareas abiertas: sin tareas abiertas');
  } else {
    lines.push('- Tareas abiertas:');
    for (const task of deal.openTasks) {
      lines.push(`  - ${taskLine(task)}`);
    }
  }

  if (relevantTask) {
    lines.push('- Ultima tarea relevante:');
    lines.push(`  - ${taskLine(relevantTask)}`);
  } else {
    lines.push('- Ultima tarea relevante:');
    lines.push('  - sin tareas registradas');
  }

  lines.push('- Punto actual sugerido:');
  lines.push(
    `  - ${suggestCurrentPoint(deal, {
      recentNotes,
      relevantTask,
      nextStepFieldName,
    })}`,
  );

  if (helpfulContext.length > 0) {
    lines.push('- Campos utiles:');
    for (const contextLine of helpfulContext) {
      lines.push(`  - ${contextLine}`);
    }
  }
}

function pickHelpfulContextFields(deal, nextStepFieldName) {
  const lines = [];
  const mappings = [
    ['businessLineName', 'businessLineName'],
    ['campaignName', 'campaignName'],
    ['meetingStatus', 'meetingStatus'],
    ['meetingDate', 'meetingDate'],
    ['followUpDueAt', 'followUpDueAt'],
    ['lastReplyAt', 'lastReplyAt'],
    ['lastEmailSentAt', 'lastEmailSentAt'],
    ['outreachStatus', 'outreachStatus'],
  ];

  if (nextStepFieldName && hasValue(deal[nextStepFieldName])) {
    lines.push(`nextStep: ${formatContextValue(deal[nextStepFieldName])}`);
  }

  for (const [fieldName, label] of mappings) {
    if (!hasValue(deal[fieldName])) continue;
    lines.push(`${label}: ${formatContextValue(deal[fieldName])}`);
  }

  return lines;
}

function formatContextValue(value) {
  if (!hasValue(value)) return 'sin valor';

  const asDate = Date.parse(String(value));
  if (Number.isFinite(asDate)) {
    return formatDateTime(new Date(asDate).toISOString());
  }

  return truncate(String(value), 220);
}

function suggestCurrentPoint(deal, { recentNotes, relevantTask, nextStepFieldName }) {
  const parts = [];

  if (nextStepFieldName && hasValue(deal[nextStepFieldName])) {
    parts.push(`nextStep=${truncate(String(deal[nextStepFieldName]), 120)}`);
  }
  if (deal.followUpDueAt) {
    parts.push(`follow-up previsto ${formatDateTime(deal.followUpDueAt)}`);
  }
  if (deal.lastReplyAt) {
    parts.push(`ultima respuesta ${formatDateTime(deal.lastReplyAt)}`);
  }
  if (deal.lastEmailSentAt) {
    parts.push(`ultimo email enviado ${formatDateTime(deal.lastEmailSentAt)}`);
  }
  if (deal.meetingStatus) {
    parts.push(`meetingStatus=${deal.meetingStatus}`);
  }
  if (deal.meetingDate) {
    parts.push(`reunion ${formatDateTime(deal.meetingDate)}`);
  }
  if (relevantTask && isOpenTask(relevantTask)) {
    parts.push(
      `siguiente tarea pendiente: ${taskTitle(relevantTask)}${taskDueSuffix(
        relevantTask,
      )}`,
    );
  } else if (relevantTask) {
    parts.push(
      `ultima tarea: ${taskTitle(relevantTask)} [${relevantTask.status ?? 'sin estado'}]`,
    );
  }
  if (recentNotes.length > 0) {
    parts.push(
      `ultima nota: ${summarizeMarkdown(
        recentNotes[0].bodyV2?.markdown,
        180,
      )}`,
    );
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
  return option ? option.label : value;
}

function noteLine(note) {
  if (!note) return 'sin notas';
  const title = note.title ?? '(sin titulo)';
  const date = formatDateTime(note.updatedAt ?? note.createdAt);
  return `${title} | ${date} | ${summarizeMarkdown(note.bodyV2?.markdown, 220)}`;
}

function taskLine(task) {
  if (!task) return 'sin tareas registradas';

  const status = task.status ?? 'sin estado';
  const due = task.dueAt ? ` | due ${formatDateTime(task.dueAt)}` : '';
  const overdue = isOverdueTask(task) ? ' | vencida' : '';
  const summary = summarizeMarkdown(task.bodyV2?.markdown, 180);
  return `${taskTitle(task)} | status ${status}${due}${overdue} | ${summary}`;
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
  const squashed = normalized.replace(/\s+/g, '');
  return (
    normalized.includes('ia mujeres') ||
    squashed.includes('iamujeres') ||
    normalized.includes('skilland ia mujeres') ||
    squashed.includes('skillandiamujeres') ||
    normalized.includes('skiland ia mujeres') ||
    squashed.includes('skilandiamujeres')
  );
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function isOpenTask(task) {
  if (!task?.status) return true;
  return !CLOSED_TASK_STATUSES.has(String(task.status).toUpperCase());
}

function isOverdueTask(task) {
  if (!isOpenTask(task) || !task?.dueAt) return false;
  const dueAt = Date.parse(task.dueAt);
  return Number.isFinite(dueAt) && dueAt < Date.now();
}

function openTaskSort(a, b) {
  const dueDiff =
    dateValue(a.dueAt, Number.POSITIVE_INFINITY) -
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

function taskDueSuffix(task) {
  if (!task?.dueAt) return '';
  const suffix = isOverdueTask(task) ? ', vencida' : '';
  return ` (due ${formatDateTime(task.dueAt)}${suffix})`;
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

function primaryEmail(person) {
  return person?.emails?.primaryEmail || null;
}

function firstText(...values) {
  for (const value of values) {
    if (hasValue(value)) return String(value).trim();
  }

  return '';
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

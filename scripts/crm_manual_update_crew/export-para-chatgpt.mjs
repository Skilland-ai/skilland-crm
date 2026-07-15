#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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
const DEFAULT_MAX_RECORDS = 1000;
const MAX_EXPORT_BYTES = 5 * 1024 * 1024;
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
  'MULTI_SELECT',
]);
const EXPLICIT_OPPORTUNITY_FIELDS = new Set([
  'id',
  'name',
  'stage',
  'amount',
  'closeDate',
  'createdAt',
  'updatedAt',
  'businessLine',
  'owner',
  'company',
  'pointOfContact',
  'noteTargets',
  'taskTargets',
]);
const OPTIONAL_HELPFUL_FIELDS = [
  'lastEmailSubject',
  'lastEmailTemplate',
  'qualityFlags',
];

export class CrmExportError extends Error {
  constructor(
    code,
    publicMessage,
    { retryable = false, outcome = 'blocked', cause } = {},
  ) {
    super(publicMessage, cause ? { cause } : undefined);
    this.name = 'CrmExportError';
    this.code = code;
    this.publicMessage = publicMessage;
    this.retryable = retryable;
    this.outcome = outcome;
  }
}

function parseArgs(argv) {
  const args = {
    outputDir: DEFAULT_OUTPUT_DIR,
    pageSize: DEFAULT_PAGE_SIZE,
    maxPages: DEFAULT_MAX_PAGES,
    notesLimit: DEFAULT_NOTES_LIMIT,
    tasksLimit: DEFAULT_TASKS_LIMIT,
    maxRecords: DEFAULT_MAX_RECORDS,
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
    } else if (arg.startsWith('--max-records=')) {
      args.maxRecords = Number(arg.slice('--max-records='.length));
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
The export is create-only, capped at 5 MiB, and reads at most 1000 records.
`);
}

export async function main() {
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
  const result = await generateCrmExportMarkdown({
    client,
    generatedAt,
    pageSize: args.pageSize,
    maxPages: args.maxPages,
    notesLimit: args.notesLimit,
    tasksLimit: args.tasksLimit,
    maxRecords: args.maxRecords,
  });

  await writeLegacyMarkdownCreateOnly({
    markdownPath,
    markdown: result.markdown,
    maxBytes: MAX_EXPORT_BYTES,
  });

  console.log(`Markdown generado: ${markdownPath}`);
  console.log(`Total deals leidos: ${result.counts.fetched}`);
  console.log(`Total deals exportados: ${result.counts.exported}`);
  console.log(
    `Total deals IA Mujeres excluidos: ${result.counts.excluded}`,
  );
  console.log('No se escribio nada en CRM');
}

/**
 * Query-only CRM export service. It never creates files and never writes to CRM.
 * Callers own artifact persistence after this function proves source completeness.
 */
export async function generateCrmExportMarkdown({
  client,
  generatedAt = new Date(),
  pageSize = DEFAULT_PAGE_SIZE,
  maxPages = DEFAULT_MAX_PAGES,
  notesLimit = DEFAULT_NOTES_LIMIT,
  tasksLimit = DEFAULT_TASKS_LIMIT,
  maxRecords = DEFAULT_MAX_RECORDS,
} = {}) {
  validateServiceOptions({
    client,
    generatedAt,
    pageSize,
    maxPages,
    notesLimit,
    tasksLimit,
    maxRecords,
  });

  const queryOnlyClient = createQueryOnlyFacade(client);
  const metadata = await fetchCrmMetadata(queryOnlyClient);
  const fieldPolicy = inspectExclusionFields(metadata);
  let businessLines = [];
  const warnings = [];

  try {
    businessLines = await fetchBusinessLines(queryOnlyClient);
  } catch {
    warnings.push(
      'No se pudo leer el catalogo de business lines; se uso el nombre incluido en cada deal.',
    );
  }

  const stageLookup = buildStageLookup(metadata.stageOptions);
  const queryFieldNames = collectQueryFieldNames(metadata, fieldPolicy);

  const fetched = await fetchAllOpportunities({
    client: queryOnlyClient,
    metadata,
    queryFieldNames,
    pageSize,
    maxPages,
    notesLimit,
    tasksLimit,
    maxRecords,
  });

  const exclusionResult = excludeIaMujeresDeals(
    fetched.opportunities,
    fieldPolicy,
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
    totalFetched: fetched.opportunities.length,
    exportedDeals: exclusionResult.exportedDeals,
    excludedDeals: exclusionResult.excludedDeals,
    groupedDeals,
    stageLookup,
    summary,
    nextStepFieldName: metadata.nextStepFieldName,
  });

  return {
    markdown: `${markdown}\n`,
    counts: {
      fetched: fetched.opportunities.length,
      exported: exclusionResult.exportedDeals.length,
      excluded: exclusionResult.excludedDeals.length,
    },
    warnings: [...new Set(warnings)],
    completeness: {
      complete: true,
      pagesRead: fetched.pagesRead,
      maxRecords,
      notesComplete: true,
      tasksComplete: true,
    },
  };
}

function collectQueryFieldNames(metadata, fieldPolicy) {
  const names = new Set();

  for (const fieldName of metadata.contextFields) {
    addScalarFieldIfQueryable(names, metadata, fieldName);
  }

  if (metadata.nextStepFieldName) {
    addScalarFieldIfQueryable(names, metadata, metadata.nextStepFieldName);
  }

  for (const fieldName of OPTIONAL_HELPFUL_FIELDS) {
    addScalarFieldIfQueryable(names, metadata, fieldName);
  }

  for (const descriptor of fieldPolicy) {
    if (!EXPLICIT_OPPORTUNITY_FIELDS.has(descriptor.name)) {
      names.add(descriptor.name);
    }
  }

  return [...names];
}

function addScalarFieldIfQueryable(names, metadata, fieldName) {
  const field = metadata.opportunityFields.get(fieldName);
  if (!field || !FIELD_TYPES_SAFE_TO_QUERY.has(field.type)) return;
  assertGraphQlFieldName(fieldName);
  if (!EXPLICIT_OPPORTUNITY_FIELDS.has(fieldName)) names.add(fieldName);
}

function inspectExclusionFields(metadata) {
  const descriptors = [];
  const businessLineNameField = metadata.opportunityFields.get(
    'businessLineName',
  );

  if (
    !metadata.hasBusinessLineRelation &&
    (!businessLineNameField ||
      !FIELD_TYPES_SAFE_TO_QUERY.has(businessLineNameField.type))
  ) {
    throw new CrmExportError(
      'CRM_EXPORT_UNQUERYABLE_EXCLUSION_SIGNAL',
      'El export se bloqueo porque no puede consultar de forma completa la business line usada para excluir IA Mujeres.',
    );
  }

  for (const field of metadata.opportunityObject.fields ?? []) {
    const name = String(field.name ?? '');
    const label = String(field.label ?? '');
    const options = (field.options ?? []).map((option) => ({
      value: option.value,
      label: option.label ?? option.value,
    }));
    const identitySignalsIa = hasIaMujeresText(`${name} ${label}`);
    const identitySignalsTags = /(^|[^a-z])(tags?|etiquetas?)([^a-z]|$)/i.test(
      `${name} ${label}`,
    );
    const iaOptionValues = options
      .filter((option) =>
        hasIaMujeresText(`${option.value ?? ''} ${option.label ?? ''}`),
      )
      .map((option) => option.value);

    if (!identitySignalsIa && !identitySignalsTags && iaOptionValues.length === 0) {
      continue;
    }

    if (!FIELD_TYPES_SAFE_TO_QUERY.has(field.type)) {
      throw new CrmExportError(
        'CRM_EXPORT_UNQUERYABLE_EXCLUSION_SIGNAL',
        'El export se bloqueo porque existe una senal de IA Mujeres o tags que este lector no puede consultar de forma completa.',
      );
    }

    assertGraphQlFieldName(name);
    descriptors.push({
      name,
      identitySignalsIa,
      identitySignalsTags,
      iaOptionValues,
    });
  }

  return descriptors;
}

async function fetchAllOpportunities({
  client,
  metadata,
  queryFieldNames,
  pageSize,
  maxPages,
  notesLimit,
  tasksLimit,
  maxRecords,
}) {
  const opportunities = [];
  let after = null;
  let page = 0;
  let sourceComplete = false;

  while (page < maxPages) {
    const remaining = maxRecords - opportunities.length;
    if (remaining <= 0) {
      throw new CrmExportError(
        'CRM_EXPORT_RECORD_LIMIT_EXCEEDED',
        `El origen contiene mas de ${maxRecords} oportunidades; no se genero ningun artefacto.`,
      );
    }

    page += 1;
    const data = await gqlQuery(
      client,
      buildOpportunitiesQuery(metadata, queryFieldNames),
      {
        first: Math.min(pageSize, remaining),
        after,
        notesFirst: notesLimit,
        tasksFirst: tasksLimit,
      },
    );
    const connection = data.opportunities;
    assertCompleteConnection(connection, 'opportunities');

    if (connection.edges.length > remaining) {
      throw new CrmExportError(
        'CRM_EXPORT_RECORD_LIMIT_EXCEEDED',
        `El origen devolvio mas de ${maxRecords} oportunidades; no se genero ningun artefacto.`,
      );
    }

    for (const edge of connection.edges) {
      opportunities.push(normalizeOpportunity(edge.node));
    }

    if (!connection.pageInfo.hasNextPage) {
      sourceComplete = true;
      break;
    }
    if (opportunities.length >= maxRecords) {
      throw new CrmExportError(
        'CRM_EXPORT_RECORD_LIMIT_EXCEEDED',
        `El origen contiene mas de ${maxRecords} oportunidades; no se genero ningun artefacto.`,
      );
    }
    if (
      typeof connection.pageInfo.endCursor !== 'string' ||
      !connection.pageInfo.endCursor ||
      connection.pageInfo.endCursor === after
    ) {
      throw new CrmExportError(
        'CRM_EXPORT_INVALID_PAGINATION',
        'El origen indico otra pagina sin proporcionar un cursor nuevo; no se genero ningun artefacto.',
      );
    }
    after = connection.pageInfo.endCursor;
  }

  if (!sourceComplete) {
    throw new CrmExportError(
      'CRM_EXPORT_PAGE_LIMIT_REACHED',
      `Se alcanzo el limite de ${maxPages} paginas sin demostrar que el origen estuviera completo; no se genero ningun artefacto.`,
    );
  }

  return { opportunities, pagesRead: page };
}

function assertCompleteConnection(connection, name) {
  if (
    !connection ||
    !Array.isArray(connection.edges) ||
    !connection.pageInfo ||
    typeof connection.pageInfo.hasNextPage !== 'boolean'
  ) {
    throw new CrmExportError(
      'CRM_EXPORT_INCOMPLETE_PAGE_INFO',
      `El origen no devolvio pageInfo completo para ${name}; no se genero ningun artefacto.`,
    );
  }
}

export async function gqlQuery(client, query, variables) {
  assertGraphQlQuery(query);
  return client.gql(query, variables);
}

export function assertGraphQlQuery(query) {
  const compact = query.replace(/#[^\n]*/g, '').trim();

  if (!/^query\b/i.test(compact)) {
    throw new CrmExportError(
      'CRM_EXPORT_NON_QUERY_BLOCKED',
      'El guard de solo lectura bloqueo una operacion GraphQL que no era query.',
    );
  }
  if (/\bmutation\b/i.test(compact)) {
    throw new CrmExportError(
      'CRM_EXPORT_MUTATION_BLOCKED',
      'El guard de solo lectura bloqueo una mutation GraphQL.',
    );
  }
}

function createQueryOnlyFacade(client) {
  return Object.freeze({
    gql(query, variables) {
      return gqlQuery(client, query, variables);
    },
    metadataObjects() {
      if (typeof client.metadataObjects !== 'function') {
        throw new CrmExportError(
          'CRM_EXPORT_READER_INVALID',
          'El lector CRM no ofrece el endpoint de metadata de solo lectura.',
        );
      }
      return client.metadataObjects();
    },
  });
}

function assertGraphQlFieldName(fieldName) {
  if (!/^[_A-Za-z][_0-9A-Za-z]*$/.test(fieldName)) {
    throw new CrmExportError(
      'CRM_EXPORT_INVALID_FIELD_NAME',
      'La metadata contiene un nombre de campo que no puede interpolarse de forma segura en GraphQL.',
    );
  }
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

function normalizeOpportunity(opportunity) {
  if (!opportunity || typeof opportunity !== 'object') {
    throw new CrmExportError(
      'CRM_EXPORT_INVALID_RECORD',
      'El origen devolvio una oportunidad invalida; no se genero ningun artefacto.',
    );
  }

  const noteTargets = opportunity.noteTargets;
  const taskTargets = opportunity.taskTargets;
  assertCompleteConnection(noteTargets, 'noteTargets');
  assertCompleteConnection(taskTargets, 'taskTargets');

  if (noteTargets.pageInfo.hasNextPage) {
    throw new CrmExportError(
      'CRM_EXPORT_NOTES_TRUNCATED',
      'Al menos una oportunidad tiene notas truncadas; no se genero ningun artefacto porque no puede demostrarse la exclusion de IA Mujeres.',
    );
  }
  if (taskTargets.pageInfo.hasNextPage) {
    throw new CrmExportError(
      'CRM_EXPORT_TASKS_TRUNCATED',
      'Al menos una oportunidad tiene tareas truncadas; no se genero ningun artefacto porque no puede demostrarse la exclusion de IA Mujeres.',
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

function excludeIaMujeresDeals(opportunities, fieldPolicy) {
  const exportedDeals = [];
  const excludedDeals = [];

  for (const deal of opportunities) {
    const reasons = iaMujeresReasons(deal, fieldPolicy);
    if (reasons.length > 0) {
      excludedDeals.push({ deal, reasons });
    } else {
      exportedDeals.push(deal);
    }
  }

  return { exportedDeals, excludedDeals };
}

function iaMujeresReasons(deal, fieldPolicy) {
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

  for (const descriptor of fieldPolicy) {
    const value = deal[descriptor.name];
    if (
      descriptor.identitySignalsIa &&
      descriptor.name !== 'iaMujeresFunnelStage' &&
      hasValue(value)
    ) {
      reasons.push(`${descriptor.name} con valor`);
    }
    if (descriptor.identitySignalsTags && hasIaMujeresText(value)) {
      reasons.push(`${descriptor.name} contiene IA Mujeres`);
    }
    if (
      descriptor.iaOptionValues.some((optionValue) =>
        scalarOrArrayIncludes(value, optionValue),
      )
    ) {
      reasons.push(`${descriptor.name} selecciona IA Mujeres`);
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
    ['commercialStatus', 'commercialStatus'],
    ['estadoComercial', 'estadoComercial'],
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

function scalarOrArrayIncludes(value, expected) {
  const values = Array.isArray(value) ? value : [value];
  return values.some((item) => String(item ?? '') === String(expected ?? ''));
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

function validateServiceOptions(options) {
  if (!options.client || typeof options.client.gql !== 'function') {
    throw new CrmExportError(
      'CRM_EXPORT_READER_INVALID',
      'Se requiere un lector CRM de solo lectura.',
    );
  }
  if (!(options.generatedAt instanceof Date) || Number.isNaN(options.generatedAt.getTime())) {
    throw new CrmExportError(
      'CRM_EXPORT_CLOCK_INVALID',
      'La fecha de generacion no es valida.',
    );
  }

  for (const name of [
    'pageSize',
    'maxPages',
    'notesLimit',
    'tasksLimit',
    'maxRecords',
  ]) {
    const value = options[name];
    if (!Number.isInteger(value) || value < 1 || value > 1000) {
      throw new CrmExportError(
        'CRM_EXPORT_LIMIT_INVALID',
        `${name} debe ser un entero entre 1 y 1000.`,
      );
    }
  }
}

async function writeLegacyMarkdownCreateOnly({ markdownPath, markdown, maxBytes }) {
  const bytes = Buffer.byteLength(markdown, 'utf8');
  if (bytes > maxBytes) {
    throw new CrmExportError(
      'CRM_EXPORT_ARTIFACT_TOO_LARGE',
      `El Markdown supera el limite de ${maxBytes} bytes; no se genero ningun artefacto.`,
    );
  }

  await fs.mkdir(path.dirname(markdownPath), { recursive: true });
  let handle = null;
  let created = false;

  try {
    handle = await fs.open(markdownPath, 'wx', 0o600);
    created = true;
    await handle.writeFile(markdown, 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
    }
    if (created) {
      await fs.unlink(markdownPath).catch(() => {});
    }
    throw error;
  }
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (isDirectExecution()) {
  main().catch((error) => {
    if (error instanceof CrmExportError) {
      console.error(`${error.code}: ${error.publicMessage}`);
    } else if (/TWENTY_API_KEY/.test(String(error?.message ?? ''))) {
      console.error('TWENTY_API_KEY no esta disponible.');
    } else {
      console.error('CRM_EXPORT_FAILED: el export fallo sin crear un artefacto completo.');
    }
    process.exitCode = 1;
  });
}

#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

import { parseCrmActionRequest } from './kernel/contracts.mjs';
import { CrmExecutionLogger } from './kernel/logger.mjs';
import { runDeterministicKernel } from './kernel/orchestrator.mjs';
import { fetchCrmMetadata } from '../crm_manual_update_crew/metadata.mjs';
import { fetchBusinessLines } from '../crm_manual_update_crew/retriever.mjs';
import {
  TwentyClient,
  readTwentyCredentials,
} from '../crm_manual_update_crew/twenty-client.mjs';

const DEFAULT_OUTPUT_DIR =
  '04_outputs/crm_execution_crew/urgent_partial_update_2026-06-14';
const SOURCE_TYPE = 'crm_urgent_partial_update';
const SOURCE_FILE = 'urgent-partial-update-2026-06-14';
const BUSINESS_LINE_EU = 'Skilland EU Platform';
const REQUESTER = 'crm_urgent_partial_update_2026_06_14';
const DRY_RUN = 'dry_run';
const APPLY = 'apply';

const REQUIRED_STAGES = [
  'PENDING_SIGNATURE',
  'IN_EXECUTION',
  'CLOSED',
  'PROPUESTA_PRESENTADA_NEGOCIACION',
];

const REQUIRED_EXISTING_DEALS = {
  casaAfricaTraining: [
    'Casa África — AfricanTech Curso 1 (junio 2026)',
    'Casa África — Paquete Formativo AfricanTech',
  ],
  femepaPlatform: [
    'FEMEPA — Plataforma EU',
    'FEMEPA / Consorcio Casa África — Plataforma EU',
  ],
  epi10: ['EPI 10 - DISCOVERY CONSULTING'],
  bootcampEjercito: ['Bootcamp Ejército - Pedro León Millán'],
  sciencePilot: ['Science for Change — Piloto Plataforma (1 Creator + 20 Student)'],
  upct: ['UPCT — Piloto Microcredenciales'],
  ulpgc: ['ULPGC — Microcredenciales'],
  turismoCamara: ['Turismo Camara Comercio - jornada Raul'],
  bootcampPaula: ['Bootcamp Paula'],
  eros: ['Eros Calixto - Full Stack Bootcamp'],
  proexca: ['Proexca — IA para Directivos'],
  fgull: ['FGULL — Proyectos Microcredenciales (Plugin Moodle + Motor IA)'],
};

const CREATE_OR_UPDATE_DEALS = {
  casaAfricaCourse2: 'Casa África — AfricanTech Curso 2 (noviembre 2026)',
  casaAfricaPlatform: 'Casa África — Plataforma EU',
  camaraTenerifePlatform: 'Cámara de Comercio de Tenerife — Plataforma EU',
  femetePlatform: 'FEMETE — Plataforma EU',
};

const COMPANY_NAMES = {
  casaAfrica: 'Casa África',
  femepa: 'FEMEPA',
  camaraTenerife: 'Cámara de Comercio de Tenerife',
  femete: 'FEMETE',
};

const GMAIL_EVIDENCE = {
  casaAfrica:
    'Gmail read-only: hilo "Propuesta Plataforma AfricanTech" confirma intercambio con Yurena entre 10-12/06/2026; Yurena propuso llamada y el 12/06 indicó que llamaría al liberarse. El hilo también confirma que FEMEPA avanzaba/cerraba y que FEMETE y Cámara Tenerife seguían pendientes.',
  femepa:
    'Gmail read-only: Raúl Batista (FEMEPA) envió el 10/06/2026 contratos firmados; el contrato de encargo ya constaba firmado por ambas partes y el contrato FEMEPA traía cambios menores para evaluación del servicio.',
  bootcampEjercito:
    'Gmail read-only: el 01/06/2026 Pedro León pidió presupuesto actualizado, incluyendo n8n/automatización; se enviaron sílabos y presupuestos, y Pedro respondió "Recibido... Los tramitamos". No consta cierre posterior en el hilo leído.',
  science:
    'Gmail read-only: Leticia/Science for Change indicó el 05/05/2026 que valorarían internamente la propuesta; el 11/05 se propuso reunión para aterrizar piloto. No se detectó respuesta sustantiva posterior en el hilo leído.',
  upct:
    'Gmail read-only: Josefa indicó el 11/05/2026 que ya había informado a la Vicerrectora y quedaba a la espera de hueco para reunión. No se detectó cierre posterior en el hilo leído.',
  epi10:
    'Gmail read-only: el 12/06/2026 se envió a Carmen y Tomás la propuesta técnica y económica "EPI10 Salud MVP 1.0"; el mensaje plantea revisar, resolver dudas y, si hay OK, agendar kick-off operativo.',
  fgull:
    'Gmail read-only: hay invitación aceptada para "Recap Coordinación Proyecto Microcredenciales" el 18/06/2026 12:30-13:30 WEST con Fer, Romina y contactos FGULL. Contexto de Ricardo pendiente de verificación específica.',
};

function parseArgs(argv) {
  const args = {
    mode: DRY_RUN,
    yes: false,
    outputDir: DEFAULT_OUTPUT_DIR,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') args.mode = DRY_RUN;
    else if (arg === '--apply') args.mode = APPLY;
    else if (arg === '--yes') args.yes = true;
    else if (arg.startsWith('--output-dir=')) {
      args.outputDir = arg.slice('--output-dir='.length);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.mode === APPLY && !args.yes) {
    throw new Error('Apply requires --yes for this one-off script.');
  }

  return args;
}

function printHelp() {
  console.log(`Urgent partial CRM update 2026-06-14

Usage:
  node scripts/crm_execution_crew/urgent-partial-update-2026-06-14.mjs --dry-run
  node scripts/crm_execution_crew/urgent-partial-update-2026-06-14.mjs --apply --yes
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const outputDir = path.resolve(args.outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  const client = new TwentyClient(readTwentyCredentials());
  const metadata = await fetchCrmMetadata(client);
  const businessLines = await fetchBusinessLines(client);
  const snapshot = await fetchWorkspaceSnapshot(client);
  const context = buildContext({ metadata, businessLines, snapshot });
  const preflight = validatePreflight(context);
  const externalOperations = [];

  if (preflight.blockers.length === 0) {
    await prepareMissingCompanies({
      client,
      context,
      apply: args.mode === APPLY,
      externalOperations,
    });
  }

  const request = buildCrmActionRequest(context);
  const requestPath = path.join(outputDir, 'urgent_partial_update.request.json');
  await fs.writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, 'utf8');

  let crewResult = null;
  if (preflight.blockers.length === 0) {
    crewResult = await runCrew({
      client,
      request,
      effectiveMode: args.mode,
      applyRequested: args.mode === APPLY,
      confirmationProvided: args.yes,
      outputDir,
    });
  }

  if (
    args.mode === APPLY &&
    crewResult?.status === 'apply_completed' &&
    preflight.blockers.length === 0
  ) {
    await applyPostCrewOperations({
      client,
      context,
      outputDir,
      externalOperations,
    });
  } else if (args.mode === DRY_RUN && preflight.blockers.length === 0) {
    planPostCrewOperations({ context, externalOperations });
  }

  const verification =
    args.mode === APPLY
      ? await verifyAfterApply({ client, context, outputDir })
      : null;

  const summary = buildSummary({
    mode: args.mode,
    startedAt,
    outputDir,
    requestPath,
    preflight,
    request,
    crewResult,
    externalOperations,
    verification,
  });
  const summaryPath = path.join(
    outputDir,
    args.mode === APPLY
      ? 'urgent_partial_update_apply_summary.json'
      : 'urgent_partial_update_dry_run_summary.json',
  );
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');

  printRunSummary(summary);

  if (summary.blockers.length > 0 || crewResult?.status === 'blocked') {
    process.exitCode = 1;
  }
}

async function runCrew({
  client,
  request,
  effectiveMode,
  applyRequested,
  confirmationProvided,
  outputDir,
}) {
  const parsed = parseCrmActionRequest(request);
  const deterministic = await runDeterministicKernel({
    request: parsed,
    client,
    effectiveMode,
    applyRequested,
    confirmationProvided,
  });
  const agentArtifacts = [
    deterministic.metadataArtifact,
    deterministic.recordArtifact,
    deterministic.review,
    deterministic.executionArtifact,
  ];
  const warnings = agentArtifacts.flatMap((artifact) => artifact.warnings ?? []);
  const blockingIssues = agentArtifacts.flatMap(
    (artifact) => artifact.blockingIssues ?? [],
  );
  const logger = new CrmExecutionLogger({ outputDir });
  const logPath = logger.finish({
    requestId: parsed.requestId,
    requester: parsed.requester,
    effectiveMode,
    request: parsed,
    agentArtifacts,
    operationPlan: deterministic.operationPlan,
    review: deterministic.review,
    executionResult: deterministic.executionResult,
    warnings,
    blockingIssues,
  });

  return {
    requestId: parsed.requestId,
    effectiveMode,
    status: deterministic.review.approved
      ? deterministic.executionResult.status
      : 'blocked',
    logPath,
    operationPlan: deterministic.operationPlan,
    review: deterministic.review,
    executionResult: deterministic.executionResult,
    warnings,
    blockingIssues,
  };
}

async function fetchWorkspaceSnapshot(client) {
  const data = await client.gql(`
    query UrgentPartialUpdateSnapshot {
      opportunities(first: 500) {
        edges {
          node {
            id
            name
            stage
            businessLineName
            campaignName
            iaMujeresFunnelStage
            amount {
              amountMicros
              currencyCode
            }
            businessLine {
              id
              name
            }
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
            taskTargets(first: 200) {
              edges {
                node {
                  task {
                    id
                    title
                    status
                    dueAt
                    updatedAt
                  }
                }
              }
            }
          }
        }
      }
      companies(first: 500) {
        edges {
          node {
            id
            name
            domainName {
              primaryLinkUrl
            }
          }
        }
      }
    }
  `);

  return {
    opportunities: edgesToNodes(data.opportunities),
    companies: edgesToNodes(data.companies),
  };
}

function buildContext({ metadata, businessLines, snapshot }) {
  const stageValues = new Set(metadata.stageOptions.map((option) => option.value));
  const taskStatusValues = new Set(
    metadata.taskStatusOptions.map((option) => option.value),
  );
  const businessLineByName = new Map(
    businessLines.map((businessLine) => [businessLine.name, businessLine]),
  );
  const opportunitiesByExactName = indexByExactName(snapshot.opportunities);
  const companiesByExactName = indexByExactName(snapshot.companies);
  const targetDeals = {};
  const createdOrExistingDeals = {};

  for (const [key, names] of Object.entries(REQUIRED_EXISTING_DEALS)) {
    targetDeals[key] = resolveByNames(opportunitiesByExactName, names);
  }

  for (const [key, name] of Object.entries(CREATE_OR_UPDATE_DEALS)) {
    createdOrExistingDeals[key] = resolveByNames(opportunitiesByExactName, [name], {
      optional: true,
    });
  }

  return {
    metadata,
    businessLines,
    businessLineByName,
    stageValues,
    taskStatusValues,
    snapshot,
    opportunitiesByExactName,
    companiesByExactName,
    targetDeals,
    createdOrExistingDeals,
    companies: {
      casaAfrica: resolveByNames(companiesByExactName, [COMPANY_NAMES.casaAfrica], {
        optional: true,
      }),
      femepa: resolveByNames(companiesByExactName, [COMPANY_NAMES.femepa], {
        optional: true,
      }),
      camaraTenerife: resolveByNames(
        companiesByExactName,
        [COMPANY_NAMES.camaraTenerife],
        { optional: true },
      ),
      femete: resolveByNames(companiesByExactName, [COMPANY_NAMES.femete], {
        optional: true,
      }),
    },
    blockers: [],
    warnings: [],
  };
}

function validatePreflight(context) {
  const blockers = [];
  const warnings = [];

  for (const stage of REQUIRED_STAGES) {
    if (!context.stageValues.has(stage)) {
      blockers.push(`Missing required stage option: ${stage}`);
    }
  }
  if (!context.taskStatusValues.has('DONE')) {
    blockers.push('Task status DONE is not available.');
  }
  if (!context.businessLineByName.has(BUSINESS_LINE_EU)) {
    blockers.push(`Business line not found: ${BUSINESS_LINE_EU}`);
  }

  for (const [key, deal] of Object.entries(context.targetDeals)) {
    if (!deal) {
      blockers.push(`Required existing deal not found or ambiguous: ${key}`);
      continue;
    }
    if (isIaMujeresDeal(deal)) {
      blockers.push(`Refusing IA Mujeres target deal: ${deal.name}`);
    }
  }

  for (const [key, deal] of Object.entries(context.createdOrExistingDeals)) {
    if (deal && isIaMujeresDeal(deal)) {
      blockers.push(`Refusing IA Mujeres existing split deal: ${key} / ${deal.name}`);
    }
  }

  for (const key of ['casaAfrica', 'femepa']) {
    if (!context.companies[key]) {
      blockers.push(`Required existing company not found: ${key}`);
    }
  }

  return { blockers, warnings };
}

async function prepareMissingCompanies({
  client,
  context,
  apply,
  externalOperations,
}) {
  const missingCompanySpecs = [
    { key: 'camaraTenerife', name: COMPANY_NAMES.camaraTenerife },
    { key: 'femete', name: COMPANY_NAMES.femete },
  ];

  for (const spec of missingCompanySpecs) {
    if (context.companies[spec.key]) {
      externalOperations.push({
        type: 'company_reused',
        status: 'already_exists',
        key: spec.key,
        id: context.companies[spec.key].id,
        name: context.companies[spec.key].name,
      });
      continue;
    }

    const data = {
      name: spec.name,
      businessLineName: BUSINESS_LINE_EU,
      sourceType: SOURCE_TYPE,
      sourceFile: SOURCE_FILE,
    };

    if (!apply) {
      externalOperations.push({
        type: 'create_company',
        status: 'planned',
        key: spec.key,
        data,
      });
      continue;
    }

    const response = await client.gql(
      `mutation UrgentPartialCreateCompany($data: CompanyCreateInput!) {
        createCompany(data: $data) {
          id
          name
        }
      }`,
      { data },
    );
    const created = response.createCompany;
    if (!created?.id) {
      throw new Error(`Company creation failed for ${spec.name}.`);
    }
    context.companies[spec.key] = created;
    externalOperations.push({
      type: 'create_company',
      status: 'applied',
      key: spec.key,
      result: created,
    });
  }
}

function buildCrmActionRequest(context) {
  const operations = [];
  const euLine = context.businessLineByName.get(BUSINESS_LINE_EU);
  const euLineData = businessLineData(euLine);

  addUpdateOpportunity(operations, context.targetDeals.casaAfricaTraining, {
    name: 'Casa África — AfricanTech Curso 1 (junio 2026)',
    stage: 'PENDING_SIGNATURE',
    amount: money(2500, 'EUR'),
    ...euLineData,
  });
  addNote(
    operations,
    context.targetDeals.casaAfricaTraining,
    'Actualización comercial — Casa África AfricanTech cursos 2026',
    [
      'Conversación telefónica con Yurena Ojeda el 12/06/2026.',
      '',
      '- El paquete formativo original de 4 cursos / 10.000 EUR deja de representar la realidad comercial 2026.',
      '- En 2026 se mantienen dos cursos: curso 1 en junio junto con plataforma, y curso 2 previsto para contratación/adjudicación en Q4, probablemente noviembre.',
      '- Los otros dos cursos quedan como contexto para otro ejercicio y no deben mantenerse como pipeline activo 2026.',
      `- ${GMAIL_EVIDENCE.casaAfrica}`,
    ].join('\n'),
  );
  addTask(
    operations,
    context.targetDeals.casaAfricaTraining,
    'Preparar/enviar oferta, memoria técnica y presupuesto conjunto Casa África — plataforma + curso 1',
    'Presentar oferta, memoria técnica y presupuesto conjunto con la plataforma, integrando curso 1 y parte de plataforma de Casa África.',
    dueAtMadrid('2026-06-16'),
  );
  addTask(
    operations,
    context.targetDeals.casaAfricaTraining,
    'Buscar tres proveedores/presupuestos adicionales para Casa África / AfricanTech',
    'Preparar tres referencias/proveedores/presupuestos adicionales si hacen falta para articular contratación.',
    dueAtMadrid('2026-06-16'),
  );

  upsertOpportunityWithNoteAndTask({
    operations,
    existingDeal: context.createdOrExistingDeals.casaAfricaCourse2,
    data: {
      name: CREATE_OR_UPDATE_DEALS.casaAfricaCourse2,
      stage: 'PENDING_SIGNATURE',
      amount: money(2500, 'EUR'),
      companyId: context.companies.casaAfrica.id,
      pointOfContactId: context.targetDeals.casaAfricaTraining.pointOfContact?.id,
      ...euLineData,
    },
    note: {
      title: 'Contexto comercial — AfricanTech Curso 2 Q4 2026',
      markdown: [
        'Segundo curso de Casa África/AfricanTech previsto para Q4 2026, probablemente noviembre.',
        '',
        '- Separado del curso 1 para reflejar la contratación real por fases.',
        '- Mantener como pendiente de firma porque la contratación está prevista pero no formalizada.',
        '- No crear deals 2026 para los otros dos cursos del paquete original; quedan como contexto para otro ejercicio.',
      ].join('\n'),
    },
    task: {
      title: 'Tantear contratación Q4 Casa África — AfricanTech Curso 2',
      markdown:
        'Segundo curso previsto para adjudicación/contratación en Q4, probablemente noviembre. Tantear timing, presupuesto y vía administrativa.',
      dueAt: dueAtMadrid('2026-10-01'),
    },
  });

  addCloseTaskByTitle(
    operations,
    context.targetDeals.femepaPlatform,
    'Seguimiento Consorcio',
  );
  addUpdateOpportunity(operations, context.targetDeals.femepaPlatform, {
    name: 'FEMEPA — Plataforma EU',
    stage: 'IN_EXECUTION',
    amount: money(4000, 'EUR'),
    ...euLineData,
  });
  addNote(
    operations,
    context.targetDeals.femepaPlatform,
    'Split comercial — Plataforma EU consorcio AfricanTech',
    [
      'El deal original de 16.000 EUR mezclaba cuatro contrataciones de plataforma.',
      '',
      '- Se parte en cuatro oportunidades independientes de 4.000 EUR: FEMEPA, Casa África, Cámara de Comercio de Tenerife y FEMETE.',
      '- La tarea antigua "Seguimiento Consorcio" queda obsoleta y se marca como DONE.',
      '- El deal original se reutiliza como FEMEPA — Plataforma EU para evitar duplicados.',
    ].join('\n'),
  );
  addNote(
    operations,
    context.targetDeals.femepaPlatform,
    'Estado comercial — FEMEPA Plataforma EU firmado/vendido',
    [
      'FEMEPA es el socio más adelantado del consorcio AfricanTech.',
      '',
      '- Estado comercial: firmado/vendido.',
      '- Se mueve a En ejecución.',
      `- ${GMAIL_EVIDENCE.femepa}`,
    ].join('\n'),
  );

  upsertOpportunityWithNoteAndTask({
    operations,
    existingDeal: context.createdOrExistingDeals.casaAfricaPlatform,
    data: {
      name: CREATE_OR_UPDATE_DEALS.casaAfricaPlatform,
      stage: 'PENDING_SIGNATURE',
      amount: money(4000, 'EUR'),
      companyId: context.companies.casaAfrica.id,
      pointOfContactId: context.targetDeals.casaAfricaTraining.pointOfContact?.id,
      ...euLineData,
    },
    note: {
      title: 'Estado comercial — Casa África Plataforma EU',
      markdown: [
        'Yurena validó/OK a la parte de plataforma de Casa África.',
        '',
        '- Hay que presentar memoria técnica junto con la propuesta del primer curso AfricanTech de junio.',
        `- ${GMAIL_EVIDENCE.casaAfrica}`,
      ].join('\n'),
    },
    task: {
      title: 'Preparar memoria técnica conjunta Casa África — plataforma + curso 1',
      markdown:
        'Preparar memoria técnica conjunta para plataforma + curso 1 de Casa África/AfricanTech.',
      dueAt: dueAtMadrid('2026-06-16'),
    },
  });

  upsertOpportunityWithNoteAndTask({
    operations,
    existingDeal: context.createdOrExistingDeals.camaraTenerifePlatform,
    data: {
      name: CREATE_OR_UPDATE_DEALS.camaraTenerifePlatform,
      stage: 'PENDING_SIGNATURE',
      amount: money(4000, 'EUR'),
      companyId: context.companies.camaraTenerife?.id,
      ...euLineData,
    },
    note: {
      title: 'Estado comercial — Cámara Tenerife Plataforma EU',
      markdown: [
        'Socio con menos interacciones directas dentro del consorcio AfricanTech.',
        '',
        '- Bloqueo principal: cómo articular adjudicación/contratación pública.',
        '- Hay que dar claridad de próximos pasos y evitar que se enfríe.',
        '- Pendiente localizar teléfono/interlocutor directo.',
      ].join('\n'),
    },
    task: {
      title: 'Contactar Cámara Tenerife — desbloquear contratación Plataforma EU',
      markdown:
        'Localizar teléfono/interlocutor, contactar, alinear siguientes pasos y aclarar vía de contratación pública.',
      dueAt: dueAtMadrid('2026-06-17'),
    },
  });

  upsertOpportunityWithNoteAndTask({
    operations,
    existingDeal: context.createdOrExistingDeals.femetePlatform,
    data: {
      name: CREATE_OR_UPDATE_DEALS.femetePlatform,
      stage: 'PENDING_SIGNATURE',
      amount: money(4000, 'EUR'),
      companyId: context.companies.femete?.id,
      ...euLineData,
    },
    note: {
      title: 'Estado comercial — FEMETE Plataforma EU',
      markdown: [
        'Caso similar a FEMEPA, pero todavía sin conversación directa suficiente.',
        '',
        '- No es adjudicación pública; debería articularse como contrato comercial.',
        '- Hay que activar contacto directo por teléfono.',
      ].join('\n'),
    },
    task: {
      title: 'Localizar contacto/teléfono FEMETE y activar cierre Plataforma EU',
      markdown:
        'Localizar contacto/teléfono FEMETE y activar cierre comercial de Plataforma EU.',
      dueAt: dueAtMadrid('2026-06-17'),
    },
  });

  addNote(
    operations,
    context.targetDeals.epi10,
    'Actualización comercial — propuesta EPI10 MVP enviada',
    [
      'Propuesta presentada el 12/06/2026.',
      '',
      '- El proyecto mutó desde automatizaciones/scope sencillo a desarrollo software serio.',
      '- Carmen indicó que la revisaría el lunes 15/06/2026.',
      `- ${GMAIL_EVIDENCE.epi10}`,
    ].join('\n'),
  );
  addTask(
    operations,
    context.targetDeals.epi10,
    'Follow-up Carmen — revisión propuesta EPI10',
    'Hacer follow-up con Carmen sobre revisión de propuesta EPI10 MVP 1.0 y decidir si se avanza a OK/kick-off.',
    dueAtMadrid('2026-06-16'),
  );

  addNote(
    operations,
    context.targetDeals.bootcampEjercito,
    'Estado comercial — propuesta Bootcamp Ejército',
    [
      'Sin actualización conocida desde envío de propuesta.',
      '',
      `- ${GMAIL_EVIDENCE.bootcampEjercito}`,
      '- Próximo paso: follow-up para conocer estado de tramitación y si hay bloqueos.',
    ].join('\n'),
  );
  addTask(
    operations,
    context.targetDeals.bootcampEjercito,
    'Follow-up Pedro León Millán — propuesta Bootcamp Ejército',
    'Contactar a Pedro León Millán para revisar estado de tramitación de la propuesta y próximos pasos.',
    dueAtMadrid('2026-06-19'),
  );

  addNote(
    operations,
    context.targetDeals.sciencePilot,
    'Estado comercial — Science for Change piloto plataforma',
    [
      'Sin respuesta clara tras propuesta y follow-up anterior.',
      '',
      `- ${GMAIL_EVIDENCE.science}`,
      '- Próximo paso: follow-up serio para decidir sí/no o identificar bloqueos.',
    ].join('\n'),
  );
  addTask(
    operations,
    context.targetDeals.sciencePilot,
    'Follow-up serio Science for Change — decidir sí/no o bloqueos',
    'Pedir respuesta clara sobre el piloto, bloqueos internos o decisión de no avanzar.',
    dueAtMadrid('2026-06-16'),
  );

  addCloseTaskByTitle(
    operations,
    context.targetDeals.upct,
    'Escribir a Josefa (UPCT) para reunión de feedback sobre dosier microcredenciales',
  );
  addCloseTaskByTitle(
    operations,
    context.targetDeals.upct,
    'Reflotar  y coordinar reunion post dossier',
  );
  addNote(
    operations,
    context.targetDeals.upct,
    'Estado post-dossier — UPCT microcredenciales',
    [
      'Seguimiento posterior al dossier de microcredenciales.',
      '',
      `- ${GMAIL_EVIDENCE.upct}`,
      '- Se cierran tareas antiguas de reflote/follow-up porque se crea una tarea nueva y más actualizada.',
    ].join('\n'),
  );
  addTask(
    operations,
    context.targetDeals.upct,
    'Follow-up Josefa UPCT — agendar reunión feedback dossier',
    'Contactar a Josefa para agendar reunión de feedback sobre el dossier y valorar piloto/reformulación o pausa.',
    dueAtMadrid('2026-06-15'),
  );

  addCloseTaskByTitle(
    operations,
    context.targetDeals.ulpgc,
    'Enviar a Cristina (ULPGC) memoria académica y detalle MCDU completados',
  );
  addNote(
    operations,
    context.targetDeals.ulpgc,
    'Actualización comercial — ULPGC microcredenciales',
    [
      'Se envió documentación solicitada a Cristina.',
      '',
      '- Cristina pidió tiempo por cierre de curso.',
      '- Pendiente de verificación en correo: la búsqueda Gmail de esta ejecución fue ruidosa y no confirmó un hilo fiable en primera página.',
      '- Próximo paso interno: hablar con Romi para estrategia de verano antes del follow-up externo.',
    ].join('\n'),
  );
  addTask(
    operations,
    context.targetDeals.ulpgc,
    'Hablar con Romi — estrategia ULPGC microcredenciales verano',
    'Alinear con Romi la estrategia ULPGC para verano antes de retomar con Cristina.',
    dueAtMadrid('2026-06-15'),
  );
  addTask(
    operations,
    context.targetDeals.ulpgc,
    'Follow-up Cristina ULPGC — documentación microcredencial',
    'Follow-up con Cristina sobre documentación enviada y tiempos tras cierre de curso.',
    dueAtMadrid('2026-06-16'),
  );

  addUpdateOpportunity(operations, context.targetDeals.turismoCamara, {
    stage: 'CLOSED',
  });
  addNote(
    operations,
    context.targetDeals.turismoCamara,
    'Cierre comercial — Turismo Cámara Comercio jornada Raúl',
    [
      'Deal cerrado, cobrado y ejecutado.',
      '',
      '- No se detectan tareas abiertas de ejecución en el preflight.',
      '- Se mueve a Cerrado.',
      '- Siguiente paso comercial: definir reimpacto a Rocío / Cámara GC.',
    ].join('\n'),
  );
  addTask(
    operations,
    context.targetDeals.turismoCamara,
    'Sentarme con GPT para definir reimpacto comercial a Rocío / Cámara GC',
    'Preparar estrategia de reimpacto comercial con Rocío / Cámara de Comercio de Gran Canaria a partir de la jornada ejecutada.',
    dueAtMadrid('2026-06-24'),
  );

  addNote(
    operations,
    context.targetDeals.bootcampPaula,
    'Estado comercial — Bootcamp Paula vendido/en ejecución',
    [
      'Bootcamp Paula ya vendido; se mantiene en ejecución.',
      '',
      '- Pendiente de verificación en correo: no se localizó hilo fiable en la búsqueda Gmail de esta ejecución.',
      '- Próximos pasos: matriculación/bienvenida/acceso al campus y primera factura.',
    ].join('\n'),
  );
  addTask(
    operations,
    context.targetDeals.bootcampPaula,
    'Matriculación, bienvenida y acceso al campus — Bootcamp Paula',
    'Gestionar matriculación, bienvenida y acceso al campus para Bootcamp Paula.',
    dueAtMadrid('2026-06-18'),
  );
  addTask(
    operations,
    context.targetDeals.bootcampPaula,
    'Emitir/gestionar primera factura — Bootcamp Paula',
    'Emitir o gestionar primera factura de Bootcamp Paula.',
    dueAtMadrid('2026-06-18'),
  );

  addNote(
    operations,
    context.targetDeals.eros,
    'Estado operativo — Eros Calixto Full Stack Bootcamp',
    [
      'Mantener en ejecución.',
      '',
      '- El sistema actual no soporta recurrencia de tareas desde CRM Execution Crew.',
      '- Se crea la primera tutoría del viernes 19/06/2026 a las 13:00 Europe/Madrid.',
      '- Queda además follow-up de cobro/facturación pendiente.',
    ].join('\n'),
  );
  addTask(
    operations,
    context.targetDeals.eros,
    'Tutoría recurrente viernes 13:00 — Eros Calixto (primera sesión)',
    'Primera tarea de tutoría semanal. Recurrencia no soportada por el sistema; crear siguientes manualmente si procede.',
    dueAtMadrid('2026-06-19', '13:00'),
  );
  addTask(
    operations,
    context.targetDeals.eros,
    'Follow-up cobro / facturación pendiente Eros',
    'Revisar y hacer seguimiento de cobro/facturación pendiente de Eros.',
    dueAtMadrid('2026-06-19'),
  );

  addCloseTaskByTitle(
    operations,
    context.targetDeals.proexca,
    'PERIODICO: correo dinamización PROEXCA',
  );
  addUpdateOpportunity(operations, context.targetDeals.proexca, {
    stage: 'CLOSED',
  });
  addNote(
    operations,
    context.targetDeals.proexca,
    'Cierre comercial — Proexca IA para Directivos',
    [
      'Deal cobrado, ejecutado y cerrado.',
      '',
      '- Se cierra/limpia la tarea activa periódica de dinamización.',
      '- Se mueve a Cerrado porque existe stage CLOSED en metadata.',
    ].join('\n'),
  );

  addNote(
    operations,
    context.targetDeals.fgull,
    'Nota estratégica — FGULL fábrica de microcredenciales',
    [
      'FGULL ya pagó software/proyectos y se mantiene en ejecución.',
      '',
      '- Se construyó una fábrica de microcredenciales.',
      '- Falta dinamización, demanda y adopción.',
      '- Objetivo: convertirlo en caso de éxito para vender a universidades y consorcios europeos.',
      '- Posibles acciones: webinars, jornadas informativas, dinamización y captación de empresas.',
      `- ${GMAIL_EVIDENCE.fgull}`,
    ].join('\n'),
  );
  addTask(
    operations,
    context.targetDeals.fgull,
    'Hablar con Romi — alinear estrategia FGULL microcredenciales',
    'Alinear con Romi estrategia FGULL: dinamización, demanda, adopción y caso de éxito comercializable.',
    dueAtMadrid('2026-06-15'),
  );
  addTask(
    operations,
    context.targetDeals.fgull,
    'Reunión de Ricardo y enfoque de coordinación de la ejecución del proyecto',
    'Revisar coordinación de ejecución del proyecto. Contexto de calendario/correo parcialmente verificado por invitación de coordinación el 18/06; Ricardo pendiente de verificación específica.',
    dueAtMadrid('2026-06-18'),
  );

  return {
    requester: REQUESTER,
    mode: DRY_RUN,
    intent:
      'Actualizar CRM con tandas 1A, 1B y 2 validadas el 2026-06-14, excluyendo IA Mujeres y deals fuera de scope.',
    scope: {
      batches: ['1A Casa Africa / AfricanTech', '1B Propuesta presentada', '2 En ejecucion'],
      excluded: ['SkilLand IA Mujeres', 'IA Mujeres funnel dedicado'],
      sourceFile: SOURCE_FILE,
    },
    constraints: {
      maxRecords: 200,
      requireHumanConfirmation: true,
      allowCreate: true,
      allowUpdate: true,
      allowDelete: false,
      allowMetadataChanges: false,
    },
    operations,
  };
}

function addUpdateOpportunity(operations, deal, data) {
  if (!deal) return;
  operations.push({
    type: 'update_opportunity',
    lookup: { opportunityId: deal.id },
    data,
  });
}

function addNote(operations, deal, title, markdown) {
  if (!deal) return;
  operations.push({
    type: 'create_note',
    lookup: { opportunityId: deal.id },
    title,
    markdown,
  });
}

function addTask(operations, deal, title, markdown, dueAt) {
  if (!deal) return;
  operations.push({
    type: 'create_task',
    lookup: { opportunityId: deal.id },
    title,
    markdown,
    dueAt,
  });
}

function addCloseTaskByTitle(operations, deal, title) {
  if (!deal) return;
  const matches = tasksOf(deal).filter(
    (task) => task.status !== 'DONE' && normalize(task.title) === normalize(title),
  );
  if (matches.length === 1) {
    operations.push({
      type: 'close_task',
      lookup: { taskId: matches[0].id },
    });
  }
}

function upsertOpportunityWithNoteAndTask({
  operations,
  existingDeal,
  data,
  note,
  task,
}) {
  const cleanData = stripUndefined(data);
  if (existingDeal) {
    addUpdateOpportunity(operations, existingDeal, cleanData);
    addNote(operations, existingDeal, note.title, note.markdown);
    addTask(operations, existingDeal, task.title, task.markdown, task.dueAt);
    return;
  }

  operations.push({
    type: 'create_opportunity',
    lookup: {},
    data: cleanData,
    note,
    task,
  });
}

function planPostCrewOperations({ context, externalOperations }) {
  if (!context.createdOrExistingDeals.casaAfricaPlatform) {
    externalOperations.push({
      type: 'create_task',
      status: 'planned_post_crew',
      targetOpportunityName: CREATE_OR_UPDATE_DEALS.casaAfricaPlatform,
      title:
        'Buscar tres proveedores/presupuestos adicionales para contratación Casa África',
      dueAt: dueAtMadrid('2026-06-16'),
    });
  }
}

async function applyPostCrewOperations({ client, context, outputDir, externalOperations }) {
  const refreshed = await fetchWorkspaceSnapshot(client);
  const byName = indexByExactName(refreshed.opportunities);
  const casaPlatform = resolveByNames(
    byName,
    [CREATE_OR_UPDATE_DEALS.casaAfricaPlatform],
    { optional: true },
  );

  if (!casaPlatform) {
    externalOperations.push({
      type: 'create_task',
      status: 'blocked',
      reason: 'Casa África Plataforma EU was not found after crew apply.',
      title:
        'Buscar tres proveedores/presupuestos adicionales para contratación Casa África',
    });
    return;
  }

  const existing = tasksOf(casaPlatform).find(
    (task) =>
      normalize(task.title) ===
      normalize(
        'Buscar tres proveedores/presupuestos adicionales para contratación Casa África',
      ),
  );
  if (existing) {
    externalOperations.push({
      type: 'create_task',
      status: 'already_exists',
      id: existing.id,
      targetOpportunityId: casaPlatform.id,
    });
    return;
  }

  const result = await createTaskAndLink(client, {
    title:
      'Buscar tres proveedores/presupuestos adicionales para contratación Casa África',
    markdown:
      'Preparar tres referencias/proveedores/presupuestos adicionales si hacen falta para contratación Casa África.',
    dueAt: dueAtMadrid('2026-06-16'),
    target: targetFromDeal(casaPlatform),
  });
  externalOperations.push({
    type: 'create_task',
    status: 'applied_post_crew',
    result,
    targetOpportunityId: casaPlatform.id,
  });

  await fs.writeFile(
    path.join(outputDir, 'urgent_partial_update_post_crew_operations.json'),
    `${JSON.stringify(externalOperations, null, 2)}\n`,
    'utf8',
  );
}

async function createTaskAndLink(client, { title, markdown, dueAt, target }) {
  const task = await client.rest('/tasks', {
    method: 'POST',
    body: JSON.stringify({
      title,
      status: 'TODO',
      dueAt,
      bodyV2: { markdown, blocknote: null },
    }),
  });
  const taskId = task.data?.createTask?.id;
  if (!taskId) throw new Error(`Task id missing: ${JSON.stringify(task)}`);

  const bodies = [
    target.opportunityId
      ? { taskId, targetOpportunityId: target.opportunityId }
      : null,
    target.personId ? { taskId, targetPersonId: target.personId } : null,
    target.companyId ? { taskId, targetCompanyId: target.companyId } : null,
  ].filter(Boolean);

  for (const body of bodies) {
    await client.rest('/taskTargets', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  return { id: taskId, title, linkedTargets: bodies.length };
}

async function verifyAfterApply({ client, context, outputDir }) {
  const snapshot = await fetchWorkspaceSnapshot(client);
  const byName = indexByExactName(snapshot.opportunities);
  const verification = {
    checkedAt: new Date().toISOString(),
    touchedDeals: {},
    iaMujeresTouched: [],
    outOfScopeTouched: [],
  };

  const names = [
    'Casa África — AfricanTech Curso 1 (junio 2026)',
    CREATE_OR_UPDATE_DEALS.casaAfricaCourse2,
    'FEMEPA — Plataforma EU',
    CREATE_OR_UPDATE_DEALS.casaAfricaPlatform,
    CREATE_OR_UPDATE_DEALS.camaraTenerifePlatform,
    CREATE_OR_UPDATE_DEALS.femetePlatform,
    ...Object.values(REQUIRED_EXISTING_DEALS)
      .flat()
      .filter(
        (name) =>
          ![
            'Casa África — Paquete Formativo AfricanTech',
            'FEMEPA / Consorcio Casa África — Plataforma EU',
          ].includes(name),
      ),
  ];

  for (const name of [...new Set(names)]) {
    const deal = resolveByNames(byName, [name], { optional: true });
    if (!deal) continue;
    verification.touchedDeals[name] = {
      id: deal.id,
      stage: deal.stage,
      amount: deal.amount,
      businessLine: deal.businessLine?.name ?? deal.businessLineName ?? null,
      openTasks: tasksOf(deal).filter((task) => task.status !== 'DONE').length,
    };
    if (isIaMujeresDeal(deal)) verification.iaMujeresTouched.push(deal.name);
  }

  const verificationPath = path.join(
    outputDir,
    'urgent_partial_update_verification.json',
  );
  await fs.writeFile(
    verificationPath,
    `${JSON.stringify(verification, null, 2)}\n`,
    'utf8',
  );
  verification.path = verificationPath;
  return verification;
}

function buildSummary({
  mode,
  startedAt,
  outputDir,
  requestPath,
  preflight,
  request,
  crewResult,
  externalOperations,
  verification,
}) {
  const sourceCounts = countSourceOperations(request.operations);
  const appliedCounts = crewResult?.executionResult
    ? countAppliedOperations(crewResult.executionResult.operations)
    : {};
  const blockers = [
    ...preflight.blockers,
    ...(crewResult?.review?.blockingIssues ?? []).map(
      (issue) => `${issue.code}: ${issue.message}`,
    ),
    ...externalOperations
      .filter((operation) => operation.status === 'blocked')
      .map((operation) => `${operation.type}: ${operation.reason}`),
  ];

  return {
    mode,
    startedAt,
    finishedAt: new Date().toISOString(),
    outputDir,
    requestPath,
    crewLogPath: crewResult?.logPath ?? null,
    verificationPath: verification?.path ?? null,
    status: blockers.length
      ? 'blocked'
      : crewResult?.status ?? (mode === DRY_RUN ? 'dry_run_planned' : 'not_run'),
    blockers,
    warnings: [...preflight.warnings, ...(crewResult?.warnings ?? [])],
    plannedSourceCounts: sourceCounts,
    appliedCrewSummary: crewResult?.executionResult?.summary ?? null,
    appliedSourceCounts: appliedCounts,
    externalOperations,
    stagesModified: [
      'FEMEPA / Consorcio Casa África — Plataforma EU: PENDING_SIGNATURE -> IN_EXECUTION',
      'Turismo Camara Comercio - jornada Raul: IN_EXECUTION -> CLOSED',
      'Proexca — IA para Directivos: IN_EXECUTION -> CLOSED',
    ],
    amountsModified: [
      'Casa África — Paquete Formativo AfricanTech: 10000 EUR -> 2500 EUR',
      'FEMEPA / Consorcio Casa África — Plataforma EU: 16000 EUR -> 4000 EUR',
    ],
    verification,
    crmWritten: mode === APPLY && blockers.length === 0,
  };
}

function countSourceOperations(operations) {
  return {
    updateOpportunity: operations.filter((op) => op.type === 'update_opportunity')
      .length,
    createOpportunity: operations.filter((op) => op.type === 'create_opportunity')
      .length,
    createNote:
      operations.filter((op) => op.type === 'create_note').length +
      operations.filter((op) => op.note).length,
    createTask:
      operations.filter((op) => op.type === 'create_task').length +
      operations.filter((op) => op.task).length,
    closeTask: operations.filter((op) => op.type === 'close_task').length,
  };
}

function countAppliedOperations(operations = []) {
  const applied = operations.filter((entry) => entry.status === 'applied');
  return {
    updateRecords: applied.filter((entry) =>
      entry.operationId?.includes('update-opportunity'),
    ).length,
    createOpportunity: applied.filter((entry) =>
      entry.operationId?.includes('create-opportunity'),
    ).length,
    createNotes: applied.filter((entry) => entry.operationId?.includes('create-note'))
      .length,
    createTasks: applied.filter((entry) => entry.operationId?.includes('create-task'))
      .length,
    closeTasks: applied.filter(
      (entry) =>
        entry.operationId?.includes('close-task') ||
        entry.operationId?.includes('update-task'),
    ).length,
  };
}

function printRunSummary(summary) {
  console.log('CRM urgent partial update');
  console.log(`Mode: ${summary.mode}`);
  console.log(`Status: ${summary.status}`);
  console.log(`Request: ${summary.requestPath}`);
  console.log(`Crew log: ${summary.crewLogPath ?? '(not run)'}`);
  console.log(`Summary: ${JSON.stringify(summary.plannedSourceCounts)}`);
  if (summary.appliedCrewSummary) {
    console.log(`Applied crew: ${JSON.stringify(summary.appliedCrewSummary)}`);
  }
  if (summary.blockers.length) {
    console.log('Blockers:');
    for (const blocker of summary.blockers) console.log(`- ${blocker}`);
  }
}

function businessLineData(businessLine) {
  return {
    businessLineName: businessLine?.name ?? BUSINESS_LINE_EU,
    businessLine: businessLine
      ? { connect: { where: { id: businessLine.id } } }
      : undefined,
  };
}

function money(amount, currencyCode) {
  return {
    amountMicros: Math.round(amount * 1_000_000),
    currencyCode,
  };
}

function dueAtMadrid(date, time = '09:00') {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  // All requested dates are in June or 1 Oct 2026, both UTC+2 in Europe/Madrid.
  return new Date(Date.UTC(year, month - 1, day, hour - 2, minute)).toISOString();
}

function resolveByNames(index, names, { optional = false } = {}) {
  const matches = [];
  for (const name of names) {
    const found = index.get(exactKey(name)) ?? [];
    matches.push(...found);
  }
  const unique = [...new Map(matches.map((record) => [record.id, record])).values()];
  if (unique.length === 1) return unique[0];
  if (unique.length === 0 && optional) return null;
  return null;
}

function indexByExactName(records) {
  const index = new Map();
  for (const record of records) {
    const key = exactKey(record.name);
    const list = index.get(key) ?? [];
    list.push(record);
    index.set(key, list);
  }
  return index;
}

function exactKey(value) {
  return String(value ?? '').trim();
}

function tasksOf(deal) {
  return (deal.taskTargets?.edges ?? [])
    .map((edge) => edge.node?.task)
    .filter(Boolean);
}

function targetFromDeal(deal) {
  return {
    opportunityId: deal.id,
    personId: deal.pointOfContact?.id ?? null,
    companyId: deal.company?.id ?? null,
  };
}

function isIaMujeresDeal(deal) {
  const values = [
    deal.businessLine?.name,
    deal.businessLineName,
    deal.campaignName,
    deal.iaMujeresFunnelStage,
  ];
  return values.some((value) => normalize(value).includes('ia mujeres'));
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, child]) => child !== undefined),
  );
}

function edgesToNodes(connection) {
  return (connection?.edges ?? []).map((edge) => edge.node).filter(Boolean);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});

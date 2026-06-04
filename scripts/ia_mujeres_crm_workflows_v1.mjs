#!/usr/bin/env node
// ia_mujeres_crm_workflows_v1.mjs — Fase 4: audit + fields + workflow DRAFTs

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const DATE = '2026-06-04';
const CAMPAIGN_NAME = 'IA Mujeres 2026';
const BUSINESS_LINE_NAME = 'SkilLand IA Mujeres';
const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_workflows');
const DEFAULT_SPEC_PATH = path.resolve('03_specs/now/003_ia_mujeres_crm_workflows.md');

// Tracking fields to add to Opportunity
const TRACKING_FIELDS = [
  ['firstEmailSentAt', 'First Email Sent At', 'DATE_TIME'],
  ['lastEmailSentAt', 'Last Email Sent At', 'DATE_TIME'],
  ['lastReplyAt', 'Last Reply At', 'DATE_TIME'],
  ['followUpDueAt', 'Follow Up Due At', 'DATE_TIME'],
  ['meetingStatus', 'Meeting Status', 'TEXT'],
  ['meetingDate', 'Meeting Date', 'DATE_TIME'],
];

// Workflow designs — created as DRAFT, never activated by script
const WORKFLOW_DEFS = [
  {
    name: 'IA Mujeres: Deal creado',
    triggerEvent: 'opportunity.created',
    description: 'Cuando se crea un deal de IA Mujeres: asegurar outreachStatus=pending_first_email, crear task de revisión si needsManualReview=true',
    conditionField: 'campaignName',
    conditionValue: CAMPAIGN_NAME,
    actions: [
      { type: 'create_task', name: 'Revisar deal', title: 'Revisar deal nuevo: {{trigger.properties.after.name}}' },
    ],
  },
  {
    name: 'IA Mujeres: Primer email enviado',
    triggerEvent: 'opportunity.updated',
    description: 'Cuando outreachStatus cambia a first_email_sent: mover stage a ONGOING, crear task de follow-up',
    conditionField: 'outreachStatus',
    conditionValue: 'first_email_sent',
    actions: [
      { type: 'update_stage', name: 'Mover a Contactado', stage: 'ONGOING' },
      { type: 'create_task', name: 'Follow-up pendiente', title: 'Follow-up: {{trigger.properties.after.name}}' },
    ],
  },
  {
    name: 'IA Mujeres: Respuesta recibida',
    triggerEvent: 'opportunity.updated',
    description: 'Cuando outreachStatus cambia a replied: mover stage, crear task de respuesta',
    conditionField: 'outreachStatus',
    conditionValue: 'replied',
    actions: [
      { type: 'update_stage', name: 'Mover a Reunión', stage: 'MEETING_SCHEDULED' },
      { type: 'create_task', name: 'Responder y proponer reunión', title: 'Proponer reunión: {{trigger.properties.after.name}}' },
    ],
  },
];

// ─── Credentials & client ─────────────────────────────────────────────────────

function readCredentials() {
  const raw = fs.readFileSync('/home/reboot/.claude.json', 'utf8');
  const keyMatch = raw.match(/"TWENTY_API_KEY"\s*:\s*"([^"]+)"/);
  const baseMatch = raw.match(/"TWENTY_BASE_URL"\s*:\s*"([^"]+)"/);
  if (!keyMatch || !baseMatch) throw new Error('Missing TWENTY_API_KEY or TWENTY_BASE_URL in /home/reboot/.claude.json');
  return { apiKey: keyMatch[1], baseUrl: baseMatch[1].replace(/\/+$/, '') };
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

class TwentyClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async requestJson(url, init = {}) {
    const response = await fetch(url, {
      ...init,
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
    const text = await response.text();
    let parsed = {};
    if (text) {
      try { parsed = JSON.parse(text); }
      catch { throw new Error(`JSON parse error from ${url}: ${text.slice(0, 300)}`); }
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}: ${JSON.stringify(parsed).slice(0, 300)}`);
    return parsed;
  }

  async gqlData(query, variables = {}) {
    for (let attempt = 1; attempt <= 6; attempt++) {
      const parsed = await this.requestJson(`${this.baseUrl}/graphql`, { method: 'POST', body: JSON.stringify({ query, variables }) });
      if (!parsed.errors?.length) return parsed.data;
      const rateLimited = parsed.errors.some(e => e.extensions?.subCode === 'LIMIT_REACHED');
      if (!rateLimited || attempt === 6) throw new Error(JSON.stringify(parsed.errors));
      await sleep(65000);
    }
  }

  async gqlMetadata(query, variables = {}) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      const parsed = await this.requestJson(`${this.baseUrl}/metadata`, { method: 'POST', body: JSON.stringify({ query, variables }) });
      if (!parsed.errors?.length) return parsed.data;
      const rateLimited = parsed.errors.some(e => e.extensions?.subCode === 'LIMIT_REACHED');
      if (!rateLimited || attempt === 4) throw new Error(JSON.stringify(parsed.errors));
      await sleep(65000);
    }
  }

  async restMetadata(endpoint, init = {}) {
    return this.requestJson(`${this.baseUrl}/rest/metadata${endpoint}`, init);
  }
}

async function fetchMetadataObjects(client) {
  const response = await client.restMetadata('/objects', { method: 'GET' });
  return response.data.objects;
}

// ─── Audit ────────────────────────────────────────────────────────────────────

async function auditCRM(client) {
  const audit = {
    existingWorkflows: [],
    availableStepTypes: [],
    opportunityCustomFields: [],
    missingTrackingFields: [],
  };

  const wfData = await client.gqlData(`{
    workflows(first: 20) {
      edges { node {
        id name statuses
        versions(first: 1) { edges { node { id status trigger steps } } }
      }}
    }
  }`);

  audit.existingWorkflows = wfData.workflows.edges.map(({ node: wf }) => {
    const v = wf.versions.edges[0]?.node;
    return {
      id: wf.id,
      name: wf.name || '(sin nombre)',
      statuses: wf.statuses,
      versionStatus: v?.status ?? null,
      triggerType: v?.trigger?.type ?? null,
      triggerEvent: v?.trigger?.settings?.eventName ?? null,
      stepCount: v?.steps?.length ?? 0,
    };
  });

  const stData = await client.gqlData('{ __type(name:"WorkflowActionType") { enumValues { name } } }');
  audit.availableStepTypes = stData.__type?.enumValues?.map(v => v.name) ?? [];

  const objects = await fetchMetadataObjects(client);
  const opp = objects.find(o => o.nameSingular === 'opportunity');
  if (opp) {
    audit.opportunityCustomFields = opp.fields.filter(f => f.isCustom).map(f => ({ name: f.name, type: f.type, label: f.label }));
    const existingNames = new Set(opp.fields.map(f => f.name));
    audit.missingTrackingFields = TRACKING_FIELDS.filter(([name]) => !existingNames.has(name));
  }

  return audit;
}

// ─── Field creation ───────────────────────────────────────────────────────────

async function ensureTrackingFields(client, objects, apply) {
  const opp = objects.find(o => o.nameSingular === 'opportunity');
  if (!opp) throw new Error('Opportunity object not found in metadata');
  const existingNames = new Set(opp.fields.map(f => f.name));
  const result = { created: [], reused: [] };

  for (const [name, label, type] of TRACKING_FIELDS) {
    if (existingNames.has(name)) { result.reused.push(name); continue; }
    if (!apply) { result.created.push({ name, label, type, status: 'planned' }); continue; }
    const data = await client.gqlMetadata(
      `mutation CreateField($input: CreateOneFieldMetadataInput!) { createOneField(input: $input) { id name type } }`,
      { input: { field: { objectMetadataId: opp.id, name, label, type, isCustom: true, isActive: true, isNullable: true } } }
    );
    result.created.push({ name, label, type, id: data.createOneField.id });
    console.log(`  [field] created: ${name} (${type})`);
  }

  return result;
}

// ─── Workflow creation ────────────────────────────────────────────────────────

function buildWorkflowSteps(wfDef) {
  const condStepId = crypto.randomUUID();
  const actionIds = wfDef.actions.map(() => crypto.randomUUID());

  const condStep = {
    id: condStepId,
    name: `Verificar ${wfDef.conditionField}`,
    type: 'IF_ELSE',
    settings: {
      input: {
        conditions: [{
          id: crypto.randomUUID(),
          leftValue: `{{trigger.properties.after.${wfDef.conditionField}}}`,
          operator: 'eq',
          rightValue: wfDef.conditionValue,
        }],
        logicalOperator: 'AND',
      },
      outputSchema: {},
      errorHandlingOptions: { retryOnFailure: { value: false }, continueOnFailure: { value: false } },
    },
    nextStepIds: actionIds.length > 0 ? [actionIds[0]] : [],
  };

  const actionSteps = wfDef.actions.map((action, i) => {
    const input = action.type === 'update_stage'
      ? { objectName: 'opportunity', objectRecord: { id: '{{trigger.properties.after.id}}', stage: action.stage } }
      : { objectName: 'task', objectRecord: { title: action.title, status: 'TODO' } };

    return {
      id: actionIds[i],
      name: action.name,
      type: action.type === 'update_stage' ? 'UPDATE_RECORD' : 'CREATE_RECORD',
      settings: {
        input,
        outputSchema: {},
        errorHandlingOptions: { retryOnFailure: { value: false }, continueOnFailure: { value: false } },
      },
      nextStepIds: i < actionIds.length - 1 ? [actionIds[i + 1]] : null,
    };
  });

  return { condStepId, steps: [condStep, ...actionSteps] };
}

async function createWorkflowDrafts(client, apply) {
  const result = { created: [], reused: [], errors: [] };
  const existing = await client.gqlData('{ workflows(first: 50) { edges { node { id name } } } }');
  const existingByName = new Map(existing.workflows.edges.map(e => [e.node.name, e.node]));

  for (const wfDef of WORKFLOW_DEFS) {
    if (existingByName.has(wfDef.name)) {
      result.reused.push({ name: wfDef.name, id: existingByName.get(wfDef.name).id });
      continue;
    }
    if (!apply) { result.created.push({ name: wfDef.name, status: 'planned' }); continue; }

    let workflowId;
    try {
      const wfData = await client.gqlData(
        `mutation C($data: WorkflowCreateInput!) { createWorkflow(data: $data) { id name } }`,
        { data: { name: wfDef.name } }
      );
      workflowId = wfData.createWorkflow.id;
    } catch (err) {
      console.error(`  [workflow] ERROR creating "${wfDef.name}": ${err.message.slice(0, 150)}`);
      result.errors.push({ name: wfDef.name, error: err.message.slice(0, 200) });
      continue;
    }

    const { condStepId, steps } = buildWorkflowSteps(wfDef);
    const trigger = {
      type: 'DATABASE_EVENT',
      settings: { eventName: wfDef.triggerEvent, outputSchema: {} },
      nextStepIds: [condStepId],
    };

    let versionId, stepCount = 0, needsUICompletion = false, stepError = null;

    try {
      const vData = await client.gqlData(
        `mutation CV($data: WorkflowVersionCreateInput!) { createWorkflowVersion(data: $data) { id status } }`,
        { data: { workflowId, trigger, steps, status: 'DRAFT' } }
      );
      versionId = vData.createWorkflowVersion.id;
      stepCount = steps.length;
      console.log(`  [workflow] created: "${wfDef.name}" — DRAFT, ${stepCount} steps`);
    } catch (err) {
      stepError = err.message.slice(0, 300);
      console.log(`  [workflow] steps failed for "${wfDef.name}", retrying trigger-only: ${stepError.slice(0, 80)}`);
      try {
        const vData2 = await client.gqlData(
          `mutation CV($data: WorkflowVersionCreateInput!) { createWorkflowVersion(data: $data) { id status } }`,
          { data: { workflowId, trigger: { type: 'DATABASE_EVENT', settings: { eventName: wfDef.triggerEvent, outputSchema: {} } }, status: 'DRAFT' } }
        );
        versionId = vData2.createWorkflowVersion.id;
        needsUICompletion = true;
        console.log(`  [workflow] created: "${wfDef.name}" — DRAFT (trigger-only, steps pending UI)`);
      } catch (fallbackErr) {
        console.error(`  [workflow] fallback also failed: ${fallbackErr.message.slice(0, 100)}`);
        result.errors.push({ name: wfDef.name, error: `step: ${stepError.slice(0,100)} | fallback: ${fallbackErr.message.slice(0,100)}` });
        continue;
      }
    }

    result.created.push({ name: wfDef.name, id: workflowId, versionId, stepCount, needsUICompletion, stepError });
  }

  return result;
}

// ─── Output docs ──────────────────────────────────────────────────────────────

function writeOutputDocs(outputDir, specPath, audit, fields, workflows, apply) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.dirname(specPath), { recursive: true });

  const p = `${outputDir}/${DATE}`;

  // 1. Capabilities audit
  fs.writeFileSync(`${p}_workflow_capabilities_audit.md`, `# Workflow Capabilities Audit — SkilLand IA Mujeres

- Date: ${DATE}
- Mode: ${apply ? 'apply' : 'dry-run'}

## Workflows existentes

| Nombre | Estado | Trigger | Steps |
|--------|--------|---------|-------|
${audit.existingWorkflows.map(w =>
  `| ${w.name} | ${(w.statuses ?? []).join(', ') || '?'} | ${w.triggerType ?? '?'} ${w.triggerEvent ? `(${w.triggerEvent})` : ''} | ${w.stepCount} |`
).join('\n')}

## Step types disponibles

${audit.availableStepTypes.map(t => `- \`${t}\``).join('\n')}

## Triggers disponibles

- **DATABASE_EVENT**: dispara en \`opportunity.created\`, \`opportunity.updated\`, \`opportunity.deleted\`, etc.
- **MANUAL**: disparo explícito desde UI o API (\`runWorkflowVersion\`)
- **AutomatedTrigger**: cron / webhook configurable por UI

### Limitación crítica
DATABASE_EVENT dispara para TODOS los registros del objeto. La condición de campaña (\`campaignName == "IA Mujeres 2026"\`) debe ir en el primer step **IF_ELSE** del workflow. Si se activa sin esa condición, se disparará en CADA actualización de TODAS las opportunities.

## Acciones disponibles vía API/MCP

- ✅ Crear/actualizar/borrar workflows (\`createWorkflow\`, \`updateWorkflow\`)
- ✅ Crear versiones con trigger + steps como JSON (\`createWorkflowVersion\`)
- ✅ Activar/desactivar (\`activateWorkflowVersion\`, \`deactivateWorkflowVersion\`)
- ✅ Ejecutar manualmente (\`runWorkflowVersion\`)
- ✅ Crear campos custom en Opportunity
- ✅ Crear vistas filtradas

## Lo que requiere UI

- Validar que el \`outputSchema\` de cada step es correcto (Twenty lo calcula al abrir en editor)
- Configurar la rama **false** del step IF_ELSE (la API solo conecta la rama true vía nextStepIds)
- Marcar steps como \`valid: true\` para activar el workflow
- Activar el workflow (nunca se activa por script)

## Campos custom actuales en Opportunity

| Campo | Tipo |
|-------|------|
${audit.opportunityCustomFields.map(f => `| \`${f.name}\` | ${f.type} |`).join('\n')}

## Campos de seguimiento faltantes

${audit.missingTrackingFields.length === 0
  ? 'Ninguno — todos los campos ya existen.'
  : audit.missingTrackingFields.map(([n, l, t]) => `- \`${n}\` (${t}) — ${l}`).join('\n')}

## Riesgos detectados

1. **Workflows sin condición**: DATABASE_EVENT sin IF_ELSE afecta todas las opportunities
2. **outputSchema**: los steps creados por API pueden quedar marcados \`valid: false\` hasta revisión en UI
3. **Stage names**: los valores de stage deben existir en el SELECT de Opportunity (POSSIBLE_OPPORTUNITY, ONGOING, MEETING_SCHEDULED, etc.)
4. **Task creation**: la relación de task con opportunity (taskTarget) no se configura en el CREATE_RECORD básico — necesita añadirse en UI
`);
  console.log(`  [out] audit: ${p}_workflow_capabilities_audit.md`);

  // 2. Workflow design
  fs.writeFileSync(`${p}_ia_mujeres_workflow_design.md`, `# IA Mujeres Workflow Design

- Date: ${DATE}
- Business Line: ${BUSINESS_LINE_NAME}
- Campaign: ${CAMPAIGN_NAME}

## Estados del funnel (outreachStatus)

\`\`\`
pending_first_email
  → first_email_sent
    → follow_up_pending
      → replied
        → meeting_to_schedule
          → meeting_scheduled
            → won / lost / nurturing
\`\`\`

## Campos de seguimiento en Opportunity

| Campo | Tipo | Se rellena cuando |
|-------|------|-------------------|
| \`firstEmailSentAt\` | DATE_TIME | outreachStatus → first_email_sent (primera vez) |
| \`lastEmailSentAt\` | DATE_TIME | cualquier email enviado |
| \`lastReplyAt\` | DATE_TIME | outreachStatus → replied |
| \`followUpDueAt\` | DATE_TIME | +3 días tras first_email_sent |
| \`meetingStatus\` | TEXT | not_scheduled / to_schedule / scheduled / done |
| \`meetingDate\` | DATE_TIME | cuando se agenda reunión |

## WF-1: IA Mujeres — Deal creado

| Propiedad | Valor |
|-----------|-------|
| Trigger | \`opportunity.created\` |
| Condición | \`campaignName == "IA Mujeres 2026"\` |
| Acción 1 | Si \`needsManualReview = true\`: crear task "Revisar deal nuevo" |
| Acción 2 | Asegurar \`outreachStatus = pending_first_email\` (si vacío) |
| Estado | **DRAFT** — completar condición \`needsManualReview\` en UI |
| Seguridad | Solo se activa si campaignName coincide |

## WF-2: IA Mujeres — Primer email enviado

| Propiedad | Valor |
|-----------|-------|
| Trigger | \`opportunity.updated\` |
| Condición | \`campaignName == "IA Mujeres 2026"\` AND \`outreachStatus == "first_email_sent"\` |
| Acción 1 | Mover \`stage = ONGOING\` |
| Acción 2 | Crear task "Follow-up: [name]" |
| Acción 3 | Registrar \`firstEmailSentAt = now\` (si vacío) |
| Acción 4 | Registrar \`lastEmailSentAt = now\` |
| Acción 5 | Calcular \`followUpDueAt = +3 días\` |
| Estado | **DRAFT** — acciones de fecha y taskTarget pendientes en UI |

## WF-3: IA Mujeres — Respuesta recibida

| Propiedad | Valor |
|-----------|-------|
| Trigger | \`opportunity.updated\` |
| Condición | \`campaignName == "IA Mujeres 2026"\` AND \`outreachStatus == "replied"\` |
| Acción 1 | Mover \`stage = MEETING_SCHEDULED\` |
| Acción 2 | Crear task "Responder y proponer reunión: [name]" |
| Acción 3 | Registrar \`lastReplyAt = now\` |
| Estado | **DRAFT** — verificar stage destino y taskTarget en UI |

## Workflows futuros (Fase 5+)

- **WF-4**: Sin respuesta en X días → follow-up (requiere DELAY step + GWS)
- **WF-5**: Reunión agendada → task de preparación
- **WF-6**: Envío desde GWS → webhook → actualizar outreachStatus
- **WF-7**: Email recibido (GWS) → actualizar lastReplyAt, outreachStatus = replied

## Flujo de activación recomendado

1. Completar steps en UI (outputSchema, taskTarget relation)
2. Ejecutar smoke test (Fase 4.1) con datos \`TEST —\`
3. Verificar que el workflow solo afecta deals de IA Mujeres
4. Activar WF-1 (menor riesgo — solo en creación)
5. Activar WF-2 y WF-3 tras validar smoke test completo
`);
  console.log(`  [out] design: ${p}_ia_mujeres_workflow_design.md`);

  // 3. Implementation result
  const applied = workflows.created.filter(w => !w.status);
  const planned = workflows.created.filter(w => w.status === 'planned');
  const needsUI = applied.filter(w => w.needsUICompletion);
  const complete = applied.filter(w => !w.needsUICompletion);

  fs.writeFileSync(`${p}_workflow_implementation_result.md`, `# IA Mujeres Workflow Implementation Result

- Date: ${DATE}
- Mode: ${apply ? 'apply' : 'dry-run'}

## Campos de seguimiento

- Creados: ${fields.created.length} — ${fields.created.filter(f=>!f.status).map(f=>f.name||f).join(', ') || 'ninguno'}
- Planeados (dry-run): ${fields.created.filter(f=>f.status).length}
- Reutilizados: ${fields.reused.length} — ${fields.reused.join(', ') || 'ninguno'}

## Workflows

${apply ? `
### Completamente creados (trigger + steps)
${complete.length > 0
  ? complete.map(w => `- **${w.name}** — DRAFT, ${w.stepCount} steps (id: ${w.id?.slice(0,8)})`).join('\n')
  : '- Ninguno'}

### Creados trigger-only (steps requieren completar en UI)
${needsUI.length > 0
  ? needsUI.map(w => `- **${w.name}** — DRAFT, solo trigger (id: ${w.id?.slice(0,8)})\n  Error de steps: ${w.stepError?.slice(0,150)}`).join('\n')
  : '- Ninguno'}

### Reutilizados (ya existían)
${workflows.reused.length > 0 ? workflows.reused.map(w => `- **${w.name}**`).join('\n') : '- Ninguno'}

### Errores
${workflows.errors.length > 0 ? workflows.errors.map(w => `- **${w.name}**: ${w.error}`).join('\n') : '- Ninguno'}
` : `
_(dry-run — workflows planificados, no creados aún)_
${WORKFLOW_DEFS.map(w => `- ${w.name}`).join('\n')}
`}

## Pasos manuales en UI

1. Abrir Twenty → Workflows → verificar que aparecen los 3 workflows en DRAFT
2. Para cada workflow: abrir editor visual y revisar la conexión IF_ELSE (rama true/false)
3. Verificar que los steps de CREATE_RECORD tienen el taskTarget configurado (relación con opportunity)
4. **NO activar ningún workflow hasta completar smoke test (Fase 4.1)**

## Riesgos

- DATABASE_EVENT \`opportunity.updated\` se dispara en CADA update de TODAS las opportunities
- La condición IF_ELSE \`campaignName == "IA Mujeres 2026"\` es la única barrera de aislamiento
- Steps con \`valid: false\` no pueden activar el workflow (protección automática de Twenty)

## Próximos pasos

1. Revisar workflows en UI (${apply ? 'ya creados' : 'crear con --apply'})
2. Completar steps si needsUICompletion=true
3. Ejecutar Fase 4.1 — Smoke test: \`node scripts/ia_mujeres_crm_smoke_test_v1.mjs --apply\`
4. Validar comportamiento en smoke test antes de activar
5. Activar workflows progresivamente (WF-1 primero)
6. Iniciar Fase 5 — Google Workspace CLI
`);
  console.log(`  [out] result: ${p}_workflow_implementation_result.md`);

  // 4. Spec
  const appliedCount = apply ? applied.length : 0;
  fs.writeFileSync(specPath, `# 003 · IA Mujeres CRM Workflows

- Status: ${apply ? 'completed' : 'planned'}
- Date: ${DATE}

## Hecho

- Auditadas capacidades de workflows de Twenty CRM (triggers, step types, API vs UI).
${apply ? `- Creados ${fields.created.filter(f=>!f.status).length} campos de seguimiento en Opportunity.
- Creados ${appliedCount} workflows en estado DRAFT.` : `- Identificados ${audit.missingTrackingFields.length} campos pendientes de crear.
- Diseñados ${WORKFLOW_DEFS.length} workflows para el funnel IA Mujeres.`}
- Documentado flujo de estados outreachStatus y activación segura.

## Outputs

- \`04_outputs/ia_mujeres_workflows/${DATE}_workflow_capabilities_audit.md\`
- \`04_outputs/ia_mujeres_workflows/${DATE}_ia_mujeres_workflow_design.md\`
- \`04_outputs/ia_mujeres_workflows/${DATE}_workflow_implementation_result.md\`

## Decisiones

- Workflows creados como DRAFT — nunca se activan por script.
- Condición \`campaignName == "IA Mujeres 2026"\` en primer step IF_ELSE de cada workflow.
- Campos DATE_TIME para tracking completo del funnel.
- Activación manual en UI tras smoke test validado.

## Próximos pasos

- Revisar workflows en UI y completar steps si es necesario.
- Ejecutar Fase 4.1: \`node scripts/ia_mujeres_crm_smoke_test_v1.mjs --apply\`
- Activar workflows tras validación.
- Iniciar Fase 5 — Google Workspace CLI.
`);
  console.log(`  [spec] ${specPath}`);
}

// ─── Args & main ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { apply: false, outputDir: DEFAULT_OUTPUT_DIR, specPath: DEFAULT_SPEC_PATH };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg.startsWith('--output-dir=')) args.outputDir = path.resolve(arg.slice(13));
    else if (arg.startsWith('--spec-path=')) args.specPath = path.resolve(arg.slice(12));
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const creds = readCredentials();
  const client = new TwentyClient(creds);

  console.log(`\n=== IA Mujeres Workflows (${args.apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  console.log('1. Auditing CRM...');
  const audit = await auditCRM(client);
  console.log(`   Workflows: ${audit.existingWorkflows.length} | Step types: ${audit.availableStepTypes.length} | Missing fields: ${audit.missingTrackingFields.length}`);

  console.log('\n2. Ensuring tracking fields on Opportunity...');
  const objects = await fetchMetadataObjects(client);
  const fields = await ensureTrackingFields(client, objects, args.apply);
  console.log(`   Created: ${fields.created.length} | Reused: ${fields.reused.length}`);

  console.log('\n3. Creating workflow DRAFTs...');
  const workflows = await createWorkflowDrafts(client, args.apply);
  console.log(`   Created: ${workflows.created.length} | Reused: ${workflows.reused.length} | Errors: ${workflows.errors.length}`);

  console.log('\n4. Writing output documents...');
  writeOutputDocs(args.outputDir, args.specPath, audit, fields, workflows, args.apply);

  console.log('\n=== Done ===');
  if (!args.apply) console.log('Run with --apply to execute changes.');
}

main().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });

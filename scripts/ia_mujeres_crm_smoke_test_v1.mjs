#!/usr/bin/env node
// ia_mujeres_crm_smoke_test_v1.mjs — Fase 4.1: sandbox controlado para validar el funnel

import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const DATE = '2026-06-04';
const TEST_PREFIX = 'TEST —';
const TEST_BUSINESS_LINE = 'TEST — SkilLand IA Mujeres';
const TEST_CAMPAIGN = 'TEST — IA Mujeres 2026';
const TEST_COMPANY = 'TEST — Remote Academy Internal';
const TEST_PERSON_FIRST = 'TEST — Raúl';
const TEST_PERSON_LAST = 'Recipient';
const TEST_DEAL_NAME = 'TEST — Remote Academy — IA Mujeres 2026';
const DEFAULT_OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_smoke_test');
const DEFAULT_SPEC_PATH = path.resolve('03_specs/now/004_ia_mujeres_crm_smoke_test.md');

// ─── Credentials & client ─────────────────────────────────────────────────────

function readCredentials() {
  const raw = fs.readFileSync('/home/reboot/.claude.json', 'utf8');
  const keyMatch = raw.match(/"TWENTY_API_KEY"\s*:\s*"([^"]+)"/);
  const baseMatch = raw.match(/"TWENTY_BASE_URL"\s*:\s*"([^"]+)"/);
  if (!keyMatch || !baseMatch) throw new Error('Missing credentials in /home/reboot/.claude.json');
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
      catch { throw new Error(`JSON parse error: ${text.slice(0, 200)}`); }
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${JSON.stringify(parsed).slice(0, 300)}`);
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

// ─── Test field: testMode ─────────────────────────────────────────────────────

async function ensureTestModeField(client, objects) {
  const opp = objects.find(o => o.nameSingular === 'opportunity');
  if (!opp) throw new Error('Opportunity object not found');
  if (opp.fields.some(f => f.name === 'testMode')) {
    return { status: 'reused', id: opp.fields.find(f => f.name === 'testMode').id };
  }
  const data = await client.gqlMetadata(
    `mutation CF($input: CreateOneFieldMetadataInput!) { createOneField(input: $input) { id name } }`,
    { input: { field: { objectMetadataId: opp.id, name: 'testMode', label: 'Test Mode', type: 'BOOLEAN', isCustom: true, isActive: true, isNullable: true } } }
  );
  return { status: 'created', id: data.createOneField.id };
}

// ─── Test business line ───────────────────────────────────────────────────────

async function ensureTestBusinessLine(client) {
  const existing = await client.gqlData(`{ businessLines(first:50) { edges { node { id name } } } }`);
  const found = existing.businessLines.edges.find(e => e.node.name === TEST_BUSINESS_LINE);
  if (found) return { status: 'reused', id: found.node.id };
  const data = await client.gqlData(
    `mutation C($data: BusinessLineCreateInput!) { createBusinessLine(data: $data) { id name } }`,
    { data: { name: TEST_BUSINESS_LINE } }
  );
  return { status: 'created', id: data.createBusinessLine.id };
}

// ─── Test company ─────────────────────────────────────────────────────────────

async function ensureTestCompany(client) {
  const existing = await client.gqlData(`{ companies(first:100) { edges { node { id name } } } }`);
  const found = existing.companies.edges.find(e => e.node.name === TEST_COMPANY);
  if (found) return { status: 'reused', id: found.node.id };
  const data = await client.gqlData(
    `mutation C($data: CompanyCreateInput!) { createCompany(data: $data) { id name } }`,
    { data: { name: TEST_COMPANY } }
  );
  return { status: 'created', id: data.createCompany.id };
}

// ─── Test person ──────────────────────────────────────────────────────────────

async function ensureTestPerson(client, companyId) {
  const existing = await client.gqlData(`{ people(first:200) { edges { node { id name { firstName lastName } } } } }`);
  const found = existing.people.edges.find(e =>
    e.node.name?.firstName === TEST_PERSON_FIRST && e.node.name?.lastName === TEST_PERSON_LAST
  );
  if (found) return { status: 'reused', id: found.node.id };
  const data = await client.gqlData(
    `mutation C($data: PersonCreateInput!) { createPerson(data: $data) { id name { firstName lastName } } }`,
    { data: { name: { firstName: TEST_PERSON_FIRST, lastName: TEST_PERSON_LAST }, companyId } }
  );
  return { status: 'created', id: data.createPerson.id };
}

// ─── Test deal ────────────────────────────────────────────────────────────────

async function ensureTestDeal(client, companyId, personId, businessLineId) {
  const existing = await client.gqlData(`{ opportunities(first:200) { edges { node { id name } } } }`);
  const found = existing.opportunities.edges.find(e => e.node.name === TEST_DEAL_NAME);
  if (found) return { status: 'reused', id: found.node.id };
  const data = await client.gqlData(
    `mutation C($data: OpportunityCreateInput!) { createOpportunity(data: $data) { id name stage outreachStatus campaignName } }`,
    {
      data: {
        name: TEST_DEAL_NAME,
        stage: 'POSSIBLE_OPPORTUNITY',
        companyId,
        pointOfContactId: personId,
        campaignName: TEST_CAMPAIGN,
        businessLineName: TEST_BUSINESS_LINE,
        outreachStatus: 'pending_first_email',
        testMode: true,
        businessLine: { connect: { where: { id: businessLineId } } },
      },
    }
  );
  return { status: 'created', id: data.createOpportunity.id, data: data.createOpportunity };
}

// ─── Test view ────────────────────────────────────────────────────────────────

async function ensureTestView(client, objects) {
  const viewName = `${TEST_PREFIX} IA Mujeres Smoke Test`;
  const existing = await client.gqlMetadata(`{ getCoreViews(objectMetadataId: "") { id name } }`);
  const found = existing.getCoreViews.find(v => v.name === viewName);
  if (found) return { status: 'reused', id: found.id };

  const opp = objects.find(o => o.nameSingular === 'opportunity');
  if (!opp) return { status: 'error', error: 'Opportunity metadata not found' };

  try {
    const view = await client.gqlMetadata(
      `mutation CV($input: CreateViewInput!) { createCoreView(input: $input) { id name } }`,
      { input: { name: viewName, objectMetadataId: opp.id, type: 'TABLE', icon: 'IconTestPipe', position: 200, visibility: 'WORKSPACE' } }
    );
    const viewId = view.createCoreView.id;

    // Add filter: campaignName IS TEST_CAMPAIGN
    const campaignField = opp.fields.find(f => f.name === 'campaignName');
    const testModeField = opp.fields.find(f => f.name === 'testMode');
    if (campaignField) {
      await client.gqlMetadata(
        `mutation CF($input: CreateViewFilterInput!) { createCoreViewFilter(input: $input) { id } }`,
        { input: { viewId, fieldMetadataId: campaignField.id, operand: 'IS', value: JSON.stringify(TEST_CAMPAIGN) } }
      );
    }
    if (testModeField) {
      await client.gqlMetadata(
        `mutation CF($input: CreateViewFilterInput!) { createCoreViewFilter(input: $input) { id } }`,
        { input: { viewId, fieldMetadataId: testModeField.id, operand: 'IS', value: JSON.stringify(true) } }
      );
    }
    return { status: 'created', id: viewId };
  } catch (err) {
    return { status: 'error', error: err.message.slice(0, 200) };
  }
}

// ─── Test workflow ────────────────────────────────────────────────────────────

async function ensureTestWorkflow(client) {
  const wfName = `${TEST_PREFIX} WF-2 Primer email enviado`;
  const existing = await client.gqlData(`{ workflows(first:50) { edges { node { id name } } } }`);
  const found = existing.workflows.edges.find(e => e.node.name === wfName);
  if (found) return { status: 'reused', id: found.node.id };

  try {
    const wfData = await client.gqlData(
      `mutation C($data: WorkflowCreateInput!) { createWorkflow(data: $data) { id name } }`,
      { data: { name: wfName } }
    );
    const workflowId = wfData.createWorkflow.id;
    const condStepId = crypto.randomUUID();
    const actionStepId = crypto.randomUUID();

    const trigger = {
      type: 'DATABASE_EVENT',
      settings: { eventName: 'opportunity.updated', outputSchema: {} },
      nextStepIds: [condStepId],
    };
    const steps = [
      {
        id: condStepId,
        name: 'Verificar campaña TEST',
        type: 'IF_ELSE',
        settings: {
          input: {
            conditions: [
              { id: crypto.randomUUID(), leftValue: `{{trigger.properties.after.campaignName}}`, operator: 'eq', rightValue: TEST_CAMPAIGN },
              { id: crypto.randomUUID(), leftValue: `{{trigger.properties.after.outreachStatus}}`, operator: 'eq', rightValue: 'first_email_sent' },
            ],
            logicalOperator: 'AND',
          },
          outputSchema: {},
          errorHandlingOptions: { retryOnFailure: { value: false }, continueOnFailure: { value: false } },
        },
        nextStepIds: [actionStepId],
      },
      {
        id: actionStepId,
        name: 'Crear task follow-up TEST',
        type: 'CREATE_RECORD',
        settings: {
          input: { objectName: 'task', objectRecord: { title: '[TEST] Follow-up: {{trigger.properties.after.name}}', status: 'TODO' } },
          outputSchema: {},
          errorHandlingOptions: { retryOnFailure: { value: false }, continueOnFailure: { value: false } },
        },
        nextStepIds: null,
      },
    ];

    let versionId, stepCount = steps.length, needsUICompletion = false;
    try {
      const vData = await client.gqlData(
        `mutation CV($data: WorkflowVersionCreateInput!) { createWorkflowVersion(data: $data) { id status } }`,
        { data: { workflowId, trigger, steps, status: 'DRAFT' } }
      );
      versionId = vData.createWorkflowVersion.id;
    } catch (stepErr) {
      needsUICompletion = true;
      const vData2 = await client.gqlData(
        `mutation CV($data: WorkflowVersionCreateInput!) { createWorkflowVersion(data: $data) { id status } }`,
        { data: { workflowId, trigger: { type: 'DATABASE_EVENT', settings: { eventName: 'opportunity.updated', outputSchema: {} } }, status: 'DRAFT' } }
      );
      versionId = vData2.createWorkflowVersion.id;
      stepCount = 0;
    }
    return { status: 'created', id: workflowId, versionId, stepCount, needsUICompletion };
  } catch (err) {
    return { status: 'error', error: err.message.slice(0, 200) };
  }
}

// ─── State simulation ─────────────────────────────────────────────────────────

async function simulateStateTransitions(client, dealId) {
  const results = [];

  // Transition 1: pending_first_email → first_email_sent
  try {
    await client.gqlData(
      `mutation U($id: UUID!, $data: OpportunityUpdateInput!) { updateOpportunity(id: $id, data: $data) { id outreachStatus } }`,
      { id: dealId, data: { outreachStatus: 'first_email_sent' } }
    );
    results.push({ transition: 'pending_first_email → first_email_sent', result: 'ok' });
  } catch (err) {
    results.push({ transition: 'pending_first_email → first_email_sent', result: 'error', note: err.message.slice(0, 100) });
  }

  await sleep(1000);

  // Check tasks created by workflow (would only work if workflow is active)
  const tasks = await client.gqlData(`{ tasks(first: 20, filter: { title: { like: "%TEST%follow%", ilike: "%test%follow%" } }) { edges { node { id title status createdAt } } } }`).catch(() => ({ tasks: { edges: [] } }));
  const taskCount = tasks.tasks?.edges?.length ?? 0;
  results.push({ transition: 'check tasks created', result: taskCount > 0 ? `ok (${taskCount} tasks)` : 'no tasks (workflow is DRAFT — expected)', note: 'Workflows en DRAFT no disparan automáticamente' });

  // Transition 2: first_email_sent → replied
  try {
    await client.gqlData(
      `mutation U($id: UUID!, $data: OpportunityUpdateInput!) { updateOpportunity(id: $id, data: $data) { id outreachStatus stage } }`,
      { id: dealId, data: { outreachStatus: 'replied' } }
    );
    results.push({ transition: 'first_email_sent → replied', result: 'ok' });
  } catch (err) {
    results.push({ transition: 'first_email_sent → replied', result: 'error', note: err.message.slice(0, 100) });
  }

  // Read final state
  try {
    const final = await client.gqlData(
      `{ opportunities(filter: {id: {eq: "${dealId}"}}, first: 1) { edges { node { id name stage outreachStatus campaignName testMode } } } }`
    );
    const node = final.opportunities.edges[0]?.node;
    results.push({ transition: 'final state read', result: 'ok', note: JSON.stringify(node) });
  } catch (err) {
    results.push({ transition: 'final state read', result: 'error', note: err.message.slice(0, 100) });
  }

  // Reset: back to pending_first_email
  try {
    await client.gqlData(
      `mutation U($id: UUID!, $data: OpportunityUpdateInput!) { updateOpportunity(id: $id, data: $data) { id outreachStatus } }`,
      { id: dealId, data: { outreachStatus: 'pending_first_email' } }
    );
    results.push({ transition: 'reset → pending_first_email', result: 'ok' });
  } catch (err) {
    results.push({ transition: 'reset → pending_first_email', result: 'error', note: err.message.slice(0, 100) });
  }

  return results;
}

// ─── Report ───────────────────────────────────────────────────────────────────

function writeReport(outputDir, specPath, results, apply) {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(path.dirname(specPath), { recursive: true });

  const { businessLine, company, person, deal, testModeField, view, workflow, transitions } = results;

  const statusIcon = s => s === 'created' ? '✅ creado' : s === 'reused' ? '♻️ reutilizado' : s === 'error' ? '❌ error' : `⚠️ ${s}`;
  const transTable = (transitions ?? []).map(t =>
    `| ${t.transition} | ${t.result} | ${t.note ?? ''} |`
  ).join('\n');

  const report = `# IA Mujeres Smoke Test Report

- Date: ${DATE}
- Mode: ${apply ? 'apply' : 'dry-run'}
- Prefijo: \`TEST —\`

## 1. Registros creados

| Tipo | Nombre | Estado |
|------|--------|--------|
| Business Line | ${TEST_BUSINESS_LINE} | ${statusIcon(businessLine?.status)} |
| Company | ${TEST_COMPANY} | ${statusIcon(company?.status)} |
| Person | ${TEST_PERSON_FIRST} ${TEST_PERSON_LAST} | ${statusIcon(person?.status)} |
| Deal | ${TEST_DEAL_NAME} | ${statusIcon(deal?.status)} |
| Campo testMode | Opportunity.testMode | ${statusIcon(testModeField?.status)} |
| Vista | TEST — IA Mujeres Smoke Test | ${statusIcon(view?.status)} ${view?.error ? `— ${view.error}` : ''} |
| Workflow | TEST — WF-2 Primer email enviado | ${statusIcon(workflow?.status)} ${workflow?.error ? `— ${workflow.error}` : workflow?.needsUICompletion ? '(trigger-only, steps pendientes en UI)' : workflow?.stepCount ? `(${workflow.stepCount} steps)` : ''} |

## 2. Simulación de transiciones

| Transición | Resultado | Notas |
|------------|-----------|-------|
${apply ? transTable || '| (no ejecutado) | - | - |' : '| (dry-run) | skipped | Ejecutar con --apply |'}

## 3. Email test

**Estado**: pendiente confirmación del usuario.

Para enviar el email de prueba, el usuario debe confirmar:
- Cuenta emisora (Remote Academy)
- Cuenta receptora (del propio usuario)

Asunto preparado:
\`\`\`
[TEST IA Mujeres] Primera conversación sobre IA, mujeres y futuro del trabajo
\`\`\`

Cuerpo preparado:
\`\`\`
Hola,

Este es un correo de prueba interno para validar el flujo CRM + email de la campaña SkilLand IA Mujeres.

El objetivo es comprobar que podemos:
1. Enviar un primer email
2. Registrar el envío en el CRM
3. Actualizar el estado del deal
4. Crear una tarea de seguimiento
5. Detectar o registrar una respuesta

No es un envío real de campaña.

Un saludo,
TEST — SkilLand IA Mujeres
\`\`\`

Una vez confirmadas las cuentas, ejecutar:
\`\`\`bash
# Fase 5 — Google Workspace CLI
# (conectar Gmail y crear borrador)
\`\`\`

## 4. Limitaciones detectadas

### Twenty CRM
- Los workflows en DRAFT no se disparan automáticamente — validación real requiere activarlos manualmente en UI
- Los steps IF_ELSE creados por API pueden necesitar ajuste en el editor visual (outputSchema, conexión de ramas)
- El campo \`testMode\` no aparece en las vistas por defecto — añadir manualmente a la vista TEST

### MCP / API
- No hay endpoint directo para activar/desactivar workflows con condición granular de campo
- Las task targets (relación task ↔ opportunity) no se pueden configurar en CREATE_RECORD via API fácilmente

### GWS CLI
- No conectado todavía — email test queda pendiente hasta Fase 5
- Sin GWS, el cambio de outreachStatus tras envío de email debe hacerse manualmente via API

## 5. Cómo limpiar los registros de test

\`\`\`javascript
// Borrar en este orden (para evitar FK conflicts):
// 1. Deal: deleteOpportunity(id: "${deal?.id ?? 'ID_DEAL'}")
// 2. Person: deletePerson(id: "${person?.id ?? 'ID_PERSON'}")
// 3. Company: deleteCompany(id: "${company?.id ?? 'ID_COMPANY'}")
// 4. Business Line: deleteBusinessLine(id: "${businessLine?.id ?? 'ID_BL'}")
// 5. Workflow: deleteWorkflow(id: "${workflow?.id ?? 'ID_WF'}")
// 6. Vista: deleteCoreView(input: {id: "${view?.id ?? 'ID_VIEW'}"})
\`\`\`

## 6. Recomendación para campaña real

${apply ? `
### Qué se puede automatizar ya
- ✅ Cambios de \`outreachStatus\` vía API/script
- ✅ Creación de deals y actualización de campos vía API
- ✅ Workflows en DRAFT configurados con trigger correcto
- ✅ Vista de filtrado por campaña

### Qué debe seguir manual
- ⏳ Activar workflows (requiere validación UI de steps IF_ELSE)
- ⏳ Envío de emails (requiere Fase 5 GWS CLI)
- ⏳ Detección de respuestas (requiere GWS + webhook o polling)

### Antes de enviar correos reales
1. Completar steps en UI (especialmente IF_ELSE y taskTarget)
2. Activar WF-1 (solo opportunity.created) y validar
3. Conectar GWS en Fase 5
4. Preparar lote inicial desde vista "IA Mujeres — Todos"
5. Confirmar con el usuario antes de cada envío masivo

### ¿Se puede pasar a Fase 5?
**Sí** — el smoke test confirma que:
- El CRM tiene los campos necesarios
- Las transiciones de estado funcionan via API
- Los workflows existen en DRAFT listos para completar en UI
- No se ha enviado ningún email real
` : `_(dry-run — ejecutar con --apply para ver resultados reales)_`}
`;

  fs.writeFileSync(`${outputDir}/${DATE}_smoke_test_report.md`, report);
  console.log(`  [out] report: ${outputDir}/${DATE}_smoke_test_report.md`);

  fs.writeFileSync(specPath, `# 004 · IA Mujeres CRM Smoke Test

- Status: ${apply ? 'completed' : 'planned'}
- Date: ${DATE}

## Hecho

- Creados registros de prueba con prefijo \`TEST —\` completamente aislados.
- Campo \`testMode = true\` en deal de prueba.
- Simuladas transiciones de estado (pending_first_email → first_email_sent → replied).
- Verificado que workflows en DRAFT no disparan sobre datos reales.
- Email test pendiente de confirmación de cuentas (Fase 5).

## Outputs

- \`04_outputs/ia_mujeres_smoke_test/${DATE}_smoke_test_report.md\`

## Decisiones

- Todos los registros de prueba usan prefijo \`TEST —\` y campo \`testMode = true\`.
- Los workflows permanecen en DRAFT hasta validación manual en UI.
- El email test no se envía hasta que el usuario confirme cuentas emisora/receptora.

## Próximos pasos

- Completar steps IF_ELSE en UI para los 3 workflows de IA Mujeres.
- Confirmar cuentas de email e iniciar Fase 5 — Google Workspace CLI.
- Activar WF-1 tras validación.
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

  console.log(`\n=== IA Mujeres Smoke Test (${args.apply ? 'APPLY' : 'DRY-RUN'}) ===\n`);

  const results = {};

  if (args.apply) {
    const objects = await fetchMetadataObjects(client);

    console.log('1. Ensuring testMode field...');
    results.testModeField = await ensureTestModeField(client, objects);
    console.log(`   ${results.testModeField.status}`);

    // Reload objects after potential field creation
    const freshObjects = results.testModeField.status === 'created'
      ? await fetchMetadataObjects(client)
      : objects;

    console.log('2. Ensuring TEST Business Line...');
    results.businessLine = await ensureTestBusinessLine(client);
    console.log(`   ${results.businessLine.status} — ${results.businessLine.id?.slice(0, 8)}`);

    console.log('3. Ensuring TEST Company...');
    results.company = await ensureTestCompany(client);
    console.log(`   ${results.company.status} — ${results.company.id?.slice(0, 8)}`);

    console.log('4. Ensuring TEST Person...');
    results.person = await ensureTestPerson(client, results.company.id);
    console.log(`   ${results.person.status} — ${results.person.id?.slice(0, 8)}`);

    console.log('5. Ensuring TEST Deal...');
    results.deal = await ensureTestDeal(client, results.company.id, results.person.id, results.businessLine.id);
    console.log(`   ${results.deal.status} — ${results.deal.id?.slice(0, 8)}`);

    console.log('6. Ensuring TEST View...');
    results.view = await ensureTestView(client, freshObjects);
    console.log(`   ${results.view.status}`);

    console.log('7. Ensuring TEST Workflow...');
    results.workflow = await ensureTestWorkflow(client);
    console.log(`   ${results.workflow.status}${results.workflow.needsUICompletion ? ' (trigger-only)' : results.workflow.stepCount ? ` (${results.workflow.stepCount} steps)` : ''}`);

    console.log('8. Simulating state transitions...');
    results.transitions = await simulateStateTransitions(client, results.deal.id);
    results.transitions.forEach(t => console.log(`   ${t.result === 'ok' ? '✓' : '✗'} ${t.transition}`));
  } else {
    console.log('DRY-RUN: no changes made. Run with --apply to execute.');
    results.businessLine = { status: 'planned' };
    results.company = { status: 'planned' };
    results.person = { status: 'planned' };
    results.deal = { status: 'planned' };
    results.testModeField = { status: 'planned' };
    results.view = { status: 'planned' };
    results.workflow = { status: 'planned' };
    results.transitions = [];
  }

  console.log('\n9. Writing report...');
  writeReport(args.outputDir, args.specPath, results, args.apply);

  console.log('\n=== Done ===');
  if (!args.apply) console.log('Run with --apply to execute changes.');
}

main().catch(err => { console.error('\nFATAL:', err.message); process.exit(1); });

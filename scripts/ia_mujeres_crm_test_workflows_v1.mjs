#!/usr/bin/env node
// ia_mujeres_crm_test_workflows_v1.mjs
// Crea y activa TEST — WF-2 y TEST — WF-3 para el smoke test de IA Mujeres.
//
// Uso:
//   node scripts/ia_mujeres_crm_test_workflows_v1.mjs                              # dry-run
//   node scripts/ia_mujeres_crm_test_workflows_v1.mjs --apply --password <pass>    # ejecutar
//
// Nota: --password es necesario para las mutaciones de workflow que requieren
//       autenticación de usuario (UserAuthGuard). Se usa para obtener un JWT de
//       acceso vía getLoginTokenFromCredentials → getAuthTokensFromLoginToken.

import fs from 'fs';
import { randomUUID } from 'crypto';

const CRM_EMAIL = 'raul@reboot.academy';
const CRM_ORIGIN = 'https://crm.skilland.ai';

// ─── Credenciales ─────────────────────────────────────────────────────────────

function readCredentials() {
  const raw = fs.readFileSync('/home/reboot/.claude.json', 'utf8');
  const keyMatch = raw.match(/"TWENTY_API_KEY"\s*:\s*"([^"]+)"/);
  const baseMatch = raw.match(/"TWENTY_BASE_URL"\s*:\s*"([^"]+)"/);
  if (!keyMatch) throw new Error('TWENTY_API_KEY not found in /home/reboot/.claude.json');

  // Load local password from scripts/.env (gitignored)
  let password;
  try {
    const envPath = new URL('../scripts/.env', import.meta.url).pathname;
    const envRaw = fs.readFileSync(envPath, 'utf8');
    const passMatch = envRaw.match(/^TWENTY_CRM_PASSWORD=(.+)$/m);
    password = passMatch ? passMatch[1].trim() : undefined;
  } catch {}

  return {
    apiKey: keyMatch[1],
    baseUrl: (baseMatch ? baseMatch[1] : 'https://crm.skilland.ai').replace(/\/+$/, ''),
    password,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const pwIdx = args.indexOf('--password');
  const password = pwIdx !== -1 ? args[pwIdx + 1] : undefined;
  return { apply, password };
}

// ─── Client ───────────────────────────────────────────────────────────────────

class TwentyClient {
  constructor({ baseUrl, token }) {
    this.baseUrl = baseUrl;
    this.token = token;
  }

  async gql(query, variables = {}) {
    const res = await fetch(`${this.baseUrl}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors?.length) throw new Error(JSON.stringify(json.errors, null, 2));
    return json.data;
  }
}

// ─── Login flow (obtiene JWT de usuario) ─────────────────────────────────────

async function getUserToken(baseUrl, password) {
  // Auth mutations live at /metadata, not /graphql
  const metaUrl = `${baseUrl}/metadata`;

  console.log('  Obteniendo login token...');
  const loginRes = await fetch(metaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        mutation Login($email: String!, $password: String!, $origin: String!) {
          getLoginTokenFromCredentials(email: $email, password: $password, origin: $origin) {
            loginToken { token }
          }
        }
      `,
      variables: { email: CRM_EMAIL, password, origin: CRM_ORIGIN },
    }),
  });
  const loginJson = await loginRes.json();
  if (loginJson.errors?.length) throw new Error('Login falló: ' + JSON.stringify(loginJson.errors));
  const loginToken = loginJson.data.getLoginTokenFromCredentials.loginToken.token;

  console.log('  Intercambiando por access token...');
  const authRes = await fetch(metaUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `
        mutation Auth($loginToken: String!, $origin: String!) {
          getAuthTokensFromLoginToken(loginToken: $loginToken, origin: $origin) {
            tokens { accessOrWorkspaceAgnosticToken { token } }
          }
        }
      `,
      variables: { loginToken, origin: CRM_ORIGIN },
    }),
  });
  const authJson = await authRes.json();
  if (authJson.errors?.length) throw new Error('Auth exchange falló: ' + JSON.stringify(authJson.errors));
  return authJson.data.getAuthTokensFromLoginToken.tokens.accessOrWorkspaceAgnosticToken.token;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildFilterStep({ id, campaignValue, statusValue, nextStepId, posX = 400, posY = 100 }) {
  const groupId = randomUUID();
  return {
    id,
    name: 'Filtro de campaña y estado',
    type: 'FILTER',
    valid: true,
    position: { x: posX, y: posY },
    nextStepIds: [nextStepId],
    settings: {
      outputSchema: {},
      errorHandlingOptions: {
        retryOnFailure: { value: false },
        continueOnFailure: { value: false },
      },
      input: {
        stepFilterGroups: [
          { id: groupId, logicalOperator: 'AND', positionInStepFilterGroup: 0 },
        ],
        stepFilters: [
          {
            id: randomUUID(),
            type: 'TEXT',
            stepOutputKey: '{{trigger.properties.after.campaignName}}',
            operand: 'CONTAINS',
            value: campaignValue,
            stepFilterGroupId: groupId,
            positionInStepFilterGroup: 0,
          },
          {
            id: randomUUID(),
            type: 'TEXT',
            stepOutputKey: '{{trigger.properties.after.outreachStatus}}',
            operand: 'CONTAINS',
            value: statusValue,
            stepFilterGroupId: groupId,
            positionInStepFilterGroup: 1,
          },
        ],
      },
    },
  };
}

function buildCreateTaskStep({ id, title, posX = 400, posY = 300 }) {
  return {
    id,
    name: 'Crear tarea',
    type: 'CREATE_RECORD',
    valid: true,
    position: { x: posX, y: posY },
    nextStepIds: [],
    settings: {
      outputSchema: {},
      errorHandlingOptions: {
        retryOnFailure: { value: false },
        continueOnFailure: { value: false },
      },
      input: {
        objectName: 'task',
        objectRecord: {
          title,
          status: 'TODO',
        },
      },
    },
  };
}

function buildTrigger(firstStepId) {
  return {
    type: 'DATABASE_EVENT',
    name: 'Record is Updated',
    position: { x: 0, y: 0 },
    settings: {
      eventName: 'opportunity.updated',
      outputSchema: {},
    },
    nextStepIds: [firstStepId],
  };
}

// ─── Mutations helpers ────────────────────────────────────────────────────────

async function setTrigger(client, versionId, trigger) {
  await client.gql(`
    mutation SetTrigger($id: UUID!, $trigger: JSON) {
      updateWorkflowVersion(id: $id, data: { trigger: $trigger }) { id }
    }
  `, { id: versionId, trigger });
}

async function createStep(client, versionId, stepType, stepId, parentStepId, position) {
  // Returns WorkflowVersionStepChangesDTO (stepsDiff/triggerDiff) — no createdStep field.
  // We pre-generate stepId so we don't need to read the response.
  await client.gql(`
    mutation CreateStep($input: CreateWorkflowVersionStepInput!) {
      createWorkflowVersionStep(input: $input) { stepsDiff }
    }
  `, {
    input: {
      workflowVersionId: versionId,
      stepType,
      id: stepId,
      parentStepId,
      position,
    },
  });
}

async function updateStep(client, versionId, step) {
  const data = await client.gql(`
    mutation UpdateStep($input: UpdateWorkflowVersionStepInput!) {
      updateWorkflowVersionStep(input: $input) { id type valid }
    }
  `, {
    input: { workflowVersionId: versionId, step },
  });
  return data.updateWorkflowVersionStep;
}

async function activate(client, versionId) {
  await client.gql(`
    mutation Activate($versionId: UUID!) {
      activateWorkflowVersion(workflowVersionId: $versionId)
    }
  `, { versionId });
}

// ─── Workflow setup helper ────────────────────────────────────────────────────

async function setupWorkflowVersion(client, { versionId, statusValue, taskTitle }) {
  const filterId = randomUUID();
  const taskId = randomUUID();

  const trigger = buildTrigger(filterId);

  // 1. Set trigger
  await setTrigger(client, versionId, trigger);
  console.log('  ✓ Trigger configurado (opportunity.updated)');

  // 2. Create FILTER step (after trigger)
  await createStep(client, versionId, 'FILTER', filterId, 'trigger', { x: 400, y: 150 });
  console.log('  ✓ Paso FILTER creado:', filterId.slice(0, 8));

  // 3. Create CREATE_RECORD step (after filter)
  await createStep(client, versionId, 'CREATE_RECORD', taskId, filterId, { x: 400, y: 350 });
  console.log('  ✓ Paso CREATE_RECORD creado:', taskId.slice(0, 8));

  // 4. Update FILTER with conditions + preserve nextStepIds
  const filterStep = buildFilterStep({
    id: filterId,
    campaignValue: 'TEST — IA Mujeres 2026',
    statusValue,
    nextStepId: taskId,
  });
  await updateStep(client, versionId, filterStep);
  console.log('  ✓ FILTER actualizado (campaignName + outreachStatus =', statusValue + ')');

  // 5. Update CREATE_RECORD with task settings
  const taskStep = buildCreateTaskStep({ id: taskId, title: taskTitle });
  await updateStep(client, versionId, taskStep);
  console.log('  ✓ CREATE_RECORD actualizado (task:', taskTitle.slice(0, 40) + '...)');

  return { filterId, taskId };
}

// ─── WF-2: Primer email enviado ───────────────────────────────────────────────

async function setupWF2(client, dry) {
  const WF2_ID = '9de550ec-626e-421f-bc61-300dfe7ffa19';
  const WF2_VERSION_ID = '3b70f177-9381-44f5-9552-ca9db34fa4bc';

  console.log('\n=== WF-2: Primer email enviado ===');
  console.log('  workflow ID: ', WF2_ID);
  console.log('  version ID:  ', WF2_VERSION_ID);

  if (dry) {
    console.log('  [DRY-RUN] setTrigger (opportunity.updated)');
    console.log('  [DRY-RUN] createWorkflowVersionStep FILTER (parentStepId: trigger)');
    console.log('  [DRY-RUN] createWorkflowVersionStep CREATE_RECORD (parentStepId: filterId)');
    console.log('  [DRY-RUN] updateWorkflowVersionStep FILTER con condiciones');
    console.log('  [DRY-RUN] updateWorkflowVersionStep CREATE_RECORD con task title');
    console.log('  [DRY-RUN] activateWorkflowVersion');
    return { status: 'dry-run', wfId: WF2_ID, versionId: WF2_VERSION_ID };
  }

  // Verificar estado actual antes de reconfigurar
  const wf2Data = await client.gql(`
    query { workflowVersions(filter: { id: { eq: "${WF2_VERSION_ID}" } }, first: 1) {
      edges { node { id status } }
    }}
  `);
  const wf2Status = wf2Data.workflowVersions?.edges?.[0]?.node?.status;
  if (wf2Status === 'ACTIVE') {
    console.log('  ✓ WF-2 ya está ACTIVO — sin cambios');
    return { status: 'already-active', wfId: WF2_ID, versionId: WF2_VERSION_ID };
  }

  await setupWorkflowVersion(client, {
    versionId: WF2_VERSION_ID,
    statusValue: 'first_email_sent',
    taskTitle: '[TEST] Follow-up: {{trigger.properties.after.name}}',
  });

  await activate(client, WF2_VERSION_ID);
  console.log('  ✓ WF-2 ACTIVO');

  return { status: 'active', wfId: WF2_ID, versionId: WF2_VERSION_ID };
}

// ─── WF-3: Respuesta recibida ─────────────────────────────────────────────────

async function setupWF3(client, dry) {
  console.log('\n=== WF-3: Respuesta recibida ===');

  if (dry) {
    console.log('  [DRY-RUN] createWorkflow "TEST — WF-3 Respuesta recibida"');
    console.log('  [DRY-RUN] createWorkflowVersion DRAFT');
    console.log('  [DRY-RUN] setTrigger (opportunity.updated)');
    console.log('  [DRY-RUN] createWorkflowVersionStep FILTER + CREATE_RECORD');
    console.log('  [DRY-RUN] updateWorkflowVersionStep x2');
    console.log('  [DRY-RUN] activateWorkflowVersion');
    return { status: 'dry-run' };
  }

  // 1. Buscar si WF-3 ya existe (de ejecución anterior fallida)
  const existingWf3 = await client.gql(`
    query { workflows(filter: { name: { like: "%WF-3 Respuesta recibida%" } }, first: 1) {
      edges { node { id name
        versions(orderBy: { createdAt: DescNullsLast }, first: 1) {
          edges { node { id status } }
        }
      }}
    }}
  `);
  let wfId, versionId;
  const existingNode = existingWf3.workflows?.edges?.[0]?.node;

  if (existingNode) {
    wfId = existingNode.id;
    const existingVersion = existingNode.versions?.edges?.[0]?.node;
    versionId = existingVersion?.id;
    const existingStatus = existingVersion?.status;
    console.log('  ↩ Workflow existente encontrado:', wfId.slice(0, 8));
    if (existingStatus === 'ACTIVE') {
      console.log('  ✓ WF-3 ya está ACTIVO — sin cambios');
      return { status: 'already-active', wfId, versionId };
    }
    console.log('  ✓ Versión DRAFT existente:', versionId);
  } else {
    // Crear workflow nuevo (el post-hook crea automáticamente una versión DRAFT "v1")
    const wfData = await client.gql(`
      mutation { createWorkflow(data: { name: "TEST — WF-3 Respuesta recibida" }) { id name } }
    `);
    wfId = wfData.createWorkflow.id;
    console.log('  ✓ Workflow creado:', wfId);

    const versionsData = await client.gql(`
      query GetVersions($wfId: ID!) {
        workflowVersions(filter: { workflowId: { eq: $wfId } }, first: 1) {
          edges { node { id status } }
        }
      }
    `, { wfId });
    versionId = versionsData.workflowVersions?.edges?.[0]?.node?.id;
    if (!versionId) throw new Error('No se encontró versión DRAFT auto-creada');
    console.log('  ✓ Versión DRAFT obtenida:', versionId);
  }

  await setupWorkflowVersion(client, {
    versionId,
    statusValue: 'replied',
    taskTitle: '[TEST] Responder y proponer reunión: {{trigger.properties.after.name}}',
  });

  await activate(client, versionId);
  console.log('  ✓ WF-3 ACTIVO');

  return { status: 'active', wfId, versionId };
}

// ─── Verificación final ───────────────────────────────────────────────────────

async function verifyWorkflows(client) {
  console.log('\n=== Verificación ===');
  const data = await client.gql(`
    query {
      workflows(filter: { name: { like: "%TEST%" } }) {
        edges { node {
          id name
          versions(orderBy: { createdAt: DescNullsLast }, first: 1) {
            edges { node { id status } }
          }
        }}
      }
    }
  `);

  const wfs = data.workflows?.edges || [];
  wfs.forEach(({ node: wf }) => {
    const v = wf.versions?.edges?.[0]?.node;
    const status = v?.status || 'no version';
    const icon = status === 'ACTIVE' ? '✓' : '○';
    console.log(`  ${icon} ${wf.name.padEnd(45)} ${status}`);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { apply, password } = parseArgs();
  console.log(`\n=== IA Mujeres — Test Workflows Setup (${apply ? 'APPLY' : 'DRY-RUN'}) ===`);

  const creds = readCredentials();

  let token = creds.apiKey;

  if (apply) {
    const effectivePassword = password || creds.password;
    if (!effectivePassword) {
      console.error('\nERROR: se necesita contraseña del CRM.');
      console.error('  Opción A: node scripts/ia_mujeres_crm_test_workflows_v1.mjs --apply --password TU_CONTRASEÑA');
      console.error('  Opción B: añadir TWENTY_CRM_PASSWORD=... a scripts/.env\n');
      process.exit(1);
    }
    console.log('\n--- Autenticación de usuario ---');
    token = await getUserToken(creds.baseUrl, effectivePassword);
    console.log('  ✓ JWT de usuario obtenido');
  }

  const client = new TwentyClient({ baseUrl: creds.baseUrl, token });

  const wf2 = await setupWF2(client, !apply);
  const wf3 = await setupWF3(client, !apply);

  if (apply) {
    await verifyWorkflows(client);
  }

  console.log('\n=== Resultado ===');
  console.log('WF-2:', wf2.status);
  console.log('WF-3:', wf3.status);

  if (!apply) {
    console.log('\nEjecuta con --apply --password <pass> para aplicar los cambios.');
  } else {
    console.log('\nWorkflows listos. Pasa al Paso 2: email draft.');
  }
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});

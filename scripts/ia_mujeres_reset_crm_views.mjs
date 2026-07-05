#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { readTwentyCredentials } from './crm_manual_update_crew/twenty-client.mjs';

const BUSINESS_LINE_NAME = 'SkilLand IA Mujeres';
const CAMPAIGN_NAME = 'IA Mujeres 2026';
const OUTPUT_DIR = path.resolve('04_outputs/ia_mujeres_crm_execution');
const REPORT_PATH = path.join(OUTPUT_DIR, '2026-06-08_crm_views_reset_report.json');

const KEEP_VIEW_NAMES = new Set(['All Opportunities', 'By Stage (table)', 'By Stage']);
const FUNNEL_VIEW_NAME = 'IA Mujeres — Funnel';

const VIEW_FIELDS = [
  ['name', 320],
  ['company', 240],
  ['pointOfContact', 220],
  ['iaMujeresFunnelStage', 220],
  ['outreachStatus', 190],
  ['followUpDueAt', 180],
  ['lastEmailSentAt', 180],
  ['lastReplyAt', 180],
  ['gmailThreadId', 190],
  ['needsManualReview', 150],
];

const IA_STAGE_OPTIONS = [
  ['NOT_SENT', 'Sin enviar'],
  ['DRAFT_CREATED', 'Draft creado'],
  ['EMAIL_1_SENT', 'Email 1 enviado'],
  ['EMAIL_1_RECEIVED_SIGNAL', 'Email 1 recibido / señal débil'],
  ['NO_REPLY', 'Sin respuesta'],
  ['FOLLOW_UP_1_PENDING', 'Follow-up 1 pendiente'],
  ['FOLLOW_UP_1_DRAFTED', 'Follow-up 1 draft creado'],
  ['FOLLOW_UP_1_SENT', 'Follow-up 1 enviado'],
  ['FOLLOW_UP_2_PENDING', 'Follow-up 2 pendiente'],
  ['FOLLOW_UP_2_DRAFTED', 'Follow-up 2 draft creado'],
  ['FOLLOW_UP_2_SENT', 'Follow-up 2 enviado'],
  ['NURTURING', 'Nurturing'],
  ['REPLY_RECEIVED', 'Respuesta recibida'],
  ['MEETING_PROPOSED', 'Reunión propuesta'],
  ['MEETING_SCHEDULED', 'Reunión agendada'],
  ['MEETING_DONE', 'Reunión realizada'],
  ['NOT_INTERESTED', 'No interesado'],
  ['WRONG_CONTACT_MANUAL_REVIEW', 'Contacto incorrecto / revisión manual'],
];

function parseArgs(argv) {
  const args = { apply: false };
  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage:
  node scripts/ia_mujeres_reset_crm_views.mjs
  node scripts/ia_mujeres_reset_crm_views.mjs --apply

Dry-run by default. With --apply, deletes broken Opportunity views except the
three global views and recreates one clean IA Mujeres funnel kanban.
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

class TwentyMetadataClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async request(query, variables = {}) {
    const response = await fetch(`${this.baseUrl}/metadata`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok || json.errors?.length) {
      throw new Error(`Twenty metadata error ${response.status}: ${JSON.stringify(json).slice(0, 1000)}`);
    }
    return json.data;
  }

  async objects() {
    const response = await fetch(`${this.baseUrl}/rest/metadata/objects`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) throw new Error(`Twenty metadata REST error ${response.status}: ${text.slice(0, 1000)}`);
    return json.data.objects;
  }
}

async function fetchViews(client, objectMetadataId) {
  const data = await client.request(
    `query Views($objectMetadataId: String!) {
      getCoreViews(objectMetadataId: $objectMetadataId) {
        id
        name
        type
        position
        visibility
        mainGroupByFieldMetadataId
        shouldHideEmptyGroups
        viewFields { id fieldMetadataId isVisible position size }
        viewFilters { id fieldMetadataId operand value }
        viewGroups { id fieldValue isVisible position }
      }
    }`,
    { objectMetadataId },
  );
  return data.getCoreViews;
}

function fieldMap(opportunityObject) {
  return new Map(opportunityObject.fields.map((field) => [field.name, field]));
}

function shouldDeleteView(view) {
  if (view.type === 'FIELDS_WIDGET') return false;
  if (KEEP_VIEW_NAMES.has(view.name)) return false;
  return true;
}

async function deleteView(client, viewId) {
  const data = await client.request(
    `mutation DeleteView($id: String!) {
      deleteCoreView(id: $id)
    }`,
    { id: viewId },
  );
  return data.deleteCoreView;
}

async function createFunnelView(client, opportunityObject, fields) {
  const iaStageField = fields.get('iaMujeresFunnelStage');
  if (!iaStageField) throw new Error('iaMujeresFunnelStage field missing');
  const data = await client.request(
    `mutation CreateView($input: CreateViewInput!) {
      createCoreView(input: $input) { id name type }
    }`,
    {
      input: {
        name: FUNNEL_VIEW_NAME,
        objectMetadataId: opportunityObject.id,
        type: 'KANBAN',
        icon: 'IconLayoutKanban',
        position: 20,
        visibility: 'WORKSPACE',
        mainGroupByFieldMetadataId: iaStageField.id,
        shouldHideEmptyGroups: false,
      },
    },
  );
  return data.createCoreView;
}

async function createViewField(client, viewId, field, size, position) {
  const data = await client.request(
    `mutation CreateViewField($input: CreateViewFieldInput!) {
      createCoreViewField(input: $input) { id }
    }`,
    { input: { viewId, fieldMetadataId: field.id, isVisible: true, size, position } },
  );
  return data.createCoreViewField.id;
}

async function createViewFilter(client, viewId, field, value) {
  const operand = field.type === 'TEXT' ? 'CONTAINS' : 'IS';
  const filterValue = field.type === 'TEXT' ? value : JSON.stringify(value);
  const data = await client.request(
    `mutation CreateViewFilter($input: CreateViewFilterInput!) {
      createCoreViewFilter(input: $input) { id }
    }`,
    {
      input: {
        viewId,
        fieldMetadataId: field.id,
        operand,
        value: filterValue,
      },
    },
  );
  return data.createCoreViewFilter.id;
}

async function createViewGroup(client, viewId, fieldValue, position) {
  const data = await client.request(
    `mutation CreateViewGroup($input: CreateViewGroupInput!) {
      createCoreViewGroup(input: $input) { id fieldValue }
    }`,
    { input: { viewId, fieldValue, isVisible: true, position } },
  );
  return data.createCoreViewGroup.id;
}

async function deleteViewGroup(client, groupId) {
  const data = await client.request(
    `mutation DeleteViewGroup($input: DeleteViewGroupInput!) {
      deleteCoreViewGroup(input: $input) { id fieldValue }
    }`,
    { input: { id: groupId } },
  );
  return data.deleteCoreViewGroup;
}

async function normalizeFunnelGroups(client, opportunityObjectId, viewId, report) {
  const expectedValues = new Set(IA_STAGE_OPTIONS.map(([value]) => value));
  let views = await fetchViews(client, opportunityObjectId);
  let view = views.find((item) => item.id === viewId);
  const seen = new Set();

  for (const group of view.viewGroups) {
    if (!expectedValues.has(group.fieldValue) || seen.has(group.fieldValue)) {
      const deleted = await deleteViewGroup(client, group.id);
      report.groupsDeleted.push({ id: group.id, fieldValue: group.fieldValue, result: deleted });
      continue;
    }
    seen.add(group.fieldValue);
  }

  views = await fetchViews(client, opportunityObjectId);
  view = views.find((item) => item.id === viewId);
  const currentValues = new Set(view.viewGroups.map((group) => group.fieldValue));
  for (const [value] of IA_STAGE_OPTIONS) {
    if (currentValues.has(value)) continue;
    const id = await createViewGroup(client, viewId, value, IA_STAGE_OPTIONS.findIndex(([candidate]) => candidate === value));
    report.groupsCreated.push({ fieldValue: value, id });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const client = new TwentyMetadataClient(readTwentyCredentials());
  const objects = await client.objects();
  const opportunity = objects.find((object) => object.nameSingular === 'opportunity');
  if (!opportunity) throw new Error('Opportunity metadata not found');
  const fields = fieldMap(opportunity);
  const before = await fetchViews(client, opportunity.id);
  const toDelete = before.filter(shouldDeleteView);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? 'apply' : 'dry-run',
    kept: before.filter((view) => !shouldDeleteView(view)).map(({ id, name, type }) => ({ id, name, type })),
    deleted: [],
    plannedDelete: toDelete.map(({ id, name, type }) => ({ id, name, type })),
    created: null,
    fieldsCreated: [],
    filtersCreated: [],
    groupsCreated: [],
    groupsDeleted: [],
    after: [],
    notes: [
      '`Opportunity Record Page Fields` is a FIELDS_WIDGET, not a commercial list/kanban view, so it is preserved.',
      'The new IA Mujeres view uses one TEXT-safe campaignName CONTAINS filter.',
    ],
  };

  if (args.apply) {
    for (const view of toDelete) {
      const ok = await deleteView(client, view.id);
      report.deleted.push({ id: view.id, name: view.name, type: view.type, ok });
    }

    const created = await createFunnelView(client, opportunity, fields);
    report.created = created;

    for (const [fieldName, size] of VIEW_FIELDS) {
      const field = fields.get(fieldName);
      if (!field) {
        report.fieldsCreated.push({ fieldName, status: 'missing' });
        continue;
      }
      const id = await createViewField(client, created.id, field, size, VIEW_FIELDS.findIndex(([candidate]) => candidate === fieldName));
      report.fieldsCreated.push({ fieldName, id });
    }

    const campaignField = fields.get('campaignName');
    if (!campaignField) throw new Error('campaignName field missing');
    const filterId = await createViewFilter(client, created.id, campaignField, CAMPAIGN_NAME);
    report.filtersCreated.push({ fieldName: 'campaignName', operand: 'IS', value: CAMPAIGN_NAME, id: filterId });

    await normalizeFunnelGroups(client, opportunity.id, created.id, report);
  }

  const after = await fetchViews(client, opportunity.id);
  report.after = after.map(({ id, name, type, position, mainGroupByFieldMetadataId, viewFilters, viewFields, viewGroups }) => ({
    id,
    name,
    type,
    position,
    mainGroupByFieldMetadataId,
    filters: viewFilters.length,
    fields: viewFields.length,
    groups: viewGroups.length,
  }));

  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    status: 'ok',
    mode: report.mode,
    deleted: report.deleted.length,
    plannedDelete: report.plannedDelete.length,
    created: report.created,
    reportPath: REPORT_PATH,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

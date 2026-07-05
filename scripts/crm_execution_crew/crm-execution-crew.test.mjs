import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runExecutionAgent } from './agents/execution-agent.agent.mjs';
import { parseCrmActionRequest } from './kernel/contracts.mjs';
import { CrmExecutionLogger } from './kernel/logger.mjs';
import { planCrmOperations } from './kernel/planner.mjs';
import { reviewCrmOperationPlan } from './kernel/reviewer.mjs';
import { runCrmExecutionCrew } from './workflows/crm-execution.workflow.mjs';
import { runTwentyDocsSearchSkill } from './skills/twenty-docs-search.skill.mjs';
import { runCrmExecutionSkill } from './skills/crm-execution.skill.mjs';
import { runCrmMetadataSkill } from './skills/twenty-metadata.skill.mjs';
import { runTwentyRecordSearchSkill } from './skills/twenty-record-search.skill.mjs';

test('CrmActionRequest validates structured requests and fills defaults', () => {
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    operations: [
      {
        type: 'update_opportunity',
        lookup: { opportunityId: 'opp-1' },
        data: { stage: 'BATCH_READY' },
      },
    ],
  });

  assert.equal(request.mode, 'dry_run');
  assert.equal(request.constraints.maxRecords, 200);
  assert.match(request.requestId, /^crmexec_/);
});

test('Docs skill returns local Twenty docs evidence without web access', async () => {
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    intent: 'Create notes and tasks through Twenty API',
    operations: [{ type: 'create_note', lookup: { opportunityId: 'opp-1' }, markdown: 'Note' }],
  });

  const artifact = await runTwentyDocsSearchSkill({ request });

  assert.equal(artifact.agent, 'twenty_docs_agent');
  assert.ok(artifact.docsConsulted.length > 0);
  assert.ok(
    artifact.docsConsulted.some((doc) =>
      doc.path.startsWith('packages/twenty-docs/'),
    ),
  );
});

test('Planner converts request operations into normalized operations', async () => {
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    operations: [
      {
        type: 'update_opportunity',
        lookup: { opportunityId: 'opp-1' },
        data: { stage: 'BATCH_READY' },
        note: { title: 'Audit', markdown: 'Ready for batch.' },
      },
    ],
  });
  const metadataArtifact = await runCrmMetadataSkill({
    request,
    metadataObjects: fakeMetadataObjects(),
    client: null,
  });
  const recordArtifact = await runTwentyRecordSearchSkill({
    request,
    recordIndex: fakeRecordIndex(),
    client: null,
  });

  const plan = planCrmOperations({
    request,
    metadataArtifact,
    recordArtifact,
    workflowArtifact: null,
    effectiveMode: 'dry_run',
  });

  assert.deepEqual(
    plan.operations.map((operation) => operation.type),
    ['update_record', 'create_note', 'link_note_to_targets'],
  );
  assert.equal(plan.operations[0].via, 'graphql');
  assert.equal(plan.operations[1].via, 'rest');
});

test('Planner converts update_task into a normalized task update operation', async () => {
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    operations: [
      {
        type: 'update_task',
        lookup: { opportunityId: 'opp-1', taskTitle: 'Follow up' },
        data: {
          status: 'DONE',
          dueAt: '2026-07-02T07:00:00.000Z',
          bodyV2: { markdown: 'Updated from crew.', blocknote: null },
        },
      },
    ],
  });
  const metadataArtifact = await runCrmMetadataSkill({
    request,
    metadataObjects: fakeMetadataObjects(),
    client: null,
  });
  const recordArtifact = await runTwentyRecordSearchSkill({
    request,
    recordIndex: fakeRecordIndex(),
    client: null,
  });

  const plan = planCrmOperations({
    request,
    metadataArtifact,
    recordArtifact,
    workflowArtifact: null,
    effectiveMode: 'dry_run',
  });

  assert.deepEqual(
    plan.operations.map((operation) => operation.type),
    ['update_record'],
  );
  assert.equal(plan.operations[0].object, 'task');
  assert.equal(plan.operations[0].recordId, 'task-1');
  assert.deepEqual(plan.operations[0].data, request.operations[0].data);
  assert.equal(plan.validation.blockingIssues.length, 0);
});

test('Planner supports create_opportunity with note and task linked to the created record', async () => {
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    operations: [
      {
        type: 'create_opportunity',
        lookup: { companyDomain: 'example.com', personEmail: 'ada@example.com' },
        data: {
          name: 'IA Mujeres - SIC4Change',
          stage: 'BATCH_READY',
          businessLineName: 'SkilLand IA Mujeres',
        },
        note: { title: 'Audit', markdown: 'Created from meeting notes.' },
        task: { title: 'Contact SIC4Change', markdown: 'Via Romina.' },
      },
    ],
  });
  const metadataArtifact = await runCrmMetadataSkill({
    request,
    metadataObjects: fakeMetadataObjects(),
    client: null,
  });
  const recordArtifact = await runTwentyRecordSearchSkill({
    request,
    recordIndex: fakeRecordIndex(),
    client: null,
  });

  const plan = planCrmOperations({
    request,
    metadataArtifact,
    recordArtifact,
    workflowArtifact: null,
    effectiveMode: 'dry_run',
  });

  assert.deepEqual(
    plan.operations.map((operation) => operation.type),
    [
      'create_record',
      'create_note',
      'link_note_to_targets',
      'create_task',
      'link_task_to_targets',
    ],
  );
  assert.equal(plan.operations[0].object, 'opportunity');
  assert.equal(plan.operations[0].data.companyId, 'company-1');
  assert.equal(plan.operations[0].data.pointOfContactId, 'person-1');
  assert.equal(plan.operations[2].target.opportunityTempId, 'opportunity:0');
  assert.equal(plan.validation.blockingIssues.length, 0);
});

test('Planner supports company and person upsert create/update paths', async () => {
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    operations: [
      {
        type: 'upsert_company',
        lookup: { companyDomain: 'new.example' },
        data: {
          name: 'New Example',
          domainName: { primaryLinkUrl: 'https://new.example' },
        },
      },
      {
        type: 'upsert_company',
        lookup: { companyDomain: 'example.com' },
        data: { phoneMain: '+1 555 0100' },
      },
      {
        type: 'upsert_person',
        lookup: { personEmail: 'new.person@example.com', companyDomain: 'example.com' },
        data: {
          name: { firstName: 'New', lastName: 'Person' },
        },
      },
    ],
  });
  const metadataArtifact = await runCrmMetadataSkill({
    request,
    metadataObjects: fakeMetadataObjects(),
    client: null,
  });
  const recordArtifact = await runTwentyRecordSearchSkill({
    request,
    recordIndex: fakeRecordIndex(),
    client: null,
  });

  const plan = planCrmOperations({
    request,
    metadataArtifact,
    recordArtifact,
    workflowArtifact: null,
    effectiveMode: 'dry_run',
  });

  assert.deepEqual(
    plan.operations.map((operation) => `${operation.type}:${operation.object}`),
    ['create_record:company', 'update_record:company', 'create_record:person'],
  );
  assert.equal(plan.operations[0].tempId, 'company:0');
  assert.equal(plan.operations[1].recordId, 'company-1');
  assert.equal(plan.operations[2].data.emails.primaryEmail, 'new.person@example.com');
  assert.equal(plan.operations[2].data.companyId, 'company-1');
  assert.equal(plan.validation.blockingIssues.length, 0);
});

test('Planner expands account/contact/opportunity wrapper with temp targets', async () => {
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    constraints: { maxRecords: 10 },
    operations: [
      {
        type: 'upsert_account_contact_opportunity',
        lookup: {
          companyDomain: 'fifede.org',
          companyName: 'FIFEDE',
          personEmail: 'contratacion@fifede.org',
          opportunityName: 'FIFEDE - PASA/05/2026',
        },
        company: {
          data: {
            name: 'FIFEDE',
            domainName: { primaryLinkUrl: 'https://fifede.org' },
          },
        },
        person: {
          data: {
            name: { firstName: 'Contratación', lastName: 'FIFEDE' },
          },
        },
        opportunity: {
          data: {
            stage: 'BATCH_READY',
            businessLineName: 'Skill&licitaciones',
          },
        },
        note: { title: 'Oferta presentada', markdown: 'Oferta presentada.' },
        task: { title: 'Follow-up FIFEDE', markdown: 'Revisar adjudicación.' },
      },
    ],
  });
  const metadataArtifact = await runCrmMetadataSkill({
    request,
    metadataObjects: fakeMetadataObjects(),
    client: null,
  });
  const recordArtifact = await runTwentyRecordSearchSkill({
    request,
    recordIndex: fakeRecordIndex(),
    client: null,
  });

  const plan = planCrmOperations({
    request,
    metadataArtifact,
    recordArtifact,
    workflowArtifact: null,
    effectiveMode: 'dry_run',
  });

  assert.deepEqual(
    plan.operations.map((operation) => `${operation.type}:${operation.object ?? ''}`),
    [
      'create_record:company',
      'create_record:person',
      'create_record:opportunity',
      'create_note:',
      'link_note_to_targets:',
      'create_task:',
      'link_task_to_targets:',
    ],
  );
  assert.equal(plan.operations[0].tempId, 'company:0');
  assert.equal(plan.operations[1].data.companyTempId, 'company:0');
  assert.equal(plan.operations[2].data.companyTempId, 'company:0');
  assert.equal(plan.operations[2].data.pointOfContactTempId, 'person:0');
  assert.equal(plan.operations[4].target.companyTempId, 'company:0');
  assert.equal(plan.operations[4].target.personTempId, 'person:0');
  assert.equal(plan.operations[4].target.opportunityTempId, 'opportunity:0');
  assert.equal(plan.validation.blockingIssues.length, 0);
});

test('Reviewer blocks create_company when a lookup already matches', async () => {
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    operations: [
      {
        type: 'create_company',
        lookup: { companyDomain: 'example.com' },
        data: { name: 'Example' },
      },
    ],
  });
  const metadataArtifact = await runCrmMetadataSkill({
    request,
    metadataObjects: fakeMetadataObjects(),
    client: null,
  });
  const recordArtifact = await runTwentyRecordSearchSkill({
    request,
    recordIndex: fakeRecordIndex(),
    client: null,
  });
  const plan = planCrmOperations({
    request,
    metadataArtifact,
    recordArtifact,
    workflowArtifact: null,
    effectiveMode: 'dry_run',
  });
  const review = reviewCrmOperationPlan({
    request,
    plan,
    effectiveMode: 'dry_run',
    applyRequested: false,
    confirmationProvided: false,
  });

  assert.equal(review.approved, false);
  assert.ok(review.blockingIssues.some((item) => item.code === 'blocked_operation'));
});

test('Executor creates opportunity and links note/task to the created id', async () => {
  const client = fakeClient();
  const plan = {
    requestId: 'req-create-1',
    mode: 'apply',
    operations: [
      {
        id: 'op-create',
        type: 'create_record',
        object: 'opportunity',
        data: { name: 'IA Mujeres - SIC4Change' },
        tempId: 'opportunity:0',
        target: {},
      },
      {
        id: 'op-note',
        type: 'create_note',
        title: 'Audit',
        markdown: 'Created.',
        tempId: 'note:0',
        target: { opportunityTempId: 'opportunity:0' },
      },
      {
        id: 'op-link-note',
        type: 'link_note_to_targets',
        sourceTempId: 'note:0',
        target: { opportunityTempId: 'opportunity:0' },
      },
      {
        id: 'op-task',
        type: 'create_task',
        title: 'Follow up',
        markdown: 'Call.',
        tempId: 'task:0',
        target: { opportunityTempId: 'opportunity:0' },
      },
      {
        id: 'op-link-task',
        type: 'link_task_to_targets',
        sourceTempId: 'task:0',
        target: { opportunityTempId: 'opportunity:0' },
      },
    ],
  };

  const artifact = await runCrmExecutionSkill({
    client,
    plan,
    effectiveMode: 'apply',
    review: { approved: true, blockingIssues: [], warnings: [] },
  });

  assert.equal(artifact.status, 'apply_completed');
  assert.ok(
    client.writeCalls.some(
      (call) => call.type === 'gql' && call.query.includes('createOpportunity'),
    ),
  );
  assert.ok(
    client.writeCalls.some(
      (call) =>
        call.type === 'rest' &&
        call.pathName === '/noteTargets' &&
        call.body.targetOpportunityId === 'created-opp-1',
    ),
  );
  assert.ok(
    client.writeCalls.some(
      (call) =>
        call.type === 'rest' &&
        call.pathName === '/taskTargets' &&
        call.body.targetOpportunityId === 'created-opp-1',
    ),
  );
});

test('Executor creates account/contact/opportunity and links note/task through temp ids', async () => {
  const client = fakeClient();
  const plan = {
    requestId: 'req-wrapper-1',
    mode: 'apply',
    operations: [
      {
        id: 'op-company',
        type: 'create_record',
        object: 'company',
        data: { name: 'FIFEDE' },
        tempId: 'company:0',
        target: { companyTempId: 'company:0' },
      },
      {
        id: 'op-person',
        type: 'create_record',
        object: 'person',
        data: {
          name: { firstName: 'Contratación', lastName: 'FIFEDE' },
          emails: { primaryEmail: 'contratacion@fifede.org', additionalEmails: [] },
          companyTempId: 'company:0',
        },
        tempId: 'person:0',
        target: { personTempId: 'person:0', companyTempId: 'company:0' },
      },
      {
        id: 'op-opportunity',
        type: 'create_record',
        object: 'opportunity',
        data: {
          name: 'FIFEDE - PASA/05/2026',
          companyTempId: 'company:0',
          pointOfContactTempId: 'person:0',
        },
        tempId: 'opportunity:0',
        target: {
          opportunityTempId: 'opportunity:0',
          personTempId: 'person:0',
          companyTempId: 'company:0',
        },
      },
      {
        id: 'op-note',
        type: 'create_note',
        title: 'Oferta',
        markdown: 'Presentada.',
        tempId: 'note:0',
        target: { opportunityTempId: 'opportunity:0' },
      },
      {
        id: 'op-link-note',
        type: 'link_note_to_targets',
        sourceTempId: 'note:0',
        target: {
          opportunityTempId: 'opportunity:0',
          personTempId: 'person:0',
          companyTempId: 'company:0',
        },
      },
      {
        id: 'op-task',
        type: 'create_task',
        title: 'Follow-up',
        markdown: 'Call.',
        tempId: 'task:0',
        target: { opportunityTempId: 'opportunity:0' },
      },
      {
        id: 'op-link-task',
        type: 'link_task_to_targets',
        sourceTempId: 'task:0',
        target: {
          opportunityTempId: 'opportunity:0',
          personTempId: 'person:0',
          companyTempId: 'company:0',
        },
      },
    ],
  };

  const artifact = await runCrmExecutionSkill({
    client,
    plan,
    effectiveMode: 'apply',
    review: { approved: true, blockingIssues: [], warnings: [] },
  });

  assert.equal(artifact.status, 'apply_completed');
  assert.ok(
    client.writeCalls.some(
      (call) => call.type === 'gql' && call.query.includes('createCompany'),
    ),
  );
  assert.ok(
    client.writeCalls.some(
      (call) =>
        call.type === 'gql' &&
        call.query.includes('createPerson') &&
        call.variables.data.company.connect.where.id === 'created-company-1',
    ),
  );
  assert.ok(
    client.writeCalls.some(
      (call) =>
        call.type === 'gql' &&
        call.query.includes('createOpportunity') &&
        call.variables.data.companyId === 'created-company-1' &&
        call.variables.data.pointOfContactId === 'created-person-1',
    ),
  );
  assert.ok(
    client.writeCalls.some(
      (call) =>
        call.type === 'rest' &&
        call.pathName === '/noteTargets' &&
        call.body.targetCompanyId === 'created-company-1',
    ),
  );
  assert.ok(
    client.writeCalls.some(
      (call) =>
        call.type === 'rest' &&
        call.pathName === '/taskTargets' &&
        call.body.targetPersonId === 'created-person-1',
    ),
  );
});

test('Executor can finalize a newly created task as DONE', async () => {
  const client = fakeClient();
  const plan = {
    requestId: 'req-create-task-done-1',
    mode: 'apply',
    operations: [
      {
        id: 'op-task',
        type: 'create_task',
        title: 'Historical task',
        markdown: 'Already executed.',
        status: 'DONE',
        tempId: 'task:0',
        target: { opportunityId: 'opp-1' },
      },
      {
        id: 'op-link-task',
        type: 'link_task_to_targets',
        sourceTempId: 'task:0',
        target: { opportunityId: 'opp-1' },
      },
    ],
  };

  const artifact = await runCrmExecutionSkill({
    client,
    plan,
    effectiveMode: 'apply',
    review: { approved: true, blockingIssues: [], warnings: [] },
  });

  assert.equal(artifact.status, 'apply_completed');
  assert.ok(
    client.writeCalls.some(
      (call) =>
        call.type === 'rest' &&
        call.pathName === '/tasks' &&
        call.body.status === 'TODO',
    ),
  );
  assert.ok(
    client.writeCalls.some(
      (call) =>
        call.type === 'gql' &&
        call.query.includes('CrmExecutionFinalizeCreatedTask'),
    ),
  );
});

test('Reviewer blocks deletes and metadata changes proposed to the planner', () => {
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    constraints: { maxRecords: 10 },
    operations: [
      { type: 'delete_record', lookup: { opportunityId: 'opp-1' } },
      { type: 'metadata_change', lookup: {}, data: { field: 'x' } },
    ],
  });
  const plan = planCrmOperations({
    request,
    metadataArtifact: emptyArtifact('metadata_schema_agent'),
    recordArtifact: emptyArtifact('record_resolver_agent'),
    workflowArtifact: null,
    effectiveMode: 'dry_run',
  });

  const review = reviewCrmOperationPlan({
    request,
    plan,
    effectiveMode: 'dry_run',
    applyRequested: false,
    confirmationProvided: false,
  });

  assert.equal(review.approved, false);
  assert.ok(review.blockingIssues.some((item) => item.code === 'blocked_operation'));
});

test('Reviewer blocks unknown fields and invalid select options from metadata', async () => {
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    operations: [
      {
        type: 'update_opportunity',
        lookup: { opportunityId: 'opp-1' },
        data: { missingField: 'x', stage: 'NOT_A_REAL_STAGE' },
      },
    ],
  });
  const metadataArtifact = await runCrmMetadataSkill({
    request,
    metadataObjects: fakeMetadataObjects(),
    client: null,
  });
  const recordArtifact = await runTwentyRecordSearchSkill({
    request,
    recordIndex: fakeRecordIndex(),
    client: null,
  });
  const plan = planCrmOperations({
    request,
    metadataArtifact,
    recordArtifact,
    workflowArtifact: null,
    effectiveMode: 'dry_run',
  });
  const review = reviewCrmOperationPlan({
    request,
    plan,
    effectiveMode: 'dry_run',
    applyRequested: false,
    confirmationProvided: false,
  });

  assert.equal(review.approved, false);
  assert.ok(review.blockingIssues.some((item) => item.code === 'unknown_field'));
  assert.ok(
    review.blockingIssues.some((item) => item.code === 'invalid_select_option'),
  );
});

test('Metadata validation covers update_task fields and status options', async () => {
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    operations: [
      {
        type: 'update_task',
        lookup: { taskId: 'task-1' },
        data: {
          missingField: 'x',
          status: 'NOT_A_REAL_STATUS',
        },
      },
    ],
  });

  const metadataArtifact = await runCrmMetadataSkill({
    request,
    metadataObjects: fakeMetadataObjects(),
    client: null,
  });

  assert.ok(
    metadataArtifact.blockingIssues.some((item) => item.code === 'unknown_field'),
  );
  assert.ok(
    metadataArtifact.blockingIssues.some(
      (item) => item.code === 'invalid_select_option',
    ),
  );
});

test('Record resolver can resolve update_task against a DONE task by title', async () => {
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    operations: [
      {
        type: 'update_task',
        lookup: { opportunityId: 'opp-1', taskTitle: 'Completed follow up' },
        data: { status: 'TODO' },
      },
    ],
  });

  const recordArtifact = await runTwentyRecordSearchSkill({
    request,
    recordIndex: fakeRecordIndex(),
    client: null,
  });

  assert.equal(recordArtifact.blockingIssues.length, 0);
  assert.equal(recordArtifact.resolvedRecords[0].recordIds.taskId, 'task-2');
});

test('Reviewer blocks ambiguous lookups and maxRecords overruns', async () => {
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    constraints: { maxRecords: 1 },
    operations: [
      {
        type: 'update_opportunity',
        lookup: { personEmail: 'shared@example.com' },
        data: { stage: 'BATCH_READY' },
      },
      {
        type: 'create_task',
        lookup: { opportunityId: 'opp-1' },
        title: 'Follow up',
        markdown: 'Call',
      },
      {
        type: 'create_note',
        lookup: { opportunityId: 'opp-1' },
        title: 'Audit',
        markdown: 'Batch note',
      },
    ],
  });
  const metadataArtifact = await runCrmMetadataSkill({
    request,
    metadataObjects: fakeMetadataObjects(),
    client: null,
  });
  const recordArtifact = await runTwentyRecordSearchSkill({
    request,
    recordIndex: fakeRecordIndex({ duplicatePeople: true }),
    client: null,
  });
  const plan = planCrmOperations({
    request,
    metadataArtifact,
    recordArtifact,
    workflowArtifact: null,
    effectiveMode: 'dry_run',
  });
  const review = reviewCrmOperationPlan({
    request,
    plan,
    effectiveMode: 'dry_run',
    applyRequested: false,
    confirmationProvided: false,
  });

  assert.equal(review.approved, false);
  assert.ok(review.blockingIssues.some((item) => item.code === 'ambiguous_lookup'));
  assert.ok(review.blockingIssues.some((item) => item.code === 'max_records_exceeded'));
});

test('Execution Agent does not execute when review is not approved', async () => {
  const client = fakeClient();
  const plan = {
    requestId: 'req-1',
    mode: 'apply',
    operations: [
      {
        id: 'op-1',
        type: 'update_record',
        object: 'opportunity',
        recordId: 'opp-1',
        data: { stage: 'BATCH_READY' },
      },
    ],
  };
  const artifact = await runCrmExecutionSkill({
    client,
    plan,
    effectiveMode: 'apply',
    review: {
      approved: false,
      blockingIssues: [{ code: 'blocked', message: 'No.' }],
      warnings: [],
    },
  });

  assert.equal(artifact.status, 'blocked');
  assert.equal(client.writeCalls.length, 0);
});

test('Dry-run passes through the full agentic flow but does not write', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-exec-test-'));
  const client = fakeClient();
  const request = parseCrmActionRequest({
    requester: 'unit_test',
    intent: 'Update opportunity and create note',
    constraints: { maxRecords: 10 },
    operations: [
      {
        type: 'update_opportunity',
        lookup: { opportunityId: 'opp-1' },
        data: { stage: 'BATCH_READY' },
        note: { title: 'Audit', markdown: 'Ready.' },
      },
    ],
  });

  const result = await runCrmExecutionCrew({
    request,
    client,
    effectiveMode: 'dry_run',
    applyRequested: false,
    confirmationProvided: false,
    outputDir: tempDir,
  });

  assert.equal(result.status, 'dry_run_completed');
  assert.equal(client.writeCalls.length, 0);
  assert.ok(result.agentArtifacts.some((artifact) => artifact.agent === 'twenty_docs_agent'));
  assert.ok(
    result.agentArtifacts.some(
      (artifact) => artifact.agent === 'api_operation_planner_agent',
    ),
  );
  assert.ok(fs.existsSync(result.logPath));

  const log = JSON.parse(fs.readFileSync(result.logPath, 'utf8'));
  assert.ok(log.agentArtifacts.some((artifact) => artifact.agent === 'execution_agent'));
});

test('Logger includes agent artifacts and redacts secrets', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-exec-log-test-'));
  const logger = new CrmExecutionLogger({ outputDir: tempDir });
  const logPath = logger.finish({
    requestId: 'req-1',
    requester: 'unit_test',
    request: { apiKey: 'secret-value' },
    agentArtifacts: [{ agent: 'test_agent', token: 'secret-token' }],
  });

  const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
  assert.equal(log.request.apiKey, '[REDACTED]');
  assert.equal(log.agentArtifacts[0].token, '[REDACTED]');
});

function emptyArtifact(agent) {
  return {
    agent,
    status: 'completed',
    warnings: [],
    blockingIssues: [],
  };
}

function fakeMetadataObjects() {
  return [
    {
      nameSingular: 'opportunity',
      namePlural: 'opportunities',
      fields: [
        {
          name: 'name',
          type: 'TEXT',
        },
        {
          name: 'stage',
          type: 'SELECT',
          options: [{ value: 'BATCH_READY', label: 'Batch ready' }],
        },
        { name: 'businessLineName', type: 'TEXT' },
        { name: 'lastEmailSentAt', type: 'DATE_TIME' },
        { name: 'amount', type: 'CURRENCY' },
        { name: 'campaignName', type: 'TEXT' },
        { name: 'sourceType', type: 'TEXT' },
        { name: 'sourceFile', type: 'TEXT' },
        {
          name: 'iaMujeresFunnelStage',
          type: 'SELECT',
          options: [{ value: 'BATCH_READY', label: 'Batch ready' }],
        },
      ],
    },
    {
      nameSingular: 'person',
      namePlural: 'people',
      fields: [
        { name: 'name', type: 'FULL_NAME' },
        { name: 'emails', type: 'EMAILS' },
        { name: 'phones', type: 'PHONES' },
        { name: 'jobTitle', type: 'TEXT' },
        { name: 'city', type: 'TEXT' },
        { name: 'company', type: 'RELATION' },
      ],
    },
    {
      nameSingular: 'company',
      namePlural: 'companies',
      fields: [
        { name: 'name', type: 'TEXT' },
        { name: 'domainName', type: 'LINKS' },
        { name: 'emailMain', type: 'TEXT' },
        { name: 'phoneMain', type: 'TEXT' },
        { name: 'address', type: 'ADDRESS' },
      ],
    },
    {
      nameSingular: 'task',
      namePlural: 'tasks',
      fields: [
        {
          name: 'status',
          type: 'SELECT',
          options: [
            { value: 'TODO', label: 'To do' },
            { value: 'DONE', label: 'Done' },
          ],
        },
        { name: 'title', type: 'TEXT' },
        { name: 'bodyV2', type: 'RICH_TEXT_V2' },
        { name: 'dueAt', type: 'DATE_TIME' },
      ],
    },
    { nameSingular: 'note', namePlural: 'notes', fields: [] },
  ];
}

function fakeRecordIndex({ duplicatePeople = false } = {}) {
  const people = [
    {
      id: 'person-1',
      name: { firstName: 'Ada', lastName: 'Lovelace' },
      emails: { primaryEmail: duplicatePeople ? 'shared@example.com' : 'ada@example.com' },
      company: { id: 'company-1', name: 'Example' },
    },
  ];
  if (duplicatePeople) {
    people.push({
      id: 'person-2',
      name: { firstName: 'Grace', lastName: 'Hopper' },
      emails: { primaryEmail: 'shared@example.com' },
      company: { id: 'company-1', name: 'Example' },
    });
  }

  return {
    opportunities: [
      {
        id: 'opp-1',
        name: 'Example deal',
        company: {
          id: 'company-1',
          name: 'Example',
          domainName: { primaryLinkUrl: 'https://example.com' },
        },
        pointOfContact: {
          id: 'person-1',
          name: { firstName: 'Ada', lastName: 'Lovelace' },
          emails: { primaryEmail: 'ada@example.com', additionalEmails: [] },
        },
      },
    ],
    people,
    companies: [
      {
        id: 'company-1',
        name: 'Example',
        domainName: { primaryLinkUrl: 'https://example.com' },
      },
    ],
    tasks: [
      {
        id: 'task-1',
        title: 'Follow up',
        status: 'TODO',
        taskTargets: {
          edges: [{ node: { targetOpportunity: { id: 'opp-1' } } }],
        },
      },
      {
        id: 'task-2',
        title: 'Completed follow up',
        status: 'DONE',
        taskTargets: {
          edges: [{ node: { targetOpportunity: { id: 'opp-1' } } }],
        },
      },
    ],
  };
}

function fakeClient() {
  const writeCalls = [];
  return {
    writeCalls,
    async metadataObjects() {
      return fakeMetadataObjects();
    },
    async gql(query, variables = {}) {
      if (/mutation/i.test(query)) {
        writeCalls.push({ type: 'gql', query, variables });
        return {
          createCompany: { id: 'created-company-1', name: 'Created company' },
          updateCompany: { id: 'company-1', name: 'Example' },
          createPerson: {
            id: 'created-person-1',
            name: { firstName: 'Created', lastName: 'Person' },
            emails: { primaryEmail: 'created@example.com', additionalEmails: [] },
          },
          updatePerson: {
            id: 'person-1',
            name: { firstName: 'Ada', lastName: 'Lovelace' },
            emails: { primaryEmail: 'ada@example.com', additionalEmails: [] },
          },
          createOpportunity: { id: 'created-opp-1', name: 'Created opportunity' },
          updateOpportunity: { id: 'opp-1', name: 'Example deal' },
          updateTask: { id: 'task-1', title: 'Follow up', status: 'DONE' },
        };
      }
      return connectionPayload(fakeRecordIndex());
    },
    async rest(pathName, init = {}) {
      const body = init.body ? JSON.parse(init.body) : null;
      writeCalls.push({ type: 'rest', pathName, body });
      if (pathName === '/notes') return { data: { createNote: { id: 'note-1' } } };
      if (pathName === '/tasks') return { data: { createTask: { id: 'task-1' } } };
      return { data: { id: 'target-1' } };
    },
  };
}

function connectionPayload(index) {
  return {
    opportunities: toConnection(index.opportunities),
    people: toConnection(index.people),
    companies: toConnection(index.companies),
    tasks: toConnection(index.tasks),
  };
}

function toConnection(nodes) {
  return { edges: nodes.map((node) => ({ node })) };
}

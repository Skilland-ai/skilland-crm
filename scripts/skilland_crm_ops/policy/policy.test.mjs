import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import { loadFoundation } from '../foundation.mjs';
import { validatePolicyOperationResult } from '../validation.mjs';
import {
  InMemoryIdempotencyStore,
  canonicalJson,
  computeOperationPlanHash,
  createPolicyKernel,
  evaluatePlanPolicy,
  finalizeOperationPlan,
  sha256Canonical,
  validatePlanBoundApproval,
  verifyOperationPlanHash,
} from './index.mjs';

const ROOT_DIR = new URL('../../../', import.meta.url).pathname;
const NOW = '2026-07-13T12:00:00.000Z';

function scope(overrides = {}) {
  return {
    maxRecords: 2,
    maxDocuments: 0,
    maxRecipients: 0,
    maxLocalArtifacts: 0,
    allowExternalSend: false,
    allowMetadataMutation: false,
    allowDestructive: false,
    allowWorkflowActivation: false,
    ...overrides,
  };
}

function capability(overrides = {}) {
  return {
    id: 'crm.record.update',
    routingExposure: 'public',
    lifecycleStatus: 'active',
    frontDoorReadiness: 'apply_guarded',
    supportedModes: ['dry_run', 'apply'],
    effects: ['crm_write'],
    domainSpan: 'single_domain',
    dataClasses: ['commercial', 'pii'],
    reversibility: 'compensatable',
    approvalTier: 'owner',
    environmentAllowlist: ['test'],
    scopeLimits: scope(),
    ...overrides,
  };
}

function registry(capabilityOverrides = {}, registryOverrides = {}) {
  return {
    registryVersion: '1.1.0',
    policyVersion: '1.2.0',
    capabilities: [capability(capabilityOverrides)],
    ...registryOverrides,
  };
}

function operation(index = 1, overrides = {}) {
  return {
    operationId: `operation_update_00${index}`,
    action: 'crm.record.update',
    targetSystem: 'twenty',
    resourceType: 'opportunity',
    resourceId: `record:example_00${index}`,
    input: { stage: 'QUALIFIED' },
    idempotencyKey: `crm-update-example-00${index}`,
    expectedEffects: ['crm_write'],
    constraints: { fields: ['stage'] },
    ...overrides,
  };
}

function draft(overrides = {}) {
  return {
    $schema:
      'https://schemas.skilland.ai/skilland-crm-ops/v1/operation-envelope.schema.json',
    schemaVersion: '1.0.0',
    kind: 'operation_plan',
    requestId: 'request_update_001',
    correlationId: 'correlation_update_001',
    repoId: 'skilland-crm',
    capabilityId: 'crm.record.update',
    requester: {
      id: 'planner_example',
      type: 'agent',
      channel: 'skilland-crm.ops',
    },
    environment: { name: 'test', workspace: 'workspace-example' },
    mode: 'apply',
    createdAt: '2026-07-13T10:00:00.000Z',
    planId: 'plan_update_001',
    operations: [operation()],
    preconditions: [],
    scopeLimits: scope(),
    expiresAt: '2026-07-13T14:00:00.000Z',
    ...overrides,
  };
}

function plan(options = {}) {
  return finalizeOperationPlan({
    draft: draft(options.draft),
    registry: options.registry ?? registry(),
  });
}

function approval(operationPlan, overrides = {}) {
  return {
    $schema: operationPlan.$schema,
    schemaVersion: operationPlan.schemaVersion,
    kind: 'operation_approval',
    requestId: operationPlan.requestId,
    correlationId: operationPlan.correlationId,
    repoId: operationPlan.repoId,
    capabilityId: operationPlan.capabilityId,
    requester: structuredClone(operationPlan.requester),
    environment: structuredClone(operationPlan.environment),
    mode: 'apply',
    createdAt: '2026-07-13T11:00:00.000Z',
    approvalId: 'approval_update_001',
    planId: operationPlan.planId,
    approvedPlanHash: operationPlan.planHash,
    approver: { id: 'owner_example', type: 'human', channel: 'codex' },
    approvalTier: operationPlan.risk.approvalTier,
    approvalStages: [
      {
        stage: 'owner_authorization',
        approver: { id: 'owner_example', type: 'human', channel: 'codex' },
        decision: 'approved',
        decidedAt: '2026-07-13T11:05:00.000Z',
      },
    ],
    allowedScope: structuredClone(operationPlan.scopeLimits),
    expiresAt: '2026-07-13T13:00:00.000Z',
    decision: 'approved',
    decidedAt: '2026-07-13T11:05:00.000Z',
    ...overrides,
  };
}

function successfulWorker(counter, outputOverride = {}) {
  return {
    version: '1.0.0',
    async execute({ plan: operationPlan }) {
      counter.count += 1;
      return {
        operations: operationPlan.operations.map((planned) => ({
          operationId: planned.operationId,
          targetSystem: planned.targetSystem,
          workerVersion: '1.0.0',
          status: 'succeeded',
          resourceRef: planned.resourceId,
          idempotencyKey: planned.idempotencyKey,
          evidence: ['fake-worker:completed'],
        })),
        evidence: ['fake-worker:batch-completed'],
        warnings: [],
        errors: [],
        ...outputOverride,
      };
    },
  };
}

function kernel({ worker, store, verifier, audit } = {}) {
  return createPolicyKernel({
    workers: worker ? new Map([['crm.record.update', worker]]) : new Map(),
    idempotencyStore: store ?? new InMemoryIdempotencyStore(),
    preconditionVerifier: verifier,
    audit,
    clock: () => new Date(NOW),
  });
}

test('canonical JSON and SHA-256 have stable golden vectors', () => {
  assert.equal(canonicalJson(-0), '0');
  assert.equal(
    canonicalJson({ z: 2, a: [true, null, 'é'], aa: { y: 1, x: 0 } }),
    '{"a":[true,null,"é"],"aa":{"x":0,"y":1},"z":2}',
  );
  assert.equal(
    sha256Canonical({ b: 1, a: [true, null, 'é'] }, 'test\n'),
    'sha256:100224299866abb73fe73be29e468afa6110a685a9cfe9b7d54b1b51b38ef92a',
  );
  assert.equal(
    sha256Canonical({ b: 2, a: 1 }),
    sha256Canonical({ a: 1, b: 2 }),
  );
});

test('versioned OperationPlan example carries its real canonical hash', async () => {
  const example = JSON.parse(
    await fs.readFile(
      new URL(
        '../../../shared/contracts/skilland-crm-ops/examples/manual-review-dry-run-plan.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  assert.equal(verifyOperationPlanHash(example), true);
});

test('canonicalizer rejects non-JSON, cyclic, sparse, exotic, and malformed Unicode values', () => {
  const cyclic = {};
  cyclic.self = cyclic;
  for (const value of [
    undefined,
    1n,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    [, 1],
    cyclic,
    new Date(),
    '\ud800',
  ]) {
    assert.throws(() => canonicalJson(value), { code: 'INVALID_PLAN' });
  }
});

test('finalized plans are cloned, deeply frozen, and bound to semantic fields', () => {
  const source = draft();
  const finalized = finalizeOperationPlan({ draft: source, registry: registry() });
  assert.equal(verifyOperationPlanHash(finalized), true);
  assert.equal(finalized.risk.approvalTier, 'owner');
  assert.equal(Object.isFrozen(finalized.operations[0].input), true);
  assert.equal(Object.hasOwn(source, 'risk'), false);
  source.operations[0].input.stage = 'MUTATED';
  assert.equal(finalized.operations[0].input.stage, 'QUALIFIED');
  const hash = computeOperationPlanHash(finalized);
  assert.equal(
    computeOperationPlanHash({ ...finalized, planHash: `sha256:${'f'.repeat(64)}` }),
    hash,
  );
  assert.notEqual(
    computeOperationPlanHash({
      ...finalized,
      operations: [{ ...finalized.operations[0], input: { stage: 'WON' } }],
    }),
    hash,
  );
});

test('PlanDraft cannot self-assign policy-owned fields and tampering is detected', () => {
  for (const key of ['risk', 'registryVersion', 'policyVersion', 'planHash']) {
    assert.throws(
      () => finalizeOperationPlan({ draft: { ...draft(), [key]: {} }, registry: registry() }),
      { code: 'INVALID_PLAN' },
    );
  }
  const tampered = structuredClone(plan());
  tampered.scopeLimits.maxRecords = 1;
  assert.throws(() => verifyOperationPlanHash(tampered), {
    code: 'PLAN_HASH_MISMATCH',
  });
});

test('PDP derives tiers and fails closed on unsafe effects, retention, and drift', () => {
  const baseline = evaluatePlanPolicy({ plan: draft(), registry: registry() });
  assert.equal(baseline.decision, 'require_approval');
  assert.equal(baseline.risk.approvalTier, 'owner');

  for (const effect of ['destructive', 'metadata_write', 'workflow_change']) {
    const decision = evaluatePlanPolicy({
      plan: draft({ operations: [operation(1, { expectedEffects: [effect] })] }),
      registry: registry({ effects: [effect], approvalTier: 'two_stage' }),
    });
    assert.equal(decision.decision, 'deny');
    assert.ok(decision.risk.rationale.includes('EFFECT_CLASS_DENIED'));
  }

  const retained = evaluatePlanPolicy({
    plan: draft({
      environment: { name: 'production', workspace: 'workspace-example' },
      operations: [operation(1, { expectedEffects: ['local_write'] })],
    }),
    registry: registry({
      effects: ['local_write'],
      environmentAllowlist: ['test', 'production'],
    }),
  });
  assert.ok(retained.risk.rationale.includes('RETENTION_ENFORCEMENT_REQUIRED'));
  assert.equal(
    evaluatePlanPolicy({
      plan: draft({ scopeLimits: scope({ maxRecords: 3 }) }),
      registry: registry(),
    }).decision,
    'deny',
  );
});

test('PDP escalates high-impact effects and denies unavailable capabilities', () => {
  for (const effects of [['erp_write'], ['external_send'], ['crm_write']]) {
    const crossDomain = effects[0] !== 'erp_write';
    const effectScope = scope({
      maxDocuments: effects[0] === 'erp_write' ? 1 : 0,
      maxRecipients: effects[0] === 'external_send' ? 1 : 0,
      allowExternalSend: effects[0] === 'external_send',
    });
    const decision = evaluatePlanPolicy({
      plan: draft({
        capabilityId: 'bridge.crm.writeback',
        operations: [
          operation(1, {
            expectedEffects: effects,
            targetSystem:
              effects[0] === 'erp_write'
                ? 'aikount'
                : effects[0] === 'external_send'
                  ? 'gmail'
                  : 'twenty',
          }),
        ],
        scopeLimits: effectScope,
      }),
      registry: registry({
        id: 'bridge.crm.writeback',
        effects,
        domainSpan: crossDomain ? 'cross_domain' : 'single_domain',
        approvalTier: 'operator',
        scopeLimits: effectScope,
      }),
    });
    assert.equal(decision.risk.approvalTier, 'two_stage');
  }
  for (const overrides of [
    { routingExposure: 'internal' },
    { lifecycleStatus: 'planned' },
    { frontDoorReadiness: 'not_implemented' },
    { frontDoorReadiness: 'denied', approvalTier: 'denied' },
  ]) {
    assert.equal(
      evaluatePlanPolicy({ plan: draft(), registry: registry(overrides) }).decision,
      'deny',
    );
  }
});

test('structured human approval binds the exact plan, scope, and time', () => {
  const operationPlan = plan();
  const signed = approval(operationPlan);
  assert.equal(
    validatePlanBoundApproval({ plan: operationPlan, approval: signed, now: NOW }),
    signed,
  );
  const mismatches = [
    [null, 'APPROVAL_REQUIRED'],
    [approval(operationPlan, { planId: 'plan_other_001' }), 'APPROVAL_MISMATCH'],
    [
      approval(operationPlan, { approvedPlanHash: `sha256:${'f'.repeat(64)}` }),
      'APPROVAL_MISMATCH',
    ],
    [
      approval(operationPlan, {
        environment: { name: 'test', workspace: 'workspace-other' },
      }),
      'APPROVAL_MISMATCH',
    ],
    [approval(operationPlan, { allowedScope: scope({ maxRecords: 3 }) }), 'APPROVAL_MISMATCH'],
  ];
  for (const [candidate, code] of mismatches) {
    assert.throws(
      () => validatePlanBoundApproval({ plan: operationPlan, approval: candidate, now: NOW }),
      { code },
    );
  }
  assert.throws(
    () =>
      validatePlanBoundApproval({
        plan: operationPlan,
        approval: signed,
        now: '2026-07-13T13:00:00.000Z',
      }),
    { code: 'APPROVAL_EXPIRED' },
  );
});

test('agent approvers, wrong stages, and revoked decisions are rejected', () => {
  const operationPlan = plan();
  assert.throws(
    () =>
      validatePlanBoundApproval({
        plan: operationPlan,
        approval: approval(operationPlan, {
          approver: { id: 'agent_example', type: 'agent', channel: 'codex' },
        }),
        now: NOW,
      }),
    { code: 'INVALID_APPROVAL' },
  );
  const invalidStage = approval(operationPlan);
  invalidStage.approvalStages[0].stage = 'operator_review';
  assert.throws(
    () => validatePlanBoundApproval({ plan: operationPlan, approval: invalidStage, now: NOW }),
    { code: 'INVALID_APPROVAL' },
  );
  assert.throws(
    () =>
      validatePlanBoundApproval({
        plan: operationPlan,
        approval: approval(operationPlan, { decision: 'revoked' }),
        now: NOW,
      }),
    { code: 'APPROVAL_MISMATCH' },
  );
});

test('two-stage approval requires two explicit human decisions on one hash', () => {
  const twoStageRegistry = registry({
    id: 'aikount.execution.apply',
    effects: ['erp_write'],
    dataClasses: ['accounting'],
    approvalTier: 'two_stage',
    scopeLimits: scope({ maxDocuments: 1 }),
  });
  const operationPlan = plan({
    registry: twoStageRegistry,
    draft: {
      capabilityId: 'aikount.execution.apply',
      operations: [
        operation(1, {
          action: 'aikount.document.issue',
          targetSystem: 'aikount',
          expectedEffects: ['erp_write'],
        }),
      ],
      scopeLimits: scope({ maxDocuments: 1 }),
    },
  });
  const signed = approval(operationPlan, {
    approvalStages: [
      {
        stage: 'business_content_approval',
        approver: { id: 'owner_business', type: 'human', channel: 'codex' },
        decision: 'approved',
        decidedAt: '2026-07-13T11:04:00.000Z',
      },
      {
        stage: 'effect_target_approval',
        approver: { id: 'owner_effect', type: 'human', channel: 'codex' },
        decision: 'approved',
        decidedAt: '2026-07-13T11:05:00.000Z',
      },
    ],
  });
  assert.equal(
    validatePlanBoundApproval({ plan: operationPlan, approval: signed, now: NOW }),
    signed,
  );
  assert.throws(
    () =>
      validatePlanBoundApproval({
        plan: operationPlan,
        approval: { ...signed, approvalStages: [signed.approvalStages[0]] },
        now: NOW,
      }),
    { code: 'INVALID_APPROVAL' },
  );
});

test('approval scope must cover every operation, not merely be narrower', () => {
  const operationPlan = plan({
    draft: { operations: [operation(1), operation(2)] },
  });
  assert.throws(
    () =>
      validatePlanBoundApproval({
        plan: operationPlan,
        approval: approval(operationPlan, {
          allowedScope: scope({ maxRecords: 1 }),
        }),
        now: NOW,
      }),
    { code: 'APPROVAL_MISMATCH' },
  );
});

test('default PEP is empty; a valid static fake worker runs exactly once', async () => {
  const operationPlan = plan();
  const input = {
    plan: operationPlan,
    approval: approval(operationPlan),
    registry: registry(),
  };
  const blocked = await kernel().enforce(input);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.errors[0].code, 'WORKER_NOT_FOUND');

  const counter = { count: 0 };
  const result = await kernel({ worker: successfulWorker(counter) }).enforce(input);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.policyDecision, 'require_approval');
  assert.deepEqual(result.approvalIds, ['approval_update_001']);
  assert.equal(counter.count, 1);
});

test('missing approval blocks an available worker with zero invocations', async () => {
  const counter = { count: 0 };
  const operationPlan = plan();
  const result = await kernel({ worker: successfulWorker(counter) }).enforce({
    plan: operationPlan,
    approval: null,
    registry: registry(),
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.errors[0].code, 'APPROVAL_REQUIRED');
  assert.equal(counter.count, 0);
});

test('hash and policy-version drift block before the worker', async () => {
  const counter = { count: 0 };
  const operationPlan = plan();
  const service = kernel({ worker: successfulWorker(counter) });
  const tampered = structuredClone(operationPlan);
  tampered.operations[0].input.stage = 'WON';
  const hashResult = await service.enforce({
    plan: tampered,
    approval: approval(operationPlan),
    registry: registry(),
  });
  assert.equal(hashResult.errors[0].code, 'PLAN_HASH_MISMATCH');
  const driftResult = await service.enforce({
    plan: operationPlan,
    approval: approval(operationPlan),
    registry: registry({}, { policyVersion: '1.3.0' }),
  });
  assert.equal(driftResult.errors[0].code, 'POLICY_VERSION_MISMATCH');

  const forgedRisk = structuredClone(operationPlan);
  forgedRisk.risk.approvalTier = 'operator';
  forgedRisk.planHash = computeOperationPlanHash(forgedRisk);
  const riskResult = await service.enforce({
    plan: forgedRisk,
    approval: approval(forgedRisk, {
      approvalTier: 'operator',
      approvalStages: [
        {
          stage: 'operator_review',
          approver: { id: 'operator_example', type: 'human', channel: 'codex' },
          decision: 'approved',
          decidedAt: '2026-07-13T11:05:00.000Z',
        },
      ],
    }),
    registry: registry(),
  });
  assert.equal(riskResult.errors[0].code, 'POLICY_VERSION_MISMATCH');
  assert.equal(counter.count, 0);
});

function recordPrecondition(overrides = {}) {
  return {
    id: 'record-version',
    type: 'record_version',
    status: 'satisfied',
    sourceRef: 'record:example_001',
    observedAt: '2026-07-13T10:00:00.000Z',
    validUntil: '2026-07-13T13:00:00.000Z',
    expectedVersion: 'version-1',
    expectedHash: null,
    evidence: null,
    ...overrides,
  };
}

test('pending, expired, unverified, and drifted preconditions block pre-worker', async () => {
  const counter = { count: 0 };
  const cases = [
    {
      precondition: recordPrecondition({ status: 'pending' }),
      verifier: async () => ({ satisfied: true, version: 'version-1', hash: null }),
      code: 'PRECONDITION_FAILED',
    },
    {
      precondition: recordPrecondition({ validUntil: '2026-07-13T11:00:00.000Z' }),
      verifier: async () => ({ satisfied: true, version: 'version-1', hash: null }),
      code: 'PRECONDITION_FAILED',
    },
    { precondition: recordPrecondition(), verifier: undefined, code: 'PRECONDITION_FAILED' },
    {
      precondition: recordPrecondition(),
      verifier: async () => ({ satisfied: true, version: 'version-2', hash: null }),
      code: 'PRECONDITION_DRIFT',
    },
  ];
  for (const entry of cases) {
    const operationPlan = plan({ draft: { preconditions: [entry.precondition] } });
    const result = await kernel({
      worker: successfulWorker(counter),
      verifier: entry.verifier,
    }).enforce({
      plan: operationPlan,
      approval: approval(operationPlan),
      registry: registry(),
    });
    assert.equal(result.errors[0].code, entry.code);
  }
  assert.equal(counter.count, 0);
});

test('fresh preconditions are reverified before one worker invocation', async () => {
  const counter = { count: 0 };
  const operationPlan = plan({ draft: { preconditions: [recordPrecondition()] } });
  const result = await kernel({
    worker: successfulWorker(counter),
    verifier: async () => ({ satisfied: true, version: 'version-1', hash: null }),
  }).enforce({
    plan: operationPlan,
    approval: approval(operationPlan),
    registry: registry(),
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(counter.count, 1);
});

test('terminal idempotency replay does not reinvoke the worker', async () => {
  const counter = { count: 0 };
  const store = new InMemoryIdempotencyStore();
  const service = kernel({ worker: successfulWorker(counter), store });
  const operationPlan = plan();
  const input = {
    plan: operationPlan,
    approval: approval(operationPlan),
    registry: registry(),
  };
  const first = await service.enforce(input);
  const replay = await service.enforce(input);
  assert.deepEqual(replay, first);
  assert.equal(counter.count, 1);
  assert.equal(store.snapshot()[0].state, 'completed');
});

test('idempotency conflict and in-progress batches block pre-worker', async () => {
  const counter = { count: 0 };
  const operationPlan = plan();
  const reservation = {
    key: operationPlan.operations[0].idempotencyKey,
    planHash: operationPlan.planHash,
    operationId: operationPlan.operations[0].operationId,
  };
  const inProgressStore = new InMemoryIdempotencyStore();
  await inProgressStore.reserveBatch([reservation]);
  const inProgress = await kernel({
    worker: successfulWorker(counter),
    store: inProgressStore,
  }).enforce({
    plan: operationPlan,
    approval: approval(operationPlan),
    registry: registry(),
  });
  assert.equal(inProgress.errors[0].code, 'IDEMPOTENCY_IN_PROGRESS');

  const conflictStore = new InMemoryIdempotencyStore();
  await conflictStore.reserveBatch([
    { ...reservation, planHash: `sha256:${'a'.repeat(64)}` },
  ]);
  const conflict = await kernel({
    worker: successfulWorker(counter),
    store: conflictStore,
  }).enforce({
    plan: operationPlan,
    approval: approval(operationPlan),
    registry: registry(),
  });
  assert.equal(conflict.errors[0].code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(counter.count, 0);
});

test('idempotency batch reservation is atomic when any key conflicts', async () => {
  const store = new InMemoryIdempotencyStore();
  await store.reserveBatch([
    {
      key: 'existing-key-001',
      planHash: `sha256:${'a'.repeat(64)}`,
      operationId: 'operation_existing_001',
    },
  ]);
  await assert.rejects(
    store.reserveBatch([
      {
        key: 'new-batch-key-001',
        planHash: `sha256:${'b'.repeat(64)}`,
        operationId: 'operation_new_001',
      },
      {
        key: 'existing-key-001',
        planHash: `sha256:${'b'.repeat(64)}`,
        operationId: 'operation_existing_001',
      },
    ]),
    { code: 'IDEMPOTENCY_CONFLICT' },
  );
  assert.deepEqual(store.snapshot().map((entry) => entry.key), ['existing-key-001']);
});

test('worker throw marks outcome unknown and prevents automatic retry', async () => {
  const store = new InMemoryIdempotencyStore();
  const counter = { count: 0 };
  const service = kernel({
    store,
    worker: {
      version: '1.0.0',
      async execute() {
        counter.count += 1;
        throw new Error('untrusted detail');
      },
    },
  });
  const operationPlan = plan();
  const input = {
    plan: operationPlan,
    approval: approval(operationPlan),
    registry: registry(),
  };
  const failed = await service.enforce(input);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.errors[0].code, 'OUTCOME_UNKNOWN');
  assert.equal(store.snapshot()[0].state, 'unknown');
  const retry = await service.enforce(input);
  assert.equal(retry.errors[0].code, 'IDEMPOTENCY_OUTCOME_UNKNOWN');
  assert.equal(counter.count, 1);
});

test('invalid post-invocation worker output is also outcome unknown', async () => {
  const counter = { count: 0 };
  const operationPlan = plan();
  const result = await kernel({
    worker: successfulWorker(counter, { unexpected: true }),
  }).enforce({
    plan: operationPlan,
    approval: approval(operationPlan),
    registry: registry(),
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.errors[0].code, 'OUTCOME_UNKNOWN');
  assert.equal(counter.count, 1);
});

function partialWorker(counter) {
  return {
    version: '1.0.0',
    async execute({ plan: operationPlan }) {
      counter.count += 1;
      return {
        operations: operationPlan.operations.map((planned, index) => ({
          operationId: planned.operationId,
          targetSystem: planned.targetSystem,
          workerVersion: '1.0.0',
          status: index === 0 ? 'succeeded' : 'failed',
          resourceRef: index === 0 ? planned.resourceId : null,
          idempotencyKey: planned.idempotencyKey,
          evidence: [`fake-worker:operation-${index + 1}`],
        })),
        evidence: ['fake-worker:partial'],
        warnings: [],
        errors: [
          {
            code: 'FAKE_OPERATION_FAILED',
            message: 'The second fake operation failed.',
            retryable: false,
          },
        ],
      };
    },
  };
}

test('partial failure preserves operation boundaries and does not compensate', async () => {
  const counter = { count: 0 };
  const operationPlan = plan({
    draft: { operations: [operation(1), operation(2)] },
  });
  const result = await kernel({ worker: partialWorker(counter) }).enforce({
    plan: operationPlan,
    approval: approval(operationPlan),
    registry: registry(),
  });
  assert.equal(result.status, 'partial_failure');
  assert.deepEqual(result.partialFailure.completedOperationIds, ['operation_update_001']);
  assert.deepEqual(result.partialFailure.failedOperationIds, ['operation_update_002']);
  assert.equal(result.partialFailure.compensationStatus, 'not_available');
  assert.equal(result.partialFailure.manualReconciliationRequired, true);
  assert.equal(counter.count, 1);

  const inconsistent = structuredClone(result);
  inconsistent.partialFailure.completedOperationIds = ['operation_update_002'];
  assert.throws(() => validatePolicyOperationResult(inconsistent), {
    code: 'EXECUTION_FAILED',
  });
});

test('worker registry is copied at construction and audit excludes operation input', async () => {
  const counter = { count: 0 };
  const events = [];
  const workers = new Map([['crm.record.update', successfulWorker(counter)]]);
  const service = createPolicyKernel({
    workers,
    audit: (event) => events.push(event),
    clock: () => new Date(NOW),
  });
  workers.clear();
  const operationPlan = plan();
  const result = await service.enforce({
    plan: operationPlan,
    approval: approval(operationPlan),
    registry: registry(),
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(counter.count, 1);
  assert.ok(events.length >= 2);
  assert.equal(JSON.stringify(events).includes('QUALIFIED'), false);
  assert.equal(JSON.stringify(events).includes('input'), false);
});

test('real registry exposes no apply-ready capability through the front door', async () => {
  const { registry: realRegistry } = await loadFoundation({ rootDir: ROOT_DIR });
  assert.equal(
    realRegistry.capabilities.filter(
      (entry) => entry.frontDoorReadiness === 'apply_guarded',
    ).length,
    0,
  );
  const update = realRegistry.capabilities.find(
    (entry) => entry.id === 'crm.record.update',
  );
  const decision = evaluatePlanPolicy({
    plan: draft({ scopeLimits: structuredClone(update.scopeLimits) }),
    registry: realRegistry,
  });
  assert.equal(decision.decision, 'deny');
});

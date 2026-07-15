import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { RouterError } from './errors.mjs';
import { createDefaultAdapters } from './adapters/index.mjs';
import {
  MANIFEST_RELATIVE_PATH,
  REGISTRY_RELATIVE_PATH,
  loadFoundation,
} from './foundation.mjs';
import { createJsonStderrLogger } from './logger.mjs';
import { runHarness } from './harness.mjs';
import {
  enforceScopeLimits,
  resolveCapability,
  routeRepoHandoff,
} from './router.mjs';
import {
  containsSensitiveText,
  findSecretShapedKeyPath,
  redactSensitive,
} from './redaction.mjs';
import {
  validateOperationResult,
  validateRepoHandoff,
} from './validation.mjs';

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const HANDOFF_FIXTURE = path.join(
  ROOT_DIR,
  'shared/contracts/skilland-crm-ops/examples/repo-handoff-report-crm-export.json',
);
const FIXED_TIME = '2026-07-13T12:00:01.000Z';
const clock = () => new Date(FIXED_TIME);

async function validHandoff() {
  return JSON.parse(await fs.readFile(HANDOFF_FIXTURE, 'utf8'));
}

function operationFor(request, overrides = {}) {
  return {
    operationId: 'operation_export_007',
    targetSystem: 'local_filesystem',
    workerVersion: '1.0.0',
    status: 'succeeded',
    resourceRef: '04_outputs/crm_manual_update_session/router-test.md',
    idempotencyKey: request.idempotencyKey ?? 'router-test-idempotency',
    evidence: ['artifact hash and byte count recorded'],
    ...overrides,
  };
}

function fakeAdapter({ calls = [], output = null } = {}) {
  return async ({ request, capability }) => {
    calls.push({ request, capability });
    return (
      output ?? {
        operation: operationFor(request),
        evidence: ['one bounded local artifact created'],
        warnings: [],
      }
    );
  };
}

function adapterMap(adapter) {
  return new Map([['report.crm.export', adapter]]);
}

async function writeTempFoundation(t, mutate = () => {}) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skilland-router-'));
  t.after(() => fs.rm(tempDir, { recursive: true, force: true }));
  const [manifest, registry] = await Promise.all([
    fs
      .readFile(path.join(ROOT_DIR, MANIFEST_RELATIVE_PATH), 'utf8')
      .then(JSON.parse),
    fs
      .readFile(path.join(ROOT_DIR, REGISTRY_RELATIVE_PATH), 'utf8')
      .then(JSON.parse),
  ]);
  mutate({ manifest, registry });
  await fs.mkdir(
    path.join(tempDir, 'shared/contracts/skilland-crm-ops'),
    { recursive: true },
  );
  await Promise.all([
    fs.writeFile(
      path.join(tempDir, MANIFEST_RELATIVE_PATH),
      `${JSON.stringify(manifest)}\n`,
    ),
    fs.writeFile(
      path.join(tempDir, REGISTRY_RELATIVE_PATH),
      `${JSON.stringify(registry)}\n`,
    ),
  ]);
  return tempDir;
}

test('provisional handoff fixture and real foundation pass runtime validation', async () => {
  const handoff = await validHandoff();
  assert.equal(validateRepoHandoff(handoff), handoff);
  const foundation = await loadFoundation({ rootDir: ROOT_DIR });
  assert.equal(foundation.manifest.repoId, 'skilland-crm');
  assert.equal(foundation.registry.capabilities.length, 38);
});

test('canonical route invokes one injected adapter and emits an envelope-v1 success', async () => {
  const handoff = await validHandoff();
  handoff.operationRequest.capabilityId = 'report.crm.export';
  const calls = [];
  const result = await routeRepoHandoff(handoff, {
    rootDir: ROOT_DIR,
    adapters: adapterMap(fakeAdapter({ calls })),
    clock,
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.policyDecision, 'allow');
  assert.equal(result.capabilityId, 'report.crm.export');
  assert.equal(result.planId, null);
  assert.equal(result.planHash, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].request.capabilityId, 'report.crm.export');
  assert.equal(validateOperationResult(result), result);
});

test('exact alias resolves to the canonical adapter and never owns an executor', async () => {
  const handoff = await validHandoff();
  const calls = [];
  let aliasExecutorCalls = 0;
  const adapters = new Map([
    ['report.crm.export', fakeAdapter({ calls })],
    ['crm.export.chatgpt', async () => {
      aliasExecutorCalls += 1;
      throw new Error('alias executor must never run');
    }],
  ]);

  const result = await routeRepoHandoff(handoff, {
    rootDir: ROOT_DIR,
    adapters,
    clock,
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.capabilityId, 'report.crm.export');
  assert.equal(calls.length, 1);
  assert.equal(aliasExecutorCalls, 0);
});

test('resolver is canonical-first and rejects ambiguous or absent exact aliases', () => {
  const canonical = { id: 'report.crm.export', aliases: [] };
  const aliasOwnerA = {
    id: 'report.crm.other',
    aliases: ['report.crm.export', 'legacy.report.export'],
  };
  const aliasOwnerB = {
    id: 'report.crm.third',
    aliases: ['legacy.report.export'],
  };
  const registry = { capabilities: [canonical, aliasOwnerA, aliasOwnerB] };

  assert.equal(
    resolveCapability(registry, 'report.crm.export').capability,
    canonical,
  );
  assert.throws(
    () => resolveCapability(registry, 'legacy.report.export'),
    (error) => error instanceof RouterError && error.code === 'CAPABILITY_UNKNOWN',
  );
  assert.throws(
    () => resolveCapability(registry, 'missing.capability'),
    (error) => error.code === 'CAPABILITY_UNKNOWN',
  );
});

test('unknown, internal, blocked, and not-implemented capabilities fail closed', async (t) => {
  const cases = [
    ['missing.capability', 'CAPABILITY_UNKNOWN'],
    ['crm.metadata.read', 'CAPABILITY_INTERNAL'],
    ['crm.record.delete', 'CAPABILITY_BLOCKED'],
    ['crm.record.search', 'CAPABILITY_NOT_IMPLEMENTED'],
  ];
  for (const [capabilityId, expectedCode] of cases) {
    await t.test(capabilityId, async () => {
      const handoff = await validHandoff();
      handoff.operationRequest.capabilityId = capabilityId;
      let calls = 0;
      const result = await routeRepoHandoff(handoff, {
        rootDir: ROOT_DIR,
        adapters: adapterMap(async () => {
          calls += 1;
        }),
        clock,
      });
      assert.equal(result.status, 'blocked');
      assert.equal(result.policyDecision, 'deny');
      assert.equal(result.errors[0].code, expectedCode);
      assert.equal(calls, 0);
      validateOperationResult(result);
    });
  }
});

test('apply and unsupported dry-run never reach the read-only export adapter', async (t) => {
  for (const mode of ['apply', 'dry_run']) {
    await t.test(mode, async () => {
      const handoff = await validHandoff();
      handoff.operationRequest.mode = mode;
      let calls = 0;
      const result = await routeRepoHandoff(handoff, {
        rootDir: ROOT_DIR,
        adapters: adapterMap(async () => {
          calls += 1;
        }),
        clock,
      });
      assert.equal(result.status, 'blocked');
      assert.equal(result.errors[0].code, 'MODE_UNSUPPORTED');
      assert.equal(calls, 0);
    });
  }
});

test('scope overflow and absent adapter fail before any worker fallback', async (t) => {
  await t.test('scope', async () => {
    const handoff = await validHandoff();
    handoff.operationRequest.requestedScope.maxRecords = 1001;
    let calls = 0;
    const result = await routeRepoHandoff(handoff, {
      rootDir: ROOT_DIR,
      adapters: adapterMap(async () => {
        calls += 1;
      }),
      clock,
    });
    assert.equal(result.errors[0].code, 'SCOPE_EXCEEDED');
    assert.equal(calls, 0);
  });

  await t.test('adapter', async () => {
    const result = await routeRepoHandoff(await validHandoff(), {
      rootDir: ROOT_DIR,
      adapters: new Map(),
      clock,
    });
    assert.equal(result.errors[0].code, 'ADAPTER_NOT_FOUND');
  });
});

test('environment allowlist mismatch blocks before adapter invocation', async () => {
  const handoff = await validHandoff();
  handoff.operationRequest.environment.name = 'production';
  let calls = 0;
  const result = await routeRepoHandoff(handoff, {
    rootDir: ROOT_DIR,
    adapters: adapterMap(async () => {
      calls += 1;
    }),
    clock,
  });
  assert.equal(result.errors[0].code, 'ENVIRONMENT_UNSUPPORTED');
  assert.equal(calls, 0);
});

test('schema-invalid or policy-inconsistent foundation fails closed before adapters', async (t) => {
  const cases = [
    [
      'production writes enabled',
      ({ manifest }) => {
        manifest.operability.localFrontDoorProductionWritesEnabled = true;
      },
    ],
    [
      'manifest domains has the wrong type',
      ({ manifest }) => {
        manifest.domains = 'not-an-array';
      },
    ],
    [
      'manifest output claims an external mutation',
      ({ manifest }) => {
        manifest.outputs[0].mutatesExternalSystems = true;
      },
    ],
    [
      'local front-door entrypoint has an unknown property',
      ({ manifest }) => {
        manifest.entrypoints.find((entrypoint) => entrypoint.id === 'crm.ops')
          .unexpected = 'must-fail';
      },
    ],
    [
      'export capability declares crm_write',
      ({ registry }) => {
        registry.capabilities.find(
          (capability) => capability.id === 'report.crm.export',
        ).effects = ['crm_write'];
      },
    ],
    [
      'export capability changes its approval policy',
      ({ registry }) => {
        registry.capabilities.find(
          (capability) => capability.id === 'report.crm.export',
        ).approvalTier = 'denied';
      },
    ],
    [
      'export capability expands beyond the test environment',
      ({ registry }) => {
        registry.capabilities.find(
          (capability) => capability.id === 'report.crm.export',
        ).environmentAllowlist = ['test', 'production'];
      },
    ],
    [
      'export capability evidence has the wrong shape',
      ({ registry }) => {
        registry.capabilities.find(
          (capability) => capability.id === 'report.crm.export',
        ).evidence = 'not-an-array';
      },
    ],
    [
      'export capability loses its integration evidence',
      ({ registry }) => {
        registry.capabilities.find(
          (capability) => capability.id === 'report.crm.export',
        ).evidence = [];
      },
    ],
    [
      'registry policy defaults are incomplete',
      ({ registry }) => {
        delete registry.policyDefaults.externalSendApprovalTier;
      },
    ],
    [
      'manifest no longer denies a missing explicit mode',
      ({ manifest }) => {
        delete manifest.fallbackPolicy.missingMode;
      },
    ],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, async (subtest) => {
      const tempRoot = await writeTempFoundation(subtest, mutate);
      let calls = 0;
      const result = await routeRepoHandoff(await validHandoff(), {
        rootDir: tempRoot,
        adapters: adapterMap(async () => {
          calls += 1;
        }),
        clock,
      });
      assert.equal(result.status, 'blocked');
      assert.equal(result.policyDecision, 'deny');
      assert.equal(result.errors[0].code, 'FOUNDATION_INVALID');
      assert.equal(calls, 0);
      validateOperationResult(result);
    });
  }
});

test('schema version and repository mismatch return stable blocked results', async (t) => {
  await t.test('version', async () => {
    const handoff = await validHandoff();
    handoff.schemaVersion = '9.0.0';
    const result = await routeRepoHandoff(handoff, {
      rootDir: ROOT_DIR,
      clock,
    });
    assert.equal(result.errors[0].code, 'CONTRACT_VERSION_UNSUPPORTED');
    assert.equal(result.capabilityId, 'system.routing.invalid');
  });
  await t.test('repo', async () => {
    const handoff = await validHandoff();
    handoff.targetRepoId = 'other-repo';
    const result = await routeRepoHandoff(handoff, {
      rootDir: ROOT_DIR,
      clock,
    });
    assert.equal(result.errors[0].code, 'REPO_MISMATCH');
  });
});

test('secret-shaped keys, sensitive values, and requester emails are rejected recursively', async (t) => {
  const cases = [
    (handoff) => {
      handoff.operationRequest.input.nested = {
        apiToken: 'never-log-this-value',
      };
    },
    (handoff) => {
      handoff.operationRequest.input.note = 'Bearer never-log-this-value';
    },
    (handoff) => {
      handoff.operationRequest.requester.id = 'person@example.com';
    },
  ];
  for (const mutate of cases) {
    const handoff = await validHandoff();
    mutate(handoff);
    const lines = [];
    const logger = createJsonStderrLogger({
      stream: { write: (line) => lines.push(line) },
      clock,
    });
    const serializedInput = JSON.stringify(handoff);
    const result = await routeRepoHandoff(handoff, {
      rootDir: ROOT_DIR,
      logger,
      clock,
    });
    assert.equal(result.errors[0].code, 'INVALID_HANDOFF');
    assert.doesNotMatch(JSON.stringify(result), /never-log-this-value|person@example\.com/);
    assert.doesNotMatch(lines.join(''), /never-log-this-value|person@example\.com/);
    assert.ok(serializedInput.length > 0);
  }
});

test('adapter cannot smuggle PII or credentials into a successful result', async () => {
  const handoff = await validHandoff();
  const adapter = async ({ request }) => ({
    operation: operationFor(request, {
      evidence: ['contact person@example.com was counted'],
    }),
    evidence: ['Bearer very-secret-value'],
    warnings: [
      {
        code: 'SOURCE_WARNING',
        message: 'Source owner person@example.com should review.',
        retryable: false,
      },
    ],
    artifact: { rawMarkdown: 'PRIVATE CUSTOMER PAYLOAD' },
    counts: { rawNames: ['PRIVATE NAME'] },
  });
  const result = await routeRepoHandoff(handoff, {
    rootDir: ROOT_DIR,
    adapters: adapterMap(adapter),
    clock,
  });
  const serialized = JSON.stringify(result);
  assert.equal(result.status, 'failed');
  assert.equal(result.errors[0].code, 'EXECUTION_FAILED');
  assert.doesNotMatch(
    serialized,
    /person@example\.com|very-secret-value|PRIVATE CUSTOMER PAYLOAD|PRIVATE NAME/,
  );
  validateOperationResult(result);
});

test('unselected adapter return fields are ignored rather than serialized', async () => {
  const handoff = await validHandoff();
  const adapter = async ({ request }) => ({
    operation: operationFor(request),
    evidence: ['one bounded local artifact created'],
    warnings: [],
    artifact: { rawMarkdown: 'PRIVATE CUSTOMER PAYLOAD' },
    counts: { rawNames: ['PRIVATE NAME'] },
  });
  const result = await routeRepoHandoff(handoff, {
    rootDir: ROOT_DIR,
    adapters: adapterMap(adapter),
    clock,
  });
  assert.equal(result.status, 'succeeded');
  assert.doesNotMatch(
    JSON.stringify(result),
    /PRIVATE CUSTOMER PAYLOAD|PRIVATE NAME/,
  );
});

test('structured adapter blockers and failures become valid, safe operation results', async (t) => {
  for (const [outcome, expectedStatus, expectedDecision] of [
    ['blocked', 'blocked', 'deny'],
    ['failed', 'failed', 'allow'],
  ]) {
    await t.test(outcome, async () => {
      const adapter = async () => {
        throw Object.assign(new Error('internal detail'), {
          code:
            outcome === 'blocked'
              ? 'SOURCE_DATA_INCOMPLETE'
              : 'EXECUTION_FAILED',
          publicMessage: 'Safe failure for owner@example.com.',
          retryable: false,
          outcome,
        });
      };
      const result = await routeRepoHandoff(await validHandoff(), {
        rootDir: ROOT_DIR,
        adapters: adapterMap(adapter),
        clock,
      });
      assert.equal(result.status, expectedStatus);
      assert.equal(result.policyDecision, expectedDecision);
      assert.doesNotMatch(JSON.stringify(result), /owner@example\.com|internal detail/);
      validateOperationResult(result);
    });
  }
});

test('redactor handles nested keys and common credential/PII string forms', () => {
  const source = {
    safe: 'person@example.com',
    nested: { password: 'plain-secret' },
    header: 'Bearer abcdefghijklmnop',
    url: 'https://example.test/object?x-amz-signature=abc123',
  };
  assert.equal(findSecretShapedKeyPath(source), '$.nested.password');
  assert.equal(containsSensitiveText(source.safe), true);
  const redacted = redactSensitive(source);
  const serialized = JSON.stringify(redacted);
  assert.doesNotMatch(
    serialized,
    /person@example\.com|plain-secret|abcdefghijklmnop|abc123/,
  );
});

test('scope comparison rejects dangerous expansion and permits registered bounds', async () => {
  const handoff = await validHandoff();
  const { registry } = await loadFoundation({ rootDir: ROOT_DIR });
  const registered = registry.capabilities.find(
    (entry) => entry.id === 'report.crm.export',
  ).scopeLimits;
  assert.doesNotThrow(() =>
    enforceScopeLimits(handoff.operationRequest.requestedScope, registered),
  );
  assert.throws(
    () =>
      enforceScopeLimits(
        { ...handoff.operationRequest.requestedScope, allowOverwrite: true },
        registered,
      ),
    (error) => error.code === 'SCOPE_EXCEEDED',
  );
});

test('export route rejects optional scope selectors not governed by Gate 007', async () => {
  const handoff = await validHandoff();
  handoff.operationRequest.requestedScope.recordIds = ['record_001'];
  let calls = 0;
  const result = await routeRepoHandoff(handoff, {
    rootDir: ROOT_DIR,
    adapters: adapterMap(async () => {
      calls += 1;
    }),
    clock,
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.errors[0].code, 'SCOPE_EXCEEDED');
  assert.equal(calls, 0);
});

test('offline E2E routes the alias through the real foundation and default adapter map', async (t) => {
  const tempRoot = await writeTempFoundation(t);
  const reader = e2eFakeReader([
    e2eOpportunity({
      id: 'opp-safe',
      name: 'Deal exportable E2E',
      tags: ['B2B'],
    }),
    e2eOpportunity({
      id: 'opp-ia',
      name: 'Deal IA que no debe aparecer',
      tags: ['IA Mujeres'],
    }),
  ]);
  const originalFetch = globalThis.fetch;
  let globalFetchCalls = 0;
  globalThis.fetch = async () => {
    globalFetchCalls += 1;
    throw new Error('network must not run in offline E2E');
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const adapters = createDefaultAdapters({
    rootDir: tempRoot,
    clock,
    crmReaderFactory: async () => reader,
  });
  const result = await routeRepoHandoff(await validHandoff(), {
    rootDir: tempRoot,
    adapters,
    clock,
  });

  assert.equal(result.status, 'succeeded');
  assert.equal(result.capabilityId, 'report.crm.export');
  assert.equal(result.operations.length, 1);
  assert.equal(globalFetchCalls, 0);
  assert.ok(reader.queries.every((query) => /^\s*query\b/i.test(query)));

  const outputDirectory = path.join(
    tempRoot,
    '04_outputs/crm_manual_update_session',
  );
  const filenames = await fs.readdir(outputDirectory);
  assert.equal(filenames.length, 1);
  const artifactPath = path.join(outputDirectory, filenames[0]);
  const [markdown, stat] = await Promise.all([
    fs.readFile(artifactPath, 'utf8'),
    fs.stat(artifactPath),
  ]);
  assert.equal(stat.mode & 0o777, 0o600);
  assert.match(markdown, /Deal exportable E2E/);
  assert.doesNotMatch(markdown, /Deal IA que no debe aparecer/);
  const expectedHash = `sha256:${createHash('sha256')
    .update(markdown)
    .digest('hex')}`;
  assert.ok(result.evidence.includes(`artifact.sha256=${expectedHash}`));
  assert.ok(result.evidence.includes('records.fetched=2'));
  assert.ok(result.evidence.includes('records.exported=1'));
  assert.ok(result.evidence.includes('records.excluded=1'));
});

test('harness invalid-input path is offline, parseable, and fail-closed', async () => {
  const stdout = [];
  const stderr = [];
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('harness invalid path must not use network');
  };
  try {
    const exitCode = await runHarness({
      argv: [],
      stdout: { write: (chunk) => stdout.push(chunk) },
      stderr: { write: (chunk) => stderr.push(chunk) },
      clock,
    });
    assert.equal(exitCode, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
  assert.equal(fetchCalls, 0);
  const result = JSON.parse(stdout.join(''));
  assert.equal(result.status, 'blocked');
  assert.equal(result.errors[0].code, 'INVALID_HANDOFF');
  for (const line of stderr.join('').trim().split('\n')) JSON.parse(line);
});

function e2eFakeReader(nodes) {
  const queries = [];
  return {
    queries,
    async metadataObjects() {
      return [
        {
          nameSingular: 'opportunity',
          fields: [
            { name: 'id', label: 'ID', type: 'UUID' },
            { name: 'name', label: 'Name', type: 'TEXT' },
            {
              name: 'stage',
              label: 'Stage',
              type: 'SELECT',
              options: [{ value: 'NEW', label: 'Nuevo', position: 0 }],
            },
            {
              name: 'businessLineName',
              label: 'Business line',
              type: 'TEXT',
            },
            { name: 'tags', label: 'Tags', type: 'MULTI_SELECT' },
          ],
        },
        {
          nameSingular: 'task',
          fields: [
            {
              name: 'status',
              label: 'Status',
              type: 'SELECT',
              options: [{ value: 'TODO', label: 'Pendiente', position: 0 }],
            },
          ],
        },
      ];
    },
    async gql(query) {
      queries.push(query);
      if (/CrmManualBusinessLines/.test(query)) {
        return { businessLines: { edges: [] } };
      }
      if (/CrmExportParaChatGpt/.test(query)) {
        return {
          opportunities: {
            edges: nodes.map((node) => ({ cursor: node.id, node })),
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        };
      }
      throw new Error('unexpected query in offline E2E');
    },
  };
}

function e2eOpportunity({ id, name, tags }) {
  return {
    id,
    name,
    stage: 'NEW',
    tags,
    businessLineName: 'Consultoria',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-12T00:00:00.000Z',
    amount: { amountMicros: 1000000, currencyCode: 'EUR' },
    company: { id: 'company-1', name: 'Empresa test' },
    pointOfContact: null,
    noteTargets: {
      pageInfo: { hasNextPage: false, endCursor: null },
      edges: [],
    },
    taskTargets: {
      pageInfo: { hasNextPage: false, endCursor: null },
      edges: [],
    },
  };
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CrmExportError,
  assertGraphQlQuery,
  generateCrmExportMarkdown,
} from '../../crm_manual_update_crew/export-para-chatgpt.mjs';
import {
  CRM_EXPORT_OUTPUT_DIRECTORY,
  createCrmExportArtifactStore,
} from './artifact-store.mjs';
import { SafeAdapterError } from './errors.mjs';
import { createDefaultAdapters } from './index.mjs';
import {
  QueryOnlyTwentyReader,
  readBoundLiveCrmConfig,
} from './query-only-twenty.mjs';

const NOW = new Date('2026-07-13T10:00:00.000Z');

test('shared service is import-safe, query-only, and excludes IA Mujeres tags', async () => {
  const reader = fakeReader({
    nodes: [
      opportunity({ id: 'opp-safe', name: 'Deal exportable', tags: ['B2B'] }),
      opportunity({ id: 'opp-ia', name: 'Deal oculto', tags: ['IA Mujeres'] }),
    ],
  });

  const result = await generateCrmExportMarkdown({
    client: reader,
    generatedAt: NOW,
    maxRecords: 10,
  });

  assert.deepEqual(result.counts, { fetched: 2, exported: 1, excluded: 1 });
  assert.equal(result.completeness.complete, true);
  assert.match(result.markdown, /Deal exportable/);
  assert.doesNotMatch(result.markdown, /Deal oculto/);
  assert.ok(reader.queries.every((query) => /^\s*query\b/i.test(query)));
  assert.match(
    reader.queries.find((query) => /CrmExportParaChatGpt/.test(query)),
    /\n\s+tags\n/,
  );
});

test('GraphQL guard rejects mutations before invoking a transport', async () => {
  assert.throws(
    () => assertGraphQlQuery('mutation Unsafe { updateOpportunity { id } }'),
    (error) =>
      error instanceof CrmExportError &&
      error.code === 'CRM_EXPORT_NON_QUERY_BLOCKED',
  );

  let calls = 0;
  const reader = new QueryOnlyTwentyReader({
    apiKey: 'test-key',
    baseUrl: 'http://twenty.test',
    fetchImpl: async () => {
      calls += 1;
      throw new Error('transport must not run');
    },
  });
  await assert.rejects(
    () => reader.gql('mutation Unsafe { deleteOpportunity { id } }'),
    (error) => error.code === 'CRM_EXPORT_NON_QUERY_BLOCKED',
  );
  assert.equal(calls, 0);
});

test('service fails closed for incomplete pagination, nested truncation, and record caps', async (t) => {
  await t.test('top-level pageInfo is mandatory', async () => {
    const reader = fakeReader({ nodes: [opportunity()], pageInfo: null });
    await assert.rejects(
      () => generateCrmExportMarkdown({ client: reader, generatedAt: NOW }),
      hasCode('CRM_EXPORT_INCOMPLETE_PAGE_INFO'),
    );
  });

  await t.test('notes truncation blocks', async () => {
    const reader = fakeReader({
      nodes: [opportunity({ notesHasNextPage: true })],
    });
    await assert.rejects(
      () => generateCrmExportMarkdown({ client: reader, generatedAt: NOW }),
      hasCode('CRM_EXPORT_NOTES_TRUNCATED'),
    );
  });

  await t.test('tasks truncation blocks', async () => {
    const reader = fakeReader({
      nodes: [opportunity({ tasksHasNextPage: true })],
    });
    await assert.rejects(
      () => generateCrmExportMarkdown({ client: reader, generatedAt: NOW }),
      hasCode('CRM_EXPORT_TASKS_TRUNCATED'),
    );
  });

  await t.test('page limit blocks while source still has pages', async () => {
    const reader = fakeReader({
      nodes: [opportunity()],
      pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
    });
    await assert.rejects(
      () =>
        generateCrmExportMarkdown({
          client: reader,
          generatedAt: NOW,
          maxPages: 1,
          maxRecords: 10,
        }),
      hasCode('CRM_EXPORT_PAGE_LIMIT_REACHED'),
    );
  });

  await t.test('record cap blocks before rendering', async () => {
    const reader = fakeReader({
      nodes: [opportunity()],
      pageInfo: { hasNextPage: true, endCursor: 'cursor-1' },
    });
    await assert.rejects(
      () =>
        generateCrmExportMarkdown({
          client: reader,
          generatedAt: NOW,
          maxRecords: 1,
        }),
      hasCode('CRM_EXPORT_RECORD_LIMIT_EXCEEDED'),
    );
  });
});

test('metadata with an unqueryable IA Mujeres or tags signal blocks before data queries', async () => {
  const reader = fakeReader({ tagType: 'RELATION', nodes: [opportunity()] });

  await assert.rejects(
    () => generateCrmExportMarkdown({ client: reader, generatedAt: NOW }),
    hasCode('CRM_EXPORT_UNQUERYABLE_EXCLUSION_SIGNAL'),
  );
  assert.equal(reader.queries.length, 0);
});

test('missing queryable business line blocks the exclusion proof', async () => {
  const reader = fakeReader({
    includeBusinessLineName: false,
    nodes: [opportunity()],
  });

  await assert.rejects(
    () => generateCrmExportMarkdown({ client: reader, generatedAt: NOW }),
    hasCode('CRM_EXPORT_UNQUERYABLE_EXCLUSION_SIGNAL'),
  );
  assert.equal(reader.queries.length, 0);
});

test('artifact store confines path, enforces wx/0600/bytes, and returns a hash', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crm-export-store-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const store = createCrmExportArtifactStore({ rootDir });
  const markdown = '# export seguro\n';
  const artifact = await store.writeMarkdown({
    requestId: 'req_artifact01',
    markdown,
    requestedMaxBytes: 1024,
  });
  const absolutePath = path.join(rootDir, artifact.relativePath);
  const stat = await fs.stat(absolutePath);

  assert.equal(
    artifact.relativePath,
    `${CRM_EXPORT_OUTPUT_DIRECTORY}/crm_export_para_chatgpt_req_artifact01.md`,
  );
  assert.equal(stat.mode & 0o777, 0o600);
  assert.equal(stat.size, Buffer.byteLength(markdown));
  assert.equal(
    artifact.sha256,
    `sha256:${createHash('sha256').update(markdown).digest('hex')}`,
  );

  await assert.rejects(
    () =>
      store.writeMarkdown({
        requestId: 'req_artifact01',
        markdown: '# overwrite\n',
        requestedMaxBytes: 1024,
      }),
    hasCode('CRM_EXPORT_ARTIFACT_EXISTS'),
  );
  assert.equal(await fs.readFile(absolutePath, 'utf8'), markdown);

  await assert.rejects(
    () =>
      store.writeMarkdown({
        requestId: 'req_toolarge01',
        markdown,
        requestedMaxBytes: 2,
      }),
    hasCode('CRM_EXPORT_ARTIFACT_TOO_LARGE'),
  );
  await assert.rejects(
    () =>
      fs.stat(
        path.join(
          rootDir,
          CRM_EXPORT_OUTPUT_DIRECTORY,
          'crm_export_para_chatgpt_req_toolarge01.md',
        ),
      ),
    { code: 'ENOENT' },
  );
});

test('artifact store removes a partially written file after an I/O failure', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crm-export-cleanup-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const failingFileSystem = {
    mkdir: (...args) => fs.mkdir(...args),
    realpath: (...args) => fs.realpath(...args),
    unlink: (...args) => fs.unlink(...args),
    async open(...args) {
      const handle = await fs.open(...args);
      return {
        close: (...inner) => handle.close(...inner),
        stat: (...inner) => handle.stat(...inner),
        sync: (...inner) => handle.sync(...inner),
        async writeFile(...inner) {
          await handle.writeFile(...inner);
          throw new Error('simulated write failure');
        },
      };
    },
  };
  const store = createCrmExportArtifactStore({
    rootDir,
    fileSystem: failingFileSystem,
  });

  await assert.rejects(
    () =>
      store.writeMarkdown({
        requestId: 'req_cleanup01',
        markdown: '# partial\n',
        requestedMaxBytes: 1024,
      }),
    hasCode('CRM_EXPORT_ARTIFACT_WRITE_FAILED'),
  );
  await assert.rejects(
    () =>
      fs.stat(
        path.join(
          rootDir,
          CRM_EXPORT_OUTPUT_DIRECTORY,
          'crm_export_para_chatgpt_req_cleanup01.md',
        ),
      ),
    { code: 'ENOENT' },
  );
});

test('live config requires explicit workspace binding and HTTPS outside test', () => {
  const request = { environment: { name: 'sandbox', workspace: 'crm-main' } };

  assert.throws(
    () => readBoundLiveCrmConfig({ request, env: {} }),
    hasCode('CRM_EXPORT_SKILLAND_CRM_OPS_ENVIRONMENT_REQUIRED'),
  );
  assert.throws(
    () =>
      readBoundLiveCrmConfig({
        request,
        env: liveEnv({ SKILLAND_CRM_OPS_WORKSPACE: 'other' }),
      }),
    hasCode('CRM_EXPORT_ENVIRONMENT_BINDING_MISMATCH'),
  );
  assert.throws(
    () => readBoundLiveCrmConfig({ request, env: liveEnv() }),
    hasCode('CRM_EXPORT_BASE_URL_INSECURE'),
  );

  const testConfig = readBoundLiveCrmConfig({
    request: { environment: { name: 'test', workspace: 'crm-main' } },
    env: liveEnv({
      SKILLAND_CRM_OPS_ENVIRONMENT: 'test',
      TWENTY_BASE_URL: 'http://twenty.test',
    }),
  });
  assert.equal(testConfig.baseUrl, 'http://twenty.test');
});

test('default adapter map has one canonical executor and never uses global fetch with a fake reader', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crm-export-adapter-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const originalFetch = globalThis.fetch;
  let globalFetchCalls = 0;
  globalThis.fetch = async () => {
    globalFetchCalls += 1;
    throw new Error('global fetch must not run');
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const adapters = createDefaultAdapters({
    rootDir,
    clock: () => NOW,
    crmReaderFactory: async () =>
      fakeReader({ nodes: [opportunity({ id: 'opp-success' })] }),
  });
  assert.deepEqual([...adapters.keys()], ['report.crm.export']);
  assert.equal(adapters.has('crm.export.chatgpt'), false);

  const result = await adapters.get('report.crm.export')({
    request: operationRequest(),
    capability: exportCapability(),
  });

  assert.equal(result.operation.status, 'succeeded');
  assert.equal(result.operation.workerVersion, '1.0.0');
  assert.equal(result.counts.fetched, 1);
  assert.ok(result.evidence.includes('source.complete=true'));
  assert.ok(result.evidence.includes('artifact.mediaType=text/markdown; charset=utf-8'));
  assert.equal(globalFetchCalls, 0);
});

test('adapter requires the exact export input and complete output scope before reading CRM', async () => {
  let readerFactoryCalls = 0;
  const adapter = createDefaultAdapters({
    rootDir: process.cwd(),
    crmReaderFactory: async () => {
      readerFactoryCalls += 1;
      return fakeReader({ nodes: [opportunity()] });
    },
  }).get('report.crm.export');
  const request = operationRequest();
  request.input = {
    format: 'markdown',
    excludeBusinessLines: ['IA Mujeres'],
    outputDir: '/tmp/escape',
  };

  await assert.rejects(
    () => adapter({ request, capability: exportCapability() }),
    hasCode('SCOPE_EXCEEDED'),
  );
  assert.equal(readerFactoryCalls, 0);

  const incompleteScope = operationRequest({ requestId: 'req_scope02' });
  delete incompleteScope.requestedScope.maxArtifactBytes;
  await assert.rejects(
    () => adapter({ request: incompleteScope, capability: exportCapability() }),
    hasCode('SCOPE_EXCEEDED'),
  );
  assert.equal(readerFactoryCalls, 0);
});

test('adapter defensively enforces a test-only request and capability before reading CRM', async (t) => {
  let readerFactoryCalls = 0;
  const adapter = createDefaultAdapters({
    rootDir: process.cwd(),
    crmReaderFactory: async () => {
      readerFactoryCalls += 1;
      return fakeReader({ nodes: [opportunity()] });
    },
  }).get('report.crm.export');

  await t.test('request outside test is unsupported', async () => {
    const request = operationRequest({
      environment: { name: 'production', workspace: 'crm-main' },
    });
    await assert.rejects(
      () => adapter({ request, capability: exportCapability() }),
      hasCode('ENVIRONMENT_UNSUPPORTED'),
    );
  });

  await t.test('expanded capability policy is invalid', async () => {
    const capability = exportCapability();
    capability.environmentAllowlist = ['test', 'production'];
    await assert.rejects(
      () => adapter({ request: operationRequest(), capability }),
      hasCode('FOUNDATION_INVALID'),
    );
  });

  assert.equal(readerFactoryCalls, 0);
});

test('adapter maps source and output failures to Gate007 canonical errors', async (t) => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crm-export-errors-'));
  t.after(() => fs.rm(rootDir, { recursive: true, force: true }));
  const sourceAdapter = createDefaultAdapters({
    rootDir,
    crmReaderFactory: async () =>
      fakeReader({ tagType: 'RELATION', nodes: [opportunity()] }),
  }).get('report.crm.export');
  await assert.rejects(
    () =>
      sourceAdapter({
        request: operationRequest({ requestId: 'req_source01' }),
        capability: exportCapability(),
      }),
    hasCode('SOURCE_DATA_INCOMPLETE'),
  );

  const outputAdapter = createDefaultAdapters({
    rootDir,
    crmReaderFactory: async () => fakeReader({ nodes: [opportunity()] }),
    artifactStoreFactory: async () => ({
      async writeMarkdown() {
        throw new SafeAdapterError(
          'CRM_EXPORT_ARTIFACT_EXISTS',
          'El artefacto ya existe.',
        );
      },
    }),
  }).get('report.crm.export');
  await assert.rejects(
    () =>
      outputAdapter({
        request: operationRequest({ requestId: 'req_output01' }),
        capability: exportCapability(),
      }),
    hasCode('OUTPUT_POLICY_VIOLATION'),
  );

  const bindingAdapter = createDefaultAdapters({
    rootDir,
    crmReaderFactory: async () => {
      throw new SafeAdapterError(
        'CRM_EXPORT_ENVIRONMENT_BINDING_MISMATCH',
        'El binding no coincide.',
      );
    },
  }).get('report.crm.export');
  await assert.rejects(
    () =>
      bindingAdapter({
        request: operationRequest({ requestId: 'req_binding01' }),
        capability: exportCapability(),
      }),
    hasCode('WORKSPACE_BINDING_MISMATCH'),
  );
});

function fakeReader({
  nodes = [],
  pageInfo = { hasNextPage: false, endCursor: null },
  tagType = 'MULTI_SELECT',
  includeBusinessLineName = true,
} = {}) {
  const queries = [];
  return {
    queries,
    async metadataObjects() {
      return crmMetadata({ tagType, includeBusinessLineName });
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
            ...(pageInfo === null ? {} : { pageInfo }),
          },
        };
      }
      throw new Error('unexpected query');
    },
  };
}

function crmMetadata({ tagType, includeBusinessLineName }) {
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
        ...(includeBusinessLineName
          ? [{ name: 'businessLineName', label: 'Business line', type: 'TEXT' }]
          : []),
        { name: 'tags', label: 'Tags', type: tagType },
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
}

function opportunity({
  id = 'opp-1',
  name = 'Deal seguro',
  tags = ['B2B'],
  notesHasNextPage = false,
  tasksHasNextPage = false,
} = {}) {
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
      pageInfo: { hasNextPage: notesHasNextPage, endCursor: null },
      edges: [],
    },
    taskTargets: {
      pageInfo: { hasNextPage: tasksHasNextPage, endCursor: null },
      edges: [],
    },
  };
}

function operationRequest(overrides = {}) {
  return {
    requestId: 'req_adapter01',
    capabilityId: 'report.crm.export',
    mode: 'read_only',
    environment: { name: 'test', workspace: 'crm-main' },
    input: {
      format: 'markdown',
      excludeBusinessLines: ['IA Mujeres'],
    },
    requestedScope: {
      maxRecords: 1000,
      maxDocuments: 0,
      maxRecipients: 0,
      maxLocalArtifacts: 1,
      localPathPrefixes: [CRM_EXPORT_OUTPUT_DIRECTORY],
      allowOverwrite: false,
      maxArtifactBytes: 1024 * 1024,
      allowExternalSend: false,
      allowMetadataMutation: false,
      allowDestructive: false,
      allowWorkflowActivation: false,
    },
    idempotencyKey: null,
    ...overrides,
  };
}

function exportCapability() {
  return {
    id: 'report.crm.export',
    supportedModes: ['read_only'],
    environmentAllowlist: ['test'],
    scopeLimits: {
      maxRecords: 1000,
      maxDocuments: 0,
      maxRecipients: 0,
      maxLocalArtifacts: 1,
      maxArtifactBytes: 5 * 1024 * 1024,
      allowExternalSend: false,
      allowMetadataMutation: false,
      allowDestructive: false,
      allowWorkflowActivation: false,
    },
  };
}

function liveEnv(overrides = {}) {
  return {
    SKILLAND_CRM_OPS_ENVIRONMENT: 'sandbox',
    SKILLAND_CRM_OPS_WORKSPACE: 'crm-main',
    TWENTY_API_KEY: 'test-key',
    TWENTY_BASE_URL: 'http://twenty.test',
    ...overrides,
  };
}

function hasCode(code) {
  return (error) => error?.code === code;
}

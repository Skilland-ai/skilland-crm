import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { createSkillandTwentyMcpServer } from './server.mjs';

const PUBLIC_ORIGIN = 'https://mcp.crm.skilland.ai';
const TWENTY_ORIGIN = 'https://crm.skilland.ai';
const TOKEN = 'delegated-user-token';
const NOTE_ID = '11111111-1111-4111-8111-111111111111';
const PROJECT_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_ID = '33333333-3333-4333-8333-333333333333';

test('serves protected-resource metadata and challenges anonymous MCP calls', async (t) => {
  const fixture = await startFixture(t, async () => {
    throw new Error('upstream should not be called');
  });

  const metadata = await fixture.request(
    '/.well-known/oauth-protected-resource/mcp',
  );

  assert.equal(metadata.statusCode, 200);
  assert.deepEqual(metadata.json, {
    resource: `${PUBLIC_ORIGIN}/mcp`,
    authorization_servers: [TWENTY_ORIGIN],
    scopes_supported: ['api', 'profile'],
    bearer_methods_supported: ['header'],
    resource_name: 'Skilland CRM',
  });

  const unauthorized = await fixture.request('/mcp', {
    method: 'POST',
    body: rpc('initialize'),
  });

  assert.equal(unauthorized.statusCode, 401);
  assert.match(
    unauthorized.headers['www-authenticate'],
    /oauth-protected-resource\/mcp/,
  );
});

test('forwards OAuth metadata from the current Twenty authorization server', async (t) => {
  const fixture = await startFixture(t, async (url) => {
    assert.equal(
      url.toString(),
      `${TWENTY_ORIGIN}/.well-known/oauth-authorization-server`,
    );
    return jsonResponse({
      issuer: TWENTY_ORIGIN,
      authorization_endpoint: `${TWENTY_ORIGIN}/authorize`,
      token_endpoint: `${TWENTY_ORIGIN}/oauth/token`,
    });
  });

  const response = await fixture.request(
    '/.well-known/oauth-authorization-server',
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.issuer, TWENTY_ORIGIN);
});

test('exposes only the three thin Twenty protocol tools', async (t) => {
  const fixture = await startFixture(t, async (_url, init) => {
    assert.equal(init.headers.authorization, `Bearer ${TOKEN}`);
    return jsonResponse({
      jsonrpc: '2.0',
      id: 1,
      result: {
        tools: [
          { name: 'search_help_center' },
          { name: 'get_tool_catalog' },
          { name: 'learn_tools' },
          { name: 'execute_tool' },
          { name: 'load_skills' },
        ],
      },
    });
  });

  const response = await fixture.mcp(rpc('tools/list'));

  assert.deepEqual(
    response.json.result.tools.map((tool) => tool.name),
    ['get_tool_catalog', 'learn_tools', 'execute_tool'],
  );
});

test('filters the catalog to the six CRM objects and activity targets', async (t) => {
  const fixture = await startFixture(t, async () =>
    toolTextResponse(1, {
      catalog: {
        DATABASE_CRUD: [
          { name: 'find_companies' },
          { name: 'create_project' },
          { name: 'create_note_target' },
          { name: 'update_many_companies' },
          { name: 'delete_company' },
          { name: 'create_attachment' },
        ],
        WORKFLOW: [{ name: 'activate_workflow' }],
      },
      message: 'unfiltered',
    }),
  );

  const response = await fixture.mcp(
    toolCall('get_tool_catalog', { categories: ['DATABASE_CRUD'] }),
  );
  const payload = parseToolText(response.json);

  assert.deepEqual(
    payload.catalog.DATABASE_CRUD.map((tool) => tool.name),
    ['find_companies', 'create_project', 'create_note_target'],
  );
  assert.deepEqual(payload.catalog.WORKFLOW, []);
});

test('returns unavailable schemas locally when no requested tool is allowed', async (t) => {
  let upstreamCalls = 0;
  const fixture = await startFixture(t, async () => {
    upstreamCalls += 1;
    throw new Error('upstream should not be called');
  });

  const response = await fixture.mcp(
    toolCall('learn_tools', {
      toolNames: ['delete_company', 'create_attachment'],
      aspects: ['description', 'schema'],
    }),
  );
  const payload = parseToolText(response.json);

  assert.deepEqual(payload.tools, []);
  assert.deepEqual(payload.notFound, ['delete_company', 'create_attachment']);
  assert.equal(upstreamCalls, 0);
});

test('rewrites broken morph relation schemas to UUID Id fields', async (t) => {
  const fixture = await startFixture(t, async (_url, init) => {
    const request = JSON.parse(init.body);

    assert.deepEqual(request.params.arguments.toolNames, ['create_note_target']);
    return toolTextResponse(request.id, {
      tools: [
        {
          name: 'create_note_target',
          description: 'Create a Note Target.',
          inputSchema: {
            type: 'object',
            properties: {
              noteId: { type: 'string', format: 'uuid' },
              targetProject: { type: 'string' },
              targetCompany: { type: 'string' },
              position: { anyOf: [{ type: 'number' }] },
            },
            required: ['position'],
            additionalProperties: false,
          },
        },
      ],
      notFound: [],
      message: 'old schema',
    });
  });

  const response = await fixture.mcp(
    toolCall('learn_tools', {
      toolNames: ['create_note_target', 'create_attachment'],
      aspects: ['description', 'schema'],
    }),
  );
  const payload = parseToolText(response.json);
  const schema = payload.tools[0].inputSchema;

  assert.ok(schema.properties.targetProjectId);
  assert.ok(schema.properties.targetCompanyId);
  assert.equal(schema.properties.targetProject, undefined);
  assert.deepEqual(schema.required, ['noteId']);
  assert.deepEqual(schema.oneOf, [
    { required: ['targetProjectId'] },
    { required: ['targetCompanyId'] },
  ]);
  assert.deepEqual(payload.notFound, ['create_attachment']);
});

test('blocks tools outside the connector allowlist without touching Twenty', async (t) => {
  let upstreamCalls = 0;
  const fixture = await startFixture(t, async () => {
    upstreamCalls += 1;
    throw new Error('upstream should not be called');
  });

  const response = await fixture.mcp(
    toolCall('execute_tool', {
      toolName: 'update_many_companies',
      arguments: { filter: {}, data: { name: 'No' } },
    }),
  );
  const payload = parseToolText(response.json);

  assert.equal(response.statusCode, 200);
  assert.equal(response.json.result.isError, false);
  assert.equal(payload.toolName, 'update_many_companies');
  assert.match(payload.error.message, /not exposed/);
  assert.equal(upstreamCalls, 0);
});

test('creates Note and Task targets through the corrected REST join fields', async (t) => {
  const calls = [];
  const fixture = await startFixture(t, async (url, init) => {
    calls.push({ url: url.toString(), init });
    const body = JSON.parse(init.body);

    assert.equal(init.headers.authorization, `Bearer ${TOKEN}`);
    assert.deepEqual(body, {
      noteId: NOTE_ID,
      targetProjectId: PROJECT_ID,
    });

    return jsonResponse({
      data: {
        createNoteTarget: {
          id: TARGET_ID,
          noteId: NOTE_ID,
          targetProjectId: PROJECT_ID,
        },
      },
    });
  });

  const response = await fixture.mcp(
    toolCall('execute_tool', {
      toolName: 'create_note_target',
      arguments: {
        noteId: NOTE_ID,
        targetProjectId: PROJECT_ID,
      },
    }),
  );
  const payload = parseToolText(response.json);

  assert.equal(calls[0].url, `${TWENTY_ORIGIN}/rest/noteTargets`);
  assert.equal(payload.result.id, TARGET_ID);
});

test('rejects ambiguous target payloads before writing', async (t) => {
  let upstreamCalls = 0;
  const fixture = await startFixture(t, async () => {
    upstreamCalls += 1;
    throw new Error('upstream should not be called');
  });

  const response = await fixture.mcp(
    toolCall('execute_tool', {
      toolName: 'create_task_target',
      arguments: {
        taskId: NOTE_ID,
        targetProjectId: PROJECT_ID,
        targetCompanyId: TARGET_ID,
      },
    }),
  );
  const payload = parseToolText(response.json);

  assert.equal(response.json.result.isError, true);
  assert.match(payload.error.message, /exactly one target UUID/);
  assert.equal(upstreamCalls, 0);
});

test('forwards ordinary CRM tools and never logs arguments or bearer tokens', async (t) => {
  const events = [];
  const fixture = await startFixture(
    t,
    async (_url, init) => {
      const request = JSON.parse(init.body);

      assert.equal(init.headers.authorization, `Bearer ${TOKEN}`);
      assert.equal(request.params.arguments.toolName, 'create_company');
      return toolTextResponse(request.id, {
        toolName: 'create_company',
        result: { id: TARGET_ID, name: 'Sensitive Company' },
      });
    },
    (event) => events.push(event),
  );

  await fixture.mcp(
    toolCall('execute_tool', {
      toolName: 'create_company',
      arguments: { name: 'Sensitive Company' },
    }),
  );

  const logged = JSON.stringify(events);

  assert.match(logged, /create_company/);
  assert.doesNotMatch(logged, /Sensitive Company/);
  assert.doesNotMatch(logged, new RegExp(TOKEN));
});

test('translates upstream authentication failures into an OAuth challenge', async (t) => {
  const fixture = await startFixture(t, async () =>
    new Response(JSON.stringify({ error: 'invalid_token' }), { status: 403 }),
  );

  const response = await fixture.mcp(rpc('tools/list'));

  assert.equal(response.statusCode, 401);
  assert.match(response.headers['www-authenticate'], /scope="api profile"/);
});

async function startFixture(t, fetchImpl, logger = () => {}) {
  const config = {
    port: 0,
    publicBaseUrl: PUBLIC_ORIGIN,
    twentyBaseUrl: TWENTY_ORIGIN,
    allowedHosts: new Set(),
    upstreamTimeoutMs: 1_000,
  };
  const server = createSkillandTwentyMcpServer({ config, fetchImpl, logger });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const host = `127.0.0.1:${address.port}`;

  config.allowedHosts.add(host);

  return {
    request: (path, options = {}) => requestJson({ host, path, ...options }),
    mcp: (body) =>
      requestJson({
        host,
        path: '/mcp',
        method: 'POST',
        headers: { authorization: `Bearer ${TOKEN}` },
        body,
      }),
  };
}

function requestJson({ host, path, method = 'GET', headers = {}, body }) {
  const serialized = body === undefined ? null : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: '127.0.0.1',
        port: Number(host.split(':')[1]),
        path,
        method,
        headers: {
          host,
          ...(serialized
            ? {
                'content-type': 'application/json',
                'content-length': Buffer.byteLength(serialized),
              }
            : {}),
          ...headers,
        },
      },
      (response) => {
        const chunks = [];

        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');

          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            json: text ? JSON.parse(text) : null,
          });
        });
      },
    );

    request.on('error', reject);
    if (serialized) request.write(serialized);
    request.end();
  });
}

function rpc(method, params) {
  return { jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) };
}

function toolCall(name, argumentsValue) {
  return rpc('tools/call', { name, arguments: argumentsValue });
}

function toolTextResponse(id, payload) {
  return jsonResponse({
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      isError: false,
    },
  });
}

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

function parseToolText(envelope) {
  return JSON.parse(envelope.result.content[0].text);
}

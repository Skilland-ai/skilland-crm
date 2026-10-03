#!/usr/bin/env node

import { createServer as createHttpServer } from 'node:http';
import { pathToFileURL } from 'node:url';

import {
  buildExecuteToolDeniedEnvelope,
  buildToolResultEnvelope,
  filterAndPatchLearnEnvelope,
  filterCatalogEnvelope,
  filterProtocolTools,
  isAllowedDatabaseTool,
  patchInitializeEnvelope,
  RECORD_WRITE_CONFIG,
  TARGET_TOOL_CONFIG,
  validateRecordWriteArguments,
  validateTargetCreateArguments,
} from './policy.mjs';

const MAX_REQUEST_BYTES = 1024 * 1024;
const MAX_UPSTREAM_BYTES = 10 * 1024 * 1024;

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export function readConfig(env = process.env) {
  const port = Number(env.PORT ?? 3100);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  // Escucha solo en loopback salvo que se pida otra interfaz (el contenedor usa 0.0.0.0).
  const host = String(env.SKILLAND_MCP_HOST ?? '127.0.0.1').trim();

  if (!host) throw new Error('SKILLAND_MCP_HOST must not be empty.');

  // Sin URL pública (uso local con API key, sin OAuth) el origen es el propio loopback.
  const publicBaseUrl = normalizeHttpsUrl(
    env.SKILLAND_MCP_PUBLIC_URL ?? `http://127.0.0.1:${port}`,
    'SKILLAND_MCP_PUBLIC_URL',
    { allowLoopbackHttp: true },
  );
  const twentyBaseUrl = normalizeHttpsUrl(
    env.TWENTY_BASE_URL ?? 'https://crm.skilland.ai',
    'TWENTY_BASE_URL',
  );

  const publicHost = new URL(publicBaseUrl).host;
  const allowedHosts = new Set(
    (env.SKILLAND_MCP_ALLOWED_HOSTS ?? publicHost)
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  if (allowedHosts.size === 0) {
    throw new Error('At least one allowed host is required.');
  }

  return {
    host,
    port,
    publicBaseUrl,
    twentyBaseUrl,
    allowedHosts,
    upstreamTimeoutMs: Number(env.SKILLAND_MCP_UPSTREAM_TIMEOUT_MS ?? 20_000),
  };
}

export function createSkillandTwentyMcpServer({
  config,
  fetchImpl = globalThis.fetch,
  logger = defaultLogger,
}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is required.');

  return createHttpServer(async (request, response) => {
    const startedAt = Date.now();
    let observedTool = null;

    try {
      setCorsHeaders(response);

      if (request.method === 'OPTIONS') {
        response.writeHead(204);
        response.end();
        return;
      }

      if (!isAllowedHost(request, config.allowedHosts)) {
        sendJson(response, 403, { error: 'invalid_host' });
        return;
      }

      const url = new URL(request.url ?? '/', config.publicBaseUrl);

      if (request.method === 'GET' && url.pathname === '/healthz') {
        sendJson(response, 200, {
          status: 'ok',
          service: 'skilland-twenty-mcp',
        });
        return;
      }

      if (
        request.method === 'GET' &&
        [
          '/.well-known/oauth-protected-resource',
          '/.well-known/oauth-protected-resource/mcp',
        ].includes(url.pathname)
      ) {
        sendJson(response, 200, protectedResourceMetadata(config));
        return;
      }

      if (
        request.method === 'GET' &&
        url.pathname === '/.well-known/oauth-authorization-server'
      ) {
        const metadata = await fetchAuthorizationServerMetadata({
          config,
          fetchImpl,
        });
        sendJson(response, 200, metadata);
        return;
      }

      if (url.pathname !== '/mcp') {
        sendJson(response, 404, { error: 'not_found' });
        return;
      }

      const bearerToken = readBearerToken(request.headers.authorization);

      if (!bearerToken) {
        sendUnauthorized(response, config);
        return;
      }

      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
        sendJson(response, 405, { error: 'method_not_allowed' });
        return;
      }

      const body = await readJsonBody(request, MAX_REQUEST_BYTES);
      observedTool = getObservedToolName(body);

      if (!body || Array.isArray(body) || typeof body !== 'object') {
        sendJson(response, 400, { error: 'invalid_json_rpc_request' });
        return;
      }

      const localResponse = await maybeHandleLocally({
        body,
        bearerToken,
        config,
        fetchImpl,
      });

      if (localResponse) {
        sendJson(response, 200, localResponse);
        return;
      }

      const { forwardedBody, deniedLearnNames, localEnvelope } =
        prepareForwardBody(body);

      if (localEnvelope) {
        sendJson(response, 200, localEnvelope);
        return;
      }

      let upstreamEnvelope = await callTwentyMcp({
        body: forwardedBody,
        bearerToken,
        config,
        fetchImpl,
      });

      if (upstreamEnvelope === null) {
        response.writeHead(202);
        response.end();
        return;
      }

      if (body.method === 'initialize') {
        upstreamEnvelope = patchInitializeEnvelope(upstreamEnvelope);
      } else if (body.method === 'tools/list') {
        upstreamEnvelope = filterProtocolTools(upstreamEnvelope);
      } else if (body.method === 'tools/call') {
        const protocolTool = body.params?.name;

        if (protocolTool === 'get_tool_catalog') {
          upstreamEnvelope = filterCatalogEnvelope(upstreamEnvelope);
        } else if (protocolTool === 'learn_tools') {
          upstreamEnvelope = filterAndPatchLearnEnvelope(
            upstreamEnvelope,
            deniedLearnNames,
          );
        }
      }

      sendJson(response, 200, upstreamEnvelope);
    } catch (error) {
      if (error instanceof UpstreamUnauthorizedError) {
        sendUnauthorized(response, config);
      } else if (error instanceof ClientInputError) {
        sendJson(response, error.statusCode, { error: error.code });
      } else {
        sendJson(response, 502, { error: 'upstream_unavailable' });
      }
    } finally {
      logger({
        event: 'mcp_request',
        method: request.method,
        path: safePath(request.url),
        tool: observedTool,
        status: response.statusCode,
        durationMs: Date.now() - startedAt,
      });
    }
  });
}

async function maybeHandleLocally({
  body,
  bearerToken,
  config,
  fetchImpl,
}) {
  if (body.method !== 'tools/call' || body.params?.name !== 'execute_tool') {
    return null;
  }

  const executeArguments = body.params?.arguments;
  const toolName = executeArguments?.toolName;

  if (!isAllowedDatabaseTool(toolName)) {
    return buildExecuteToolDeniedEnvelope(body.id, toolName);
  }
  if (RECORD_WRITE_CONFIG[toolName]) {
    return writeRecordLocally({
      id: body.id,
      toolName,
      input: executeArguments?.arguments,
      bearerToken,
      config,
      fetchImpl,
    });
  }
  if (!TARGET_TOOL_CONFIG[toolName]) return null;

  try {
    const result = await createTargetRelation({
      toolName,
      arguments: executeArguments?.arguments,
      bearerToken,
      config,
      fetchImpl,
    });

    return buildToolResultEnvelope(body.id, { toolName, result });
  } catch (error) {
    if (error instanceof UpstreamUnauthorizedError) throw error;

    return buildToolResultEnvelope(
      body.id,
      {
        toolName,
        error: {
          message:
            error instanceof Error ? error.message : 'Relationship creation failed.',
          suggestion:
            'Re-read the Note or Task targets before deciding whether to retry.',
        },
      },
      { isError: true },
    );
  }
}

async function writeRecordLocally({
  id,
  toolName,
  input,
  bearerToken,
  config,
  fetchImpl,
}) {
  try {
    const result = await writeRecord({ toolName, input, bearerToken, config, fetchImpl });

    return buildToolResultEnvelope(id, { toolName, result });
  } catch (error) {
    if (error instanceof UpstreamUnauthorizedError) throw error;

    return buildToolResultEnvelope(
      id,
      {
        toolName,
        error: {
          message: error instanceof Error ? error.message : 'Record write failed.',
          suggestion: 'Re-read the record before deciding whether to retry.',
        },
      },
      { isError: true },
    );
  }
}

async function writeRecord({ toolName, input, bearerToken, config, fetchImpl }) {
  const { config: writeConfig, path, method, payload } = validateRecordWriteArguments(
    toolName,
    input,
  );
  const response = await fetchWithTimeout(
    new URL(path, config.twentyBaseUrl),
    {
      method,
      headers: {
        authorization: `Bearer ${bearerToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    },
    config.upstreamTimeoutMs,
    fetchImpl,
  );

  if ([401, 403].includes(response.status)) {
    throw new UpstreamUnauthorizedError();
  }

  const json = await readUpstreamJson(response);

  if (!response.ok || json?.errors?.length) {
    // Twenty explica los errores de validación (campo inexistente, valor no válido); se
    // devuelven para que el cliente corrija. No contienen credenciales.
    const reasons = Array.isArray(json?.messages) ? ` ${json.messages.join(' ')}` : '';

    throw new Error(`Twenty rejected the ${writeConfig.kind} (${response.status}).${reasons}`);
  }

  const record = json?.data?.[writeConfig.responseKey] ?? null;

  if (!record?.id) {
    throw new Error(
      `Twenty did not return the ${writeConfig.singular}; verify by reading before retrying.`,
    );
  }

  return record;
}

function prepareForwardBody(body) {
  if (body.method !== 'tools/call') {
    return { forwardedBody: body, deniedLearnNames: [], localEnvelope: null };
  }

  if (body.params?.name === 'execute_tool') {
    const toolName = body.params?.arguments?.toolName;

    if (!isAllowedDatabaseTool(toolName)) {
      return { forwardedBody: body, deniedLearnNames: [], localEnvelope: null };
    }
  }

  if (body.params?.name !== 'learn_tools') {
    return { forwardedBody: body, deniedLearnNames: [], localEnvelope: null };
  }

  const requestedNames = Array.isArray(body.params?.arguments?.toolNames)
    ? body.params.arguments.toolNames.filter((name) => typeof name === 'string')
    : [];
  const allowedNames = requestedNames.filter(isAllowedDatabaseTool);
  const deniedLearnNames = requestedNames.filter(
    (name) => !isAllowedDatabaseTool(name),
  );

  if (allowedNames.length === 0) {
    const empty = buildToolResultEnvelope(body.id, {
      tools: [],
      notFound: deniedLearnNames,
      message: `Learned 0 tool(s). Unavailable: ${deniedLearnNames.join(', ')}.`,
    });

    return { forwardedBody: body, deniedLearnNames, localEnvelope: empty };
  }

  return {
    forwardedBody: {
      ...body,
      params: {
        ...body.params,
        arguments: {
          ...body.params.arguments,
          toolNames: allowedNames,
        },
      },
    },
    deniedLearnNames,
    localEnvelope: null,
  };
}

async function createTargetRelation({
  toolName,
  arguments: input,
  bearerToken,
  config,
  fetchImpl,
}) {
  const { config: relationConfig, payload } = validateTargetCreateArguments(
    toolName,
    input,
  );
  const response = await fetchWithTimeout(
    new URL(relationConfig.restPath, config.twentyBaseUrl),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearerToken}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
    },
    config.upstreamTimeoutMs,
    fetchImpl,
  );

  if ([401, 403].includes(response.status)) {
    throw new UpstreamUnauthorizedError();
  }

  const json = await readUpstreamJson(response);

  if (!response.ok || json?.errors?.length) {
    throw new Error(`Twenty rejected the relationship (${response.status}).`);
  }

  const record =
    json?.data?.[relationConfig.responseKey] ?? json?.data ?? json;

  if (!record?.id) {
    throw new Error(
      'Twenty did not return a relationship ID; verify by reading before retrying.',
    );
  }

  return record;
}

async function callTwentyMcp({ body, bearerToken, config, fetchImpl }) {
  const response = await fetchWithTimeout(
    new URL('/mcp', config.twentyBaseUrl),
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearerToken}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify(body),
    },
    config.upstreamTimeoutMs,
    fetchImpl,
  );

  if ([401, 403].includes(response.status)) {
    throw new UpstreamUnauthorizedError();
  }
  if (response.status === 202 || response.status === 204) return null;

  const json = await readUpstreamJson(response);

  if (!response.ok) throw new Error(`Twenty MCP failed (${response.status}).`);

  return json;
}

async function fetchAuthorizationServerMetadata({ config, fetchImpl }) {
  const response = await fetchWithTimeout(
    new URL('/.well-known/oauth-authorization-server', config.twentyBaseUrl),
    { headers: { accept: 'application/json' } },
    config.upstreamTimeoutMs,
    fetchImpl,
  );
  const json = await readUpstreamJson(response);

  if (!response.ok || json?.issuer !== config.twentyBaseUrl) {
    throw new Error('Invalid Twenty OAuth metadata.');
  }

  return json;
}

function protectedResourceMetadata(config) {
  return {
    resource: new URL('/mcp', config.publicBaseUrl).toString(),
    authorization_servers: [config.twentyBaseUrl],
    scopes_supported: ['api', 'profile'],
    bearer_methods_supported: ['header'],
    resource_name: 'Skilland CRM',
  };
}

function sendUnauthorized(response, config) {
  const metadataUrl = new URL(
    '/.well-known/oauth-protected-resource/mcp',
    config.publicBaseUrl,
  ).toString();

  response.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${metadataUrl}", scope="api profile"`,
  );
  sendJson(response, 401, { error: 'unauthorized' });
}

async function readJsonBody(request, maxBytes) {
  const chunks = [];
  let bytes = 0;

  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) {
      throw new ClientInputError(413, 'request_too_large');
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ClientInputError(400, 'invalid_json');
  }
}

async function readUpstreamJson(response) {
  const text = await response.text();

  if (Buffer.byteLength(text) > MAX_UPSTREAM_BYTES) {
    throw new Error('Upstream response is too large.');
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Upstream returned invalid JSON.');
  }
}

async function fetchWithTimeout(url, init, timeoutMs, fetchImpl) {
  return fetchImpl(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);

  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('content-length', Buffer.byteLength(body));
  response.end(body);
}

function setCorsHeaders(response) {
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader(
    'access-control-allow-headers',
    'Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id',
  );
  response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
}

function readBearerToken(value) {
  const match = /^Bearer\s+([^\s]+)$/i.exec(value ?? '');

  return match?.[1] ?? null;
}

function isAllowedHost(request, allowedHosts) {
  const host = String(request.headers.host ?? '').toLowerCase();

  return allowedHosts.has(host);
}

function getObservedToolName(body) {
  if (body?.method !== 'tools/call') return null;

  if (body.params?.name === 'execute_tool') {
    return body.params?.arguments?.toolName ?? 'execute_tool';
  }

  return body.params?.name ?? null;
}

function safePath(value) {
  try {
    return new URL(value ?? '/', 'http://localhost').pathname;
  } catch {
    return '/invalid';
  }
}

function defaultLogger(event) {
  process.stdout.write(
    `${JSON.stringify({ timestamp: new Date().toISOString(), ...event })}\n`,
  );
}

function normalizeHttpsUrl(value, name, { allowLoopbackHttp = false } = {}) {
  if (!value) throw new Error(`${name} is required.`);

  const url = new URL(value);
  const loopbackHttp =
    allowLoopbackHttp && url.protocol === 'http:' && LOOPBACK_HOSTNAMES.has(url.hostname);

  if (url.protocol !== 'https:' && !loopbackHttp) {
    throw new Error(`${name} must use HTTPS (HTTP only on loopback).`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`${name} must be an origin without a path.`);
  }

  return url.origin;
}

class ClientInputError extends Error {
  constructor(statusCode, code) {
    super(code);
    this.statusCode = statusCode;
    this.code = code;
  }
}

class UpstreamUnauthorizedError extends Error {}

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const config = readConfig();
  const server = createSkillandTwentyMcpServer({ config });

  server.listen(config.port, config.host, () => {
    defaultLogger({
      event: 'server_started',
      host: config.host,
      port: config.port,
      publicBaseUrl: config.publicBaseUrl,
      twentyBaseUrl: config.twentyBaseUrl,
    });
  });
}

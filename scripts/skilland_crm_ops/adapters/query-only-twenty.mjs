import { assertGraphQlQuery } from '../../crm_manual_update_crew/export-para-chatgpt.mjs';

import { SafeAdapterError } from './errors.mjs';

export function readBoundLiveCrmConfig({ request, env = process.env }) {
  const requestedEnvironment = request?.environment?.name;
  const requestedWorkspace = request?.environment?.workspace;
  const boundEnvironment = requiredEnv(
    env,
    'SKILLAND_CRM_OPS_ENVIRONMENT',
    'Falta el binding explicito del entorno CRM Ops.',
  );
  const boundWorkspace = requiredEnv(
    env,
    'SKILLAND_CRM_OPS_WORKSPACE',
    'Falta el binding explicito del workspace CRM Ops.',
  );

  if (
    requestedEnvironment !== boundEnvironment ||
    requestedWorkspace !== boundWorkspace
  ) {
    throw new SafeAdapterError(
      'CRM_EXPORT_ENVIRONMENT_BINDING_MISMATCH',
      'El entorno o workspace solicitado no coincide con el binding local explicito.',
    );
  }

  const apiKey = requiredEnv(
    env,
    'TWENTY_API_KEY',
    'TWENTY_API_KEY no esta configurada para el router local.',
  );
  const rawBaseUrl = requiredEnv(
    env,
    'TWENTY_BASE_URL',
    'TWENTY_BASE_URL no esta configurada para el router local.',
  );
  let parsed;

  try {
    parsed = new URL(rawBaseUrl);
  } catch {
    throw new SafeAdapterError(
      'CRM_EXPORT_BASE_URL_INVALID',
      'TWENTY_BASE_URL no es una URL valida.',
    );
  }

  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new SafeAdapterError(
      'CRM_EXPORT_BASE_URL_INVALID',
      'TWENTY_BASE_URL debe ser una URL HTTP(S) sin credenciales, query ni fragmento.',
    );
  }
  if (boundEnvironment !== 'test' && parsed.protocol !== 'https:') {
    throw new SafeAdapterError(
      'CRM_EXPORT_BASE_URL_INSECURE',
      'TWENTY_BASE_URL debe usar HTTPS fuera del entorno test.',
    );
  }

  return Object.freeze({
    environment: boundEnvironment,
    workspace: boundWorkspace,
    apiKey,
    baseUrl: parsed.href.replace(/\/+$/, ''),
  });
}

export class QueryOnlyTwentyReader {
  constructor({ apiKey, baseUrl, fetchImpl = globalThis.fetch }) {
    if (typeof fetchImpl !== 'function') {
      throw new SafeAdapterError(
        'CRM_EXPORT_FETCH_UNAVAILABLE',
        'No existe un transporte HTTP disponible para el lector CRM.',
      );
    }
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  async gql(query, variables = {}) {
    assertGraphQlQuery(query);
    const json = await this.#requestJson(`${this.baseUrl}/graphql`, {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    });
    return json.data;
  }

  async metadataObjects() {
    const json = await this.#requestJson(
      `${this.baseUrl}/rest/metadata/objects`,
      { method: 'GET' },
    );
    if (!Array.isArray(json?.data?.objects)) {
      throw new SafeAdapterError(
        'CRM_EXPORT_METADATA_INVALID',
        'Twenty devolvio una respuesta de metadata incompleta.',
        { retryable: true, outcome: 'failed' },
      );
    }
    return json.data.objects;
  }

  async #requestJson(url, init) {
    let response;

    try {
      response = await this.fetchImpl(url, {
        ...init,
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
      });
    } catch (error) {
      throw new SafeAdapterError(
        'CRM_EXPORT_NETWORK_FAILED',
        'No se pudo completar la lectura de Twenty.',
        { retryable: true, outcome: 'failed', cause: error },
      );
    }

    let json;
    try {
      json = await response.json();
    } catch (error) {
      throw new SafeAdapterError(
        'CRM_EXPORT_RESPONSE_INVALID',
        'Twenty devolvio una respuesta que no era JSON valido.',
        { retryable: true, outcome: 'failed', cause: error },
      );
    }

    if (!response.ok || (Array.isArray(json?.errors) && json.errors.length > 0)) {
      throw new SafeAdapterError(
        'CRM_EXPORT_SOURCE_REJECTED',
        `Twenty rechazo una lectura del export (HTTP ${response.status}).`,
        { retryable: response.status >= 500, outcome: 'failed' },
      );
    }

    return json;
  }
}

export function createLiveQueryOnlyCrmReader({
  request,
  env = process.env,
  fetchImpl = globalThis.fetch,
}) {
  const config = readBoundLiveCrmConfig({ request, env });
  return new QueryOnlyTwentyReader({ ...config, fetchImpl });
}

function requiredEnv(env, name, publicMessage) {
  const value = env[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new SafeAdapterError(
      `CRM_EXPORT_${name}_REQUIRED`,
      publicMessage,
    );
  }
  return value.trim();
}

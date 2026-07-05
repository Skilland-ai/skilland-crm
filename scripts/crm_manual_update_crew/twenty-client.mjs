import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://crm.skilland.ai';
const LEGACY_CLAUDE_CONFIG_PATH = '/home/reboot/.claude.json';
const DEFAULT_LOCAL_CREDENTIALS_PATH = path.join(
  os.homedir(),
  '.config',
  'skilland',
  'twenty.json',
);
const HOME_CLAUDE_CONFIG_PATH = path.join(os.homedir(), '.claude.json');

function normalizeBaseUrl(baseUrl) {
  return (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function extractCredentialsFromRaw(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      const apiKey = readStringValue(parsed.TWENTY_API_KEY);
      const baseUrl = readStringValue(parsed.TWENTY_BASE_URL);

      if (apiKey) {
        return { apiKey, baseUrl };
      }
    }
  } catch {
    // Legacy files may not be strict JSON. Fall back to regex extraction.
  }

  const keyMatch = raw.match(/"TWENTY_API_KEY"\s*:\s*"([^"]+)"/);
  if (!keyMatch) return null;

  const baseMatch = raw.match(/"TWENTY_BASE_URL"\s*:\s*"([^"]+)"/);

  return {
    apiKey: keyMatch[1],
    baseUrl: baseMatch?.[1] ?? null,
  };
}

function readStringValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveCredentialFileCandidates() {
  return [...new Set([
    readStringValue(process.env.TWENTY_CREDENTIALS_FILE),
    DEFAULT_LOCAL_CREDENTIALS_PATH,
    HOME_CLAUDE_CONFIG_PATH,
    LEGACY_CLAUDE_CONFIG_PATH,
  ].filter(Boolean))];
}

function buildMissingCredentialsError(attemptedSources) {
  const bootstrapPath = DEFAULT_LOCAL_CREDENTIALS_PATH;
  const attempted = attemptedSources.length
    ? attemptedSources.join(', ')
    : 'ninguna ruta legible';

  return new Error(
    [
      'Unable to resolve Twenty credentials.',
      'Bootstrap supported paths:',
      `- env: TWENTY_API_KEY (+ optional TWENTY_BASE_URL)`,
      `- env file hint: TWENTY_CREDENTIALS_FILE=/absolute/path/to/twenty.json`,
      `- default local file: ${bootstrapPath}`,
      `- legacy fallbacks: ${HOME_CLAUDE_CONFIG_PATH}, ${LEGACY_CLAUDE_CONFIG_PATH}`,
      `Tried: ${attempted}`,
      'Expected keys: TWENTY_API_KEY and optional TWENTY_BASE_URL.',
    ].join('\n'),
  );
}

export function readTwentyCredentials() {
  const envApiKey = readStringValue(process.env.TWENTY_API_KEY);
  const envBaseUrl = readStringValue(process.env.TWENTY_BASE_URL);

  if (envApiKey) {
    return {
      apiKey: envApiKey,
      baseUrl: normalizeBaseUrl(envBaseUrl),
    };
  }

  const candidates = resolveCredentialFileCandidates();
  const attemptedSources = [];

  for (const candidatePath of candidates) {
    attemptedSources.push(candidatePath);

    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    const raw = fs.readFileSync(candidatePath, 'utf8');
    const extracted = extractCredentialsFromRaw(raw);

    if (extracted?.apiKey) {
      return {
        apiKey: extracted.apiKey,
        baseUrl: normalizeBaseUrl(envBaseUrl ?? extracted.baseUrl),
      };
    }
  }

  throw buildMissingCredentialsError(attemptedSources);
}

export class TwentyClient {
  constructor({ apiKey, baseUrl }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async requestJson(url, init = {}) {
    const response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    let json = {};

    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error(`Invalid JSON response from ${url}: ${text.slice(0, 500)}`);
      }
    }

    if (!response.ok || json.errors?.length) {
      throw new Error(
        `Twenty API error ${response.status}: ${JSON.stringify(json).slice(
          0,
          1200,
        )}`,
      );
    }

    return json;
  }

  async gql(query, variables = {}) {
    const json = await this.requestJson(`${this.baseUrl}/graphql`, {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    });

    return json.data;
  }

  async rest(pathName, init = {}) {
    return this.requestJson(`${this.baseUrl}/rest${pathName}`, init);
  }

  async metadataObjects() {
    const json = await this.requestJson(`${this.baseUrl}/rest/metadata/objects`, {
      method: 'GET',
    });

    return json.data.objects;
  }
}


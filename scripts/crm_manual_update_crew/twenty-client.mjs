import fs from 'node:fs';

const DEFAULT_BASE_URL = 'https://crm.skilland.ai';
const CLAUDE_CONFIG_PATH = '/home/reboot/.claude.json';

export function readTwentyCredentials() {
  if (process.env.TWENTY_API_KEY) {
    return {
      apiKey: process.env.TWENTY_API_KEY,
      baseUrl: (process.env.TWENTY_BASE_URL ?? DEFAULT_BASE_URL).replace(
        /\/+$/,
        '',
      ),
    };
  }

  const raw = fs.readFileSync(CLAUDE_CONFIG_PATH, 'utf8');
  const keyMatch = raw.match(/"TWENTY_API_KEY"\s*:\s*"([^"]+)"/);
  const baseMatch = raw.match(/"TWENTY_BASE_URL"\s*:\s*"([^"]+)"/);

  if (!keyMatch) {
    throw new Error(
      `TWENTY_API_KEY not found in env or ${CLAUDE_CONFIG_PATH}`,
    );
  }

  return {
    apiKey: keyMatch[1],
    baseUrl: (baseMatch?.[1] ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
  };
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


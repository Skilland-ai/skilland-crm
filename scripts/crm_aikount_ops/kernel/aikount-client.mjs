import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_API_BASE_URL = 'https://api.aikount.com/api/v1';
const LOCAL_ENV_PATH = path.resolve('.aikount.local.env');

export function readAikountCredentials() {
  const localEnv = readLocalAikountEnv();
  const token = process.env.AIKOUNT_TOKEN ?? localEnv.AIKOUNT_TOKEN;
  if (!token) {
    throw new Error(
      `AIKOUNT_TOKEN is required for CRM AIKount Ops runtime. Export it or store it in ${LOCAL_ENV_PATH}.`,
    );
  }

  return {
    token,
    apiBaseUrl: (
      process.env.AIKOUNT_API ??
      localEnv.AIKOUNT_API ??
      DEFAULT_API_BASE_URL
    ).replace(/\/+$/, ''),
  };
}

export class AikountClient {
  constructor({ token, apiBaseUrl, fetchImpl = fetch }) {
    this.token = token;
    this.apiBaseUrl = apiBaseUrl.replace(/\/+$/, '');
    this.fetchImpl = fetchImpl;
  }

  async requestJson(pathName, init = {}, { expectedStatuses = [200] } = {}) {
    const url = pathName.startsWith('http')
      ? pathName
      : `${this.apiBaseUrl}${pathName}`;
    const headers = {
      authorization: `Bearer ${this.token}`,
      ...(init.headers ?? {}),
    };
    if (init.body && !(init.body instanceof FormData) && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }

    const response = await this.fetchImpl(url, {
      ...init,
      headers,
    });
    if (!expectedStatuses.includes(response.status)) {
      const failureText = await response.text();
      throw new Error(
        `AIKount API error ${response.status} on ${url}: ${failureText.slice(0, 1500)}`,
      );
    }

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON response from ${url}: ${text.slice(0, 1500)}`);
    }
  }

  async getAuthMe() {
    try {
      return await this.requestJson('/auth/me');
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('API keys cannot be used for the onboarding flow')
      ) {
        return null;
      }
      throw error;
    }
  }

  async getTenantMe() {
    return this.requestJson('/tenants/me');
  }

  async getOpenApiSpec() {
    return this.requestJson(`${this.apiRoot()}/openapi.json`);
  }

  async listTaxes({ context = 'sale' } = {}) {
    return this.requestJson(`/taxes?context=${encodeURIComponent(context)}`);
  }

  async listNumbering() {
    return this.requestJson('/numbering');
  }

  async listContacts(params = {}) {
    return this.requestJson(`/contacts${toQuery(params)}`);
  }

  async getContact(contactId) {
    return this.requestJson(`/contacts/${contactId}`);
  }

  async createContact(body) {
    return this.requestJson(
      '/contacts',
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      { expectedStatuses: [201] },
    );
  }

  async listQuotes(params = {}) {
    return this.requestJson(`/quotes${toQuery(params)}`);
  }

  async getQuote(docId) {
    return this.requestJson(`/quotes/${docId}`);
  }

  async createQuote(body, idempotencyKey) {
    return this.requestJson(
      '/quotes',
      {
        method: 'POST',
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
        body: JSON.stringify(body),
      },
      { expectedStatuses: [201] },
    );
  }

  async updateQuote(docId, body) {
    return this.requestJson(`/quotes/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async sendQuote(docId) {
    return this.requestJson(`/quotes/${docId}/send`, { method: 'POST' });
  }

  async acceptQuote(docId) {
    return this.requestJson(`/quotes/${docId}/accept`, { method: 'POST' });
  }

  async rejectQuote(docId) {
    return this.requestJson(`/quotes/${docId}/reject`, { method: 'POST' });
  }

  async convertQuoteToInvoice(docId) {
    return this.requestJson(`/quotes/${docId}/convert?target=invoice`, {
      method: 'POST',
    });
  }

  async listInvoices(params = {}) {
    return this.requestJson(`/invoices${toQuery(params)}`);
  }

  async getInvoice(docId) {
    return this.requestJson(`/invoices/${docId}`);
  }

  async createInvoice(body, idempotencyKey) {
    return this.requestJson(
      '/invoices',
      {
        method: 'POST',
        headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {},
        body: JSON.stringify(body),
      },
      { expectedStatuses: [201] },
    );
  }

  async updateInvoice(docId, body) {
    return this.requestJson(`/invoices/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }

  async issueInvoice(docId) {
    return this.requestJson(`/invoices/${docId}/issue`, { method: 'POST' });
  }

  async shareInvoice(docId) {
    return this.requestJson(`/invoices/${docId}/share`, { method: 'POST' });
  }

  async sendInvoice(docId) {
    return this.requestJson(`/invoices/${docId}/send`, { method: 'POST' });
  }

  async emailInvoicesToContact(contactId, body) {
    return this.requestJson(`/contacts/${contactId}/email-invoices`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  apiRoot() {
    return this.apiBaseUrl.replace(/\/api\/v1$/, '');
  }
}

export function supportsOperation(openApiSpec, pathName, method) {
  const normalizedMethod = method.toLowerCase();
  return Boolean(openApiSpec?.paths?.[pathName]?.[normalizedMethod]);
}

export function requiredOperationPaths(action) {
  const map = {
    create_quote: [['/api/v1/quotes', 'post']],
    update_quote: [['/api/v1/quotes/{doc_id}', 'patch']],
    send_quote: [['/api/v1/quotes/{doc_id}/send', 'post']],
    accept_quote: [['/api/v1/quotes/{doc_id}/accept', 'post']],
    reject_quote: [['/api/v1/quotes/{doc_id}/reject', 'post']],
    convert_quote_to_invoice: [['/api/v1/quotes/{doc_id}/convert', 'post']],
    create_invoice: [['/api/v1/invoices', 'post']],
    update_invoice: [['/api/v1/invoices/{doc_id}', 'patch']],
    issue_invoice: [['/api/v1/invoices/{doc_id}/issue', 'post']],
    share_invoice: [['/api/v1/invoices/{doc_id}/share', 'post']],
    send_invoice: [['/api/v1/invoices/{doc_id}/send', 'post']],
  };
  return map[action] ?? [];
}

function toQuery(params) {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== '',
  );
  if (entries.length === 0) {
    return '';
  }
  const searchParams = new URLSearchParams();
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, String(item));
      }
      continue;
    }
    searchParams.set(key, String(value));
  }
  return `?${searchParams.toString()}`;
}

function readLocalAikountEnv() {
  if (!fs.existsSync(LOCAL_ENV_PATH)) {
    return {};
  }

  const raw = fs.readFileSync(LOCAL_ENV_PATH, 'utf8');
  const values = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const match = trimmed.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) {
      continue;
    }
    const [, key, value] = match;
    values[key] = stripOptionalQuotes(value.trim());
  }
  return values;
}

function stripOptionalQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

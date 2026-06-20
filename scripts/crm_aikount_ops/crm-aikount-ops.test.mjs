import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseAikountActionRequest } from './kernel/contracts.mjs';
import {
  defaultRegistry,
  loadRegistry,
  saveRegistry,
  upsertDocumentMapping,
} from './kernel/registry.mjs';
import { selectDocumentForAction } from './kernel/document-selection.mjs';
import { resolveOrPrepareContact } from './kernel/contact-resolver.mjs';
import { planAikountOperations } from './kernel/planner.mjs';
import { reviewAikountOperationPlan } from './kernel/reviewer.mjs';
import { executeAikountOperationPlan } from './kernel/executor.mjs';
import { runAikountDocumentInterviewSkill } from './skills/aikount-document-interview.skill.mjs';

const CRM_SNAPSHOT = {
  opportunityId: 'opp-1',
  name: 'Acme - Expansion',
  stage: 'PROPOSAL',
  amountMicros: 250000000,
  amountValue: 250,
  currencyCode: 'EUR',
  company: {
    id: 'company-1',
    name: 'Acme Corp',
    email: 'billing@acme.test',
    phone: '+34123456789',
    address: {
      street1: 'Main Street 1',
      street2: null,
      city: 'Santa Cruz',
      state: 'TF',
      postalCode: '38001',
      country: 'ES',
    },
  },
  pointOfContact: {
    id: 'person-1',
    fullName: 'Ada Lovelace',
    primaryEmail: 'ada@acme.test',
    additionalEmails: [],
  },
};

test('AikountActionRequest validates and fills defaults', () => {
  const request = parseAikountActionRequest({
    requester: 'unit_test',
    action: 'create_quote',
    dealLookup: { opportunityId: 'opp-1' },
  });

  assert.equal(request.mode, 'dry_run');
  assert.equal(request.constraints.maxDocuments, 10);
  assert.match(request.requestId, /^aikountops_/);
});

test('document selection resolves single mapped quote for update action', async () => {
  const registry = defaultRegistry();
  upsertDocumentMapping(registry, {
    dealId: 'opp-1',
    documentKind: 'quote',
    documentKey: '20260620-1200-01',
    docId: 'quote-1',
  });

  const selection = await selectDocumentForAction({
    request: parseAikountActionRequest({
      requester: 'unit_test',
      action: 'update_quote',
      dealLookup: { opportunityId: 'opp-1' },
    }),
    registry,
    crmSnapshot: CRM_SNAPSHOT,
  });

  assert.equal(selection.targetDocumentId, 'quote-1');
  assert.equal(selection.selectedMapping.documentKey, '20260620-1200-01');
});

test('contact resolver prepares a create draft when AIKount has no candidates', async () => {
  const client = {
    async getContact() {
      throw new Error('not found');
    },
    async listContacts() {
      return [];
    },
  };

  const resolution = await resolveOrPrepareContact({
    client,
    registry: defaultRegistry(),
    crmSnapshot: CRM_SNAPSHOT,
    contactOverrides: { vat: 'B12345678' },
  });

  assert.equal(resolution.mode, 'create');
  assert.equal(resolution.draft.name, 'Acme Corp');
  assert.equal(resolution.draft.vat, 'B12345678');
});

test('planner builds create quote with create-contact and send follow-up', () => {
  const request = parseAikountActionRequest({
    requester: 'unit_test',
    action: 'create_quote',
    dealLookup: { opportunityId: 'opp-1' },
    answers: {
      documentKey: '20260620-1200-01',
      document: { docDate: '2026-06-20', currency: 'EUR' },
      lines: [{ description: 'Servicio', quantity: 1, unit_price: 250 }],
      followUpActions: ['send_quote'],
    },
  });

  const plan = planAikountOperations({
    request,
    crmSnapshot: CRM_SNAPSHOT,
    contactResolution: {
      mode: 'create',
      contactKey: 'company:company-1',
      draft: { name: 'Acme Corp' },
    },
    interviewData: {
      warnings: [],
      blockingIssues: [],
      documentKey: '20260620-1200-01',
      docDate: '2026-06-20',
      dueDate: null,
      currency: 'EUR',
      headerDiscountPct: null,
      notes: null,
      seriesId: null,
      lines: [{ description: 'Servicio', quantity: 1, unit_price: 250 }],
      send: { deliveryMethod: 'direct', cc: [], bcc: [] },
      followUpActions: ['send_quote'],
      contact: {},
    },
  });

  assert.deepEqual(
    plan.operations.map((operation) => operation.type),
    ['create_contact', 'create_quote', 'send_quote'],
  );
  assert.equal(plan.operations[1].contactFromOpId, 'contact:0');
});

test('reviewer blocks apply when human confirmation is still missing', () => {
  const request = parseAikountActionRequest({
    requester: 'unit_test',
    action: 'send_quote',
    dealLookup: { opportunityId: 'opp-1' },
  });
  const plan = {
    operations: [{ id: 'send_quote:0', type: 'send_quote', documentId: 'quote-1' }],
    validation: { warnings: [], blockingIssues: [] },
  };

  const review = reviewAikountOperationPlan({
    request,
    plan,
    effectiveMode: 'apply',
    confirmationProvided: false,
    targetDocument: { id: 'quote-1', status: 'draft' },
  });

  assert.equal(review.approved, false);
  assert.ok(review.blockingIssues.some((item) => item.code === 'human_confirmation_required'));
});

test('executor resolves operation dependencies and updates registry', async () => {
  const registry = defaultRegistry();
  const client = {
    calls: [],
    async createContact(body) {
      this.calls.push({ type: 'createContact', body });
      return { id: 'contact-1', ...body };
    },
    async createQuote(body, idempotencyKey) {
      this.calls.push({ type: 'createQuote', body, idempotencyKey });
      return { id: 'quote-1', contact_id: body.contact_id, status: 'draft' };
    },
    async sendQuote(docId) {
      this.calls.push({ type: 'sendQuote', docId });
      return { id: docId, status: 'sent' };
    },
  };
  const plan = {
    operations: [
      {
        id: 'contact:0',
        type: 'create_contact',
        body: { name: 'Acme Corp' },
        contactKey: 'company:company-1',
      },
      {
        id: 'quote:0',
        type: 'create_quote',
        body: {
          contact_id: null,
          doc_date: '2026-06-20',
          currency: 'EUR',
          lines: [{ description: 'Servicio', quantity: 1, unit_price: 250 }],
          external_id: 'crm-opportunity/opp-1/quote/20260620-1200-01',
          external_source: 'skilland-crm',
        },
        contactFromOpId: 'contact:0',
        documentKind: 'quote',
        documentKey: '20260620-1200-01',
        registryEntry: {
          dealId: 'opp-1',
          documentKind: 'quote',
          documentKey: '20260620-1200-01',
        },
        idempotencyKey: 'req:create_quote:20260620-1200-01',
      },
      {
        id: 'send_quote:quote:0',
        type: 'send_quote',
        documentFromOpId: 'quote:0',
      },
    ],
  };

  const result = await executeAikountOperationPlan({
    client,
    plan,
    effectiveMode: 'apply',
    review: { approved: true },
    registry,
    crmSnapshot: CRM_SNAPSHOT,
    request: { requestId: 'req-1', action: 'create_quote' },
  });

  assert.equal(result.status, 'apply_completed');
  assert.equal(client.calls[1].body.contact_id, 'contact-1');
  assert.equal(client.calls[2].docId, 'quote-1');
  assert.equal(registry.documents['opp-1:quote:20260620-1200-01'].docId, 'quote-1');
});

test('document interview accepts provided non-interactive answers', async () => {
  const request = parseAikountActionRequest({
    requester: 'unit_test',
    action: 'create_invoice',
    dealLookup: { opportunityId: 'opp-1' },
    answers: {
      documentKey: '20260620-1200-02',
      document: { docDate: '2026-06-20', currency: 'EUR' },
      lines: [{ description: 'Servicio', quantity: 1, unit_price: 250 }],
    },
  });

  const artifact = await runAikountDocumentInterviewSkill({
    request,
    crmSnapshot: CRM_SNAPSHOT,
    masterData: { taxes: [], numbering: [] },
    selection: { warnings: [], blockingIssues: [], selectedMapping: null },
    targetDocument: null,
    interviewer: null,
  });

  assert.equal(artifact.status, 'completed');
  assert.equal(artifact.interviewData.documentKey, '20260620-1200-02');
  assert.equal(artifact.interviewData.lines.length, 1);
});

test('registry persists to disk and reloads state', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-aikount-ops-'));
  const registry = defaultRegistry();
  registry.contacts['company:company-1'] = { contactId: 'contact-1' };
  saveRegistry(tmpDir, registry);

  const reloaded = loadRegistry(tmpDir);
  assert.equal(reloaded.contacts['company:company-1'].contactId, 'contact-1');
});

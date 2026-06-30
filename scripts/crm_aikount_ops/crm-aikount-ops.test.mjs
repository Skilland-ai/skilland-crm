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
import {
  addFileContainerItems,
  buildRequestFromContainerItem,
  defaultFileContainer,
  recordFileContainerAttempt,
} from './kernel/file-container.mjs';
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

test('contact resolver applies address overrides from structured input', async () => {
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
    contactOverrides: {
      address: 'C/ Isaac Albeniz, 36',
      city: 'Galdar',
      postalCode: '35460',
      country: 'ES',
      customerType: 'business',
    },
  });

  assert.equal(resolution.mode, 'create');
  assert.equal(resolution.draft.address, 'C/ Isaac Albeniz, 36');
  assert.equal(resolution.draft.city, 'Galdar');
  assert.equal(resolution.draft.postal_code, '35460');
  assert.equal(resolution.draft.country, 'ES');
  assert.equal(resolution.draft.customer_type, 'business');
});

test('contact resolver strips empty strings from contact draft fields', async () => {
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
    crmSnapshot: {
      ...CRM_SNAPSHOT,
      company: {
        ...CRM_SNAPSHOT.company,
        phone: '   ',
        address: {
          ...CRM_SNAPSHOT.company.address,
          street2: '',
          state: ' ',
          country: '',
        },
      },
    },
    contactOverrides: {},
  });

  assert.equal(resolution.mode, 'create');
  assert.equal(resolution.draft.phone, null);
  assert.equal(resolution.draft.address_line2, null);
  assert.equal(resolution.draft.state, null);
  assert.equal(resolution.draft.country, null);
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
  assert.equal('header_discount_pct' in plan.operations[1].body, false);
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

test('file container stages mixed deliverable and structured request data', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-aikount-container-'));
  const deliverablePath = path.join(tmpDir, 'presupuesto-acme.pdf');
  const dataPath = path.join(tmpDir, 'presupuesto-acme.json');
  fs.writeFileSync(deliverablePath, '%PDF-1.4 test');
  fs.writeFileSync(
    dataPath,
    JSON.stringify({
      action: 'create_quote',
      dealLookup: { opportunityId: 'opp-1' },
      documentKey: '20260622-0900-01',
      document: { docDate: '2026-06-22', currency: 'EUR' },
      lines: [{ description: 'Servicio', quantity: 1, unit_price: 250 }],
    }),
  );

  const [item] = addFileContainerItems({
    outputDir: tmpDir,
    inputPath: deliverablePath,
    dataFilePath: dataPath,
    kind: 'quote',
    requester: 'unit_test',
  });

  assert.equal(item.kind, 'quote');
  assert.equal(item.sourceMode, 'mixed');
  assert.equal(item.structuredRequest.action, 'create_quote');
  assert.equal(item.structuredRequest.answers.lines.length, 1);
  assert.equal(fs.existsSync(item.files[0].storedPath), true);

  const request = buildRequestFromContainerItem({
    item,
    requester: 'unit_test',
    mode: 'dry_run',
  });

  assert.equal(request.action, 'create_quote');
  assert.equal(request.dealLookup.opportunityId, 'opp-1');
  assert.equal(request.answers.documentKey, '20260622-0900-01');
  assert.equal(request.answers.lines[0].description, 'Servicio');
  assert.deepEqual(request.container.itemIds, [item.id]);
  assert.equal(request.container.files.length, 1);
});

test('file container expands structured batches into separate items', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-aikount-container-'));
  const dataPath = path.join(tmpDir, 'batch.json');
  fs.writeFileSync(
    dataPath,
    JSON.stringify({
      items: [
        {
          action: 'create_quote',
          dealLookup: { search: 'Acme' },
          documentKey: 'quote-1',
          lines: [{ description: 'Uno', quantity: 1, unit_price: 100 }],
        },
        {
          action: 'create_quote',
          dealLookup: { search: 'Beta' },
          documentKey: 'quote-2',
          lines: [{ description: 'Dos', quantity: 1, unit_price: 200 }],
        },
      ],
    }),
  );

  const items = addFileContainerItems({
    outputDir: tmpDir,
    dataFilePath: dataPath,
    kind: 'quote',
    requester: 'unit_test',
  });

  assert.equal(items.length, 2);
  assert.equal(items[0].sourceMode, 'structured');
  assert.equal(items[0].structuredRequest.answers.documentKey, 'quote-1');
  assert.equal(items[1].structuredRequest.dealLookup.search, 'Beta');
});

test('file container keeps dry-run pending and marks apply completed as registered', () => {
  const container = defaultFileContainer();
  container.items.push({
    id: 'aikountfile_test',
    status: 'pending',
    kind: 'invoice',
    sourceMode: 'structured',
    files: [],
    attempts: [],
  });

  recordFileContainerAttempt(container, 'aikountfile_test', {
    requestId: 'req-dry-run',
    status: 'dry_run_completed',
    effectiveMode: 'dry_run',
  });

  assert.equal(container.items[0].status, 'pending');
  assert.equal(container.items[0].lastDryRunRequestId, 'req-dry-run');

  recordFileContainerAttempt(container, 'aikountfile_test', {
    requestId: 'req-apply',
    status: 'apply_completed',
    effectiveMode: 'apply',
  });

  assert.equal(container.items[0].status, 'registered');
  assert.equal(container.items[0].registeredRequestId, 'req-apply');
});

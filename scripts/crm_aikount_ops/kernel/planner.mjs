import { issue } from './contracts.mjs';
import { buildDocumentExternalId } from './registry.mjs';

const CREATE_ACTIONS = new Set(['create_quote', 'create_invoice']);
const UPDATE_ACTIONS = new Set(['update_quote', 'update_invoice']);

export function planAikountOperations({
  request,
  crmSnapshot,
  targetDocument = null,
  selectedMapping = null,
  contactResolution = null,
  interviewData,
}) {
  const operations = [];
  const warnings = [...(interviewData.warnings ?? [])];
  const blockingIssues = [];
  const action = request.action;

  if (interviewData.blockingIssues?.length) {
    blockingIssues.push(...interviewData.blockingIssues);
  }

  if (contactResolution?.warnings?.length) {
    warnings.push(...contactResolution.warnings);
  }

  if (contactResolution?.mode === 'create') {
    operations.push({
      id: 'contact:0',
      type: 'create_contact',
      body: contactResolution.draft,
      contactKey: contactResolution.contactKey,
    });
  }

  if (action === 'create_quote' || action === 'create_invoice') {
    const documentKind = action === 'create_quote' ? 'quote' : 'invoice';
    if (!interviewData.lines?.length) {
      blockingIssues.push(
        issue('document_lines_required', `Action ${action} requires at least one line.`),
      );
    }
    const documentKey = interviewData.documentKey;
    if (!documentKey) {
      blockingIssues.push(issue('document_key_required', 'A documentKey is required.'));
    }

    operations.push({
      id: `${documentKind}:0`,
      type: action,
      body: {
        contact_id: contactResolution?.contact?.id ?? null,
        doc_date: interviewData.docDate,
        due_date: interviewData.dueDate,
        currency: interviewData.currency,
        header_discount_pct: interviewData.headerDiscountPct,
        notes: interviewData.notes,
        lines: interviewData.lines,
        series_id: interviewData.seriesId,
        external_id: buildDocumentExternalId(
          crmSnapshot.opportunityId,
          documentKind,
          documentKey,
        ),
        external_source: 'skilland-crm',
      },
      contactFromOpId:
        contactResolution?.mode === 'create' ? 'contact:0' : null,
      documentKind,
      documentKey,
      registryEntry: {
        dealId: crmSnapshot.opportunityId,
        documentKind,
        documentKey,
      },
      idempotencyKey: `${request.requestId}:${action}:${documentKey}`,
    });

    operations.push(
      ...planFollowUpInvoiceActions({
        action,
        followUpActions: interviewData.followUpActions,
        sendOptions: interviewData.send,
        sourceOpId: `${documentKind}:0`,
        targetDocument,
      }),
    );
  }

  if (action === 'update_quote' || action === 'update_invoice') {
    if (!targetDocument?.id) {
      blockingIssues.push(issue('target_document_required', `Action ${action} needs a target document.`));
    }
    operations.push({
      id: `${action}:0`,
      type: action,
      documentId: targetDocument?.id ?? null,
      body: buildUpdateBody(interviewData),
    });
    operations.push(
      ...planFollowUpInvoiceActions({
        action,
        followUpActions: interviewData.followUpActions,
        sendOptions: interviewData.send,
        sourceOpId: `${action}:0`,
        targetDocument,
      }),
    );
  }

  if (action === 'send_quote') {
    operations.push({
      id: 'send_quote:0',
      type: 'send_quote',
      documentId: targetDocument?.id ?? null,
    });
  }

  if (action === 'accept_quote') {
    operations.push({
      id: 'accept_quote:0',
      type: 'accept_quote',
      documentId: targetDocument?.id ?? null,
    });
    if (interviewData.followUpActions?.includes('convert_quote_to_invoice')) {
      operations.push({
        id: 'convert_quote_to_invoice:0',
        type: 'convert_quote_to_invoice',
        documentId: targetDocument?.id ?? null,
        documentKind: 'invoice',
        documentKey: interviewData.invoiceDocumentKey,
        registryEntry: interviewData.invoiceDocumentKey
          ? {
              dealId: crmSnapshot.opportunityId,
              documentKind: 'invoice',
              documentKey: interviewData.invoiceDocumentKey,
              sourceDocumentId: targetDocument?.id ?? null,
            }
          : null,
      });
      operations.push(
        ...planFollowUpInvoiceActions({
          action: 'convert_quote_to_invoice',
          followUpActions: interviewData.followUpActions,
          sendOptions: interviewData.send,
          sourceOpId: 'convert_quote_to_invoice:0',
          targetDocument,
        }),
      );
    }
  }

  if (action === 'reject_quote') {
    operations.push({
      id: 'reject_quote:0',
      type: 'reject_quote',
      documentId: targetDocument?.id ?? null,
    });
  }

  if (action === 'convert_quote_to_invoice') {
    operations.push({
      id: 'convert_quote_to_invoice:0',
      type: 'convert_quote_to_invoice',
      documentId: targetDocument?.id ?? null,
      documentKind: 'invoice',
      documentKey: interviewData.invoiceDocumentKey,
      registryEntry: interviewData.invoiceDocumentKey
        ? {
            dealId: crmSnapshot.opportunityId,
            documentKind: 'invoice',
            documentKey: interviewData.invoiceDocumentKey,
            sourceDocumentId: targetDocument?.id ?? null,
          }
        : null,
    });
    operations.push(
      ...planFollowUpInvoiceActions({
        action,
        followUpActions: interviewData.followUpActions,
        sendOptions: interviewData.send,
        sourceOpId: 'convert_quote_to_invoice:0',
        targetDocument,
      }),
    );
  }

  if (action === 'issue_invoice') {
    operations.push({
      id: 'issue_invoice:0',
      type: 'issue_invoice',
      documentId: targetDocument?.id ?? null,
    });
    operations.push(
      ...planFollowUpInvoiceActions({
        action,
        followUpActions: interviewData.followUpActions,
        sendOptions: interviewData.send,
        sourceOpId: 'issue_invoice:0',
        targetDocument,
      }),
    );
  }

  if (action === 'share_invoice') {
    operations.push({
      id: 'share_invoice:0',
      type: 'share_invoice',
      documentId: targetDocument?.id ?? null,
    });
  }

  if (action === 'send_invoice') {
    operations.push({
      id: 'send_invoice:0',
      type: 'send_invoice',
      documentId: targetDocument?.id ?? null,
      contactId: targetDocument?.contact_id ?? null,
      deliveryMethod: interviewData.send?.deliveryMethod ?? 'direct',
      send: interviewData.send ?? {},
    });
  }

  if (REQUIRES_TARGET.has(action) && !targetDocument?.id) {
    blockingIssues.push(
      issue('target_document_required', `Action ${action} needs a target document.`),
    );
  }

  if (UPDATE_ACTIONS.has(action) && isEmptyUpdateBody(buildUpdateBody(interviewData))) {
    blockingIssues.push(
      issue('empty_update', `Action ${action} did not produce any mutable document fields.`),
    );
  }

  if (
    selectedMapping &&
    CREATE_ACTIONS.has(action) &&
    selectedMapping.documentKey === interviewData.documentKey
  ) {
    warnings.push(
      `There is already a mapped ${selectedMapping.documentKind} with documentKey=${selectedMapping.documentKey}.`,
    );
  }

  return {
    action,
    operations,
    warnings,
    validation: {
      warnings,
      blockingIssues,
    },
  };
}

function buildUpdateBody(interviewData) {
  const body = {};
  if (interviewData.docDate) {
    body.doc_date = interviewData.docDate;
  }
  if (interviewData.dueDate) {
    body.due_date = interviewData.dueDate;
  }
  if (interviewData.currency) {
    body.currency = interviewData.currency;
  }
  if (interviewData.headerDiscountPct !== null && interviewData.headerDiscountPct !== undefined) {
    body.header_discount_pct = interviewData.headerDiscountPct;
  }
  if (interviewData.notes) {
    body.notes = interviewData.notes;
  }
  if (interviewData.lines?.length) {
    body.lines = interviewData.lines;
  }
  return body;
}

function isEmptyUpdateBody(body) {
  return Object.keys(body).length === 0;
}

function planFollowUpInvoiceActions({
  action,
  followUpActions = [],
  sendOptions = {},
  sourceOpId,
  targetDocument,
}) {
  const operations = [];
  if (!followUpActions.length) {
    return operations;
  }

  const canReferenceSource = action === 'create_invoice' || action === 'convert_quote_to_invoice';
  if (followUpActions.includes('issue_invoice')) {
    operations.push({
      id: `issue_invoice:${sourceOpId}`,
      type: 'issue_invoice',
      documentId: canReferenceSource ? null : targetDocument?.id ?? null,
      documentFromOpId: canReferenceSource ? sourceOpId : null,
    });
  }
  if (followUpActions.includes('share_invoice')) {
    operations.push({
      id: `share_invoice:${sourceOpId}`,
      type: 'share_invoice',
      documentId: canReferenceSource ? null : targetDocument?.id ?? null,
      documentFromOpId: canReferenceSource ? sourceOpId : null,
    });
  }
  if (followUpActions.includes('send_invoice')) {
    operations.push({
      id: `send_invoice:${sourceOpId}`,
      type: 'send_invoice',
      documentId: canReferenceSource ? null : targetDocument?.id ?? null,
      documentFromOpId: canReferenceSource ? sourceOpId : null,
      contactId: canReferenceSource ? null : targetDocument?.contact_id ?? null,
      deliveryMethod: sendOptions.deliveryMethod ?? 'direct',
      send: sendOptions,
    });
  }
  if (action === 'create_quote' && followUpActions.includes('send_quote')) {
    operations.push({
      id: `send_quote:${sourceOpId}`,
      type: 'send_quote',
      documentId: null,
      documentFromOpId: sourceOpId,
    });
  }

  return operations;
}

const REQUIRES_TARGET = new Set([
  'update_quote',
  'send_quote',
  'accept_quote',
  'reject_quote',
  'convert_quote_to_invoice',
  'update_invoice',
  'issue_invoice',
  'share_invoice',
  'send_invoice',
]);

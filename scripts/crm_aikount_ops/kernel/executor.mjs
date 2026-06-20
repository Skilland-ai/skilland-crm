import { upsertContactMapping, upsertDocumentMapping } from './registry.mjs';

export async function executeAikountOperationPlan({
  client,
  plan,
  effectiveMode,
  review,
  registry,
  crmSnapshot,
  request,
}) {
  if (!review.approved) {
    return {
      status: 'blocked',
      summary: { executedOperations: 0 },
      outputs: {},
      operationResults: {},
    };
  }

  if (effectiveMode !== 'apply') {
    return {
      status: 'dry_run_completed',
      summary: { plannedOperations: plan.operations.length },
      outputs: {},
      operationResults: {},
    };
  }

  const operationResults = {};
  const outputs = {};

  for (const operation of plan.operations) {
    const result = await executeOperation({ client, operation, operationResults });
    operationResults[operation.id] = result;

    if (operation.type === 'create_contact') {
      upsertContactMapping(registry, operation.contactKey, {
        contactId: result.id,
        source: 'crm-aikount-ops',
        crmOpportunityId: crmSnapshot.opportunityId,
      });
    }

    if (operation.registryEntry) {
      upsertDocumentMapping(registry, {
        ...operation.registryEntry,
        docId: result.id,
        status: result.status ?? null,
        contactId: result.contact_id ?? null,
        externalId: operation.body?.external_id ?? null,
      });
    }

    if (operation.type === 'share_invoice') {
      outputs.share = result;
    }
  }

  return {
    status: 'apply_completed',
    summary: {
      executedOperations: plan.operations.length,
      lastOperationId: plan.operations.at(-1)?.id ?? null,
    },
    outputs,
    operationResults,
  };
}

async function executeOperation({ client, operation, operationResults }) {
  switch (operation.type) {
    case 'create_contact':
      return client.createContact(operation.body);
    case 'create_quote':
      return client.createQuote(
        {
          ...operation.body,
          contact_id:
            operation.body.contact_id ??
            resolveContactId(operationResults, operation.contactFromOpId),
        },
        operation.idempotencyKey,
      );
    case 'update_quote':
      return client.updateQuote(operation.documentId, operation.body);
    case 'send_quote':
      return client.sendQuote(resolveDocumentId(operationResults, operation));
    case 'accept_quote':
      return client.acceptQuote(resolveDocumentId(operationResults, operation));
    case 'reject_quote':
      return client.rejectQuote(resolveDocumentId(operationResults, operation));
    case 'convert_quote_to_invoice':
      return client.convertQuoteToInvoice(resolveDocumentId(operationResults, operation));
    case 'create_invoice':
      return client.createInvoice(
        {
          ...operation.body,
          contact_id:
            operation.body.contact_id ??
            resolveContactId(operationResults, operation.contactFromOpId),
        },
        operation.idempotencyKey,
      );
    case 'update_invoice':
      return client.updateInvoice(operation.documentId, operation.body);
    case 'issue_invoice':
      return client.issueInvoice(resolveDocumentId(operationResults, operation));
    case 'share_invoice':
      return client.shareInvoice(resolveDocumentId(operationResults, operation));
    case 'send_invoice':
      return sendInvoiceWithMode({ client, operation, operationResults });
    default:
      throw new Error(`Unsupported operation type: ${operation.type}`);
  }
}

async function sendInvoiceWithMode({ client, operation, operationResults }) {
  const documentId = resolveDocumentId(operationResults, operation);
  if (operation.deliveryMethod === 'contact_email') {
    const document = operation.documentFromOpId
      ? operationResults[operation.documentFromOpId]
      : { id: documentId, contact_id: operation.contactId };
    const contactId = operation.contactId ?? document.contact_id;
    return client.emailInvoicesToContact(contactId, {
      invoice_ids: [document.id],
      to_email: operation.send.toEmail ?? null,
      cc: operation.send.cc ?? [],
      bcc: operation.send.bcc ?? [],
      subject: operation.send.subject ?? null,
      message: operation.send.message ?? null,
    });
  }
  return client.sendInvoice(documentId);
}

function resolveDocumentId(operationResults, operation) {
  if (operation.documentId) {
    return operation.documentId;
  }
  if (operation.documentFromOpId) {
    const result = operationResults[operation.documentFromOpId];
    if (!result?.id) {
      throw new Error(
        `Operation ${operation.id} depends on missing document result ${operation.documentFromOpId}.`,
      );
    }
    return result.id;
  }
  throw new Error(`Operation ${operation.id} has no resolvable document id.`);
}

function resolveContactId(operationResults, contactFromOpId) {
  if (!contactFromOpId) {
    return null;
  }
  const result = operationResults[contactFromOpId];
  if (!result?.id) {
    throw new Error(`Missing contact result for dependency ${contactFromOpId}.`);
  }
  return result.id;
}

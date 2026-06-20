import { issue } from './contracts.mjs';
import { listDocumentMappings } from './registry.mjs';

const QUOTE_ACTIONS = new Set([
  'create_quote',
  'update_quote',
  'send_quote',
  'accept_quote',
  'reject_quote',
  'convert_quote_to_invoice',
]);

const REQUIRES_EXISTING_DOCUMENT = new Set([
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

export async function selectDocumentForAction({
  request,
  registry,
  crmSnapshot,
  interviewer = null,
}) {
  const documentKind = documentKindForAction(request.action);
  const mappings = listDocumentMappings({
    registry,
    dealId: crmSnapshot.opportunityId,
    documentKind,
  });
  const answerKey = request.answers?.targetDocumentKey ?? null;
  const manualDocumentId = request.answers?.targetDocumentId ?? null;
  const selectedKey = request.selectedMappings?.documentKey ?? answerKey;

  if (!REQUIRES_EXISTING_DOCUMENT.has(request.action)) {
    return {
      documentKind,
      mappings,
      selectedMapping: null,
      targetDocumentId: null,
      warnings: [],
      blockingIssues: [],
    };
  }

  if (selectedKey) {
    const selectedMapping = mappings.find((mapping) => mapping.documentKey === selectedKey);
    if (!selectedMapping) {
      return blocked(
        documentKind,
        mappings,
        issue(
          'document_mapping_not_found',
          `No local ${documentKind} mapping exists for documentKey=${selectedKey}.`,
        ),
      );
    }
    return {
      documentKind,
      mappings,
      selectedMapping,
      targetDocumentId: selectedMapping.docId,
      warnings: [],
      blockingIssues: [],
    };
  }

  if (manualDocumentId) {
    return {
      documentKind,
      mappings,
      selectedMapping: null,
      targetDocumentId: manualDocumentId,
      warnings: ['Using a manually supplied AIKount document id without a local mapping.'],
      blockingIssues: [],
    };
  }

  if (mappings.length === 1) {
    return {
      documentKind,
      mappings,
      selectedMapping: mappings[0],
      targetDocumentId: mappings[0].docId,
      warnings: [],
      blockingIssues: [],
    };
  }

  if (mappings.length > 1) {
    if (!interviewer?.choose) {
      return blocked(
        documentKind,
        mappings,
        issue(
          'ambiguous_document_mapping',
          `There are ${mappings.length} mapped ${documentKind}s for this deal and no interactive choice is available.`,
          {
            candidates: mappings.map((mapping) => ({
              documentKey: mapping.documentKey,
              docId: mapping.docId,
            })),
          },
        ),
      );
    }

    const selectedMapping = await interviewer.choose(
      `Hay varios ${documentKind}s mapeados. Elige uno:`,
      mappings,
      (mapping) => `${mapping.documentKey} · ${mapping.docId} · ${mapping.status ?? 'status?'}`,
    );
    return {
      documentKind,
      mappings,
      selectedMapping,
      targetDocumentId: selectedMapping.docId,
      warnings: [],
      blockingIssues: [],
    };
  }

  if (interviewer?.ask) {
    const manualId = await interviewer.ask(
      `No hay ${documentKind}s mapeados para este deal. Pega el doc_id de AIKount o deja vacío para bloquear:`,
      { defaultValue: '' },
    );
    if (manualId) {
      return {
        documentKind,
        mappings,
        selectedMapping: null,
        targetDocumentId: manualId,
        warnings: ['Using a manually supplied AIKount document id without a local mapping.'],
        blockingIssues: [],
      };
    }
  }

  return blocked(
    documentKind,
    mappings,
    issue(
      'document_target_required',
      `Action ${request.action} requires an existing ${documentKind} but no local mapping was found.`,
    ),
  );
}

export function documentKindForAction(action) {
  return QUOTE_ACTIONS.has(action) ? 'quote' : 'invoice';
}

function blocked(documentKind, mappings, blockingIssue) {
  return {
    documentKind,
    mappings,
    selectedMapping: null,
    targetDocumentId: null,
    warnings: [],
    blockingIssues: [blockingIssue],
  };
}

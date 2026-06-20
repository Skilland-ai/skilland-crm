import { issue } from './contracts.mjs';

const CREATE_OPS = new Set(['create_contact', 'create_quote', 'create_invoice']);
const UPDATE_OPS = new Set(['update_quote', 'update_invoice']);
const SEND_OPS = new Set(['send_quote', 'send_invoice']);

export function reviewAikountOperationPlan({
  request,
  plan,
  effectiveMode,
  confirmationProvided,
  targetDocument = null,
}) {
  const blockingIssues = [...(plan.validation?.blockingIssues ?? [])];
  const warnings = [...(plan.validation?.warnings ?? [])];

  for (const operation of plan.operations) {
    if (CREATE_OPS.has(operation.type) && !request.constraints.allowCreate) {
      blockingIssues.push(
        issue('creates_not_allowed', 'Request constraints disallow create operations.'),
      );
    }
    if (UPDATE_OPS.has(operation.type) && !request.constraints.allowUpdate) {
      blockingIssues.push(
        issue('updates_not_allowed', 'Request constraints disallow update operations.'),
      );
    }
    if (SEND_OPS.has(operation.type) && !request.constraints.allowSend) {
      blockingIssues.push(
        issue('send_not_allowed', 'Request constraints disallow send operations.'),
      );
    }
  }

  const docWriteCount = plan.operations.filter((operation) =>
    operation.type !== 'create_contact',
  ).length;
  if (docWriteCount > request.constraints.maxDocuments) {
    blockingIssues.push(
      issue(
        'max_documents_exceeded',
        `Plan affects ${docWriteCount} document operations, above maxDocuments=${request.constraints.maxDocuments}.`,
      ),
    );
  }

  if (
    effectiveMode === 'apply' &&
    request.constraints.requireHumanConfirmation &&
    !confirmationProvided
  ) {
    blockingIssues.push(
      issue(
        'human_confirmation_required',
        'Apply requires --yes or an interactive confirmation after preview.',
      ),
    );
  }

  if (
    request.action === 'send_invoice' &&
    targetDocument &&
    targetDocument.status &&
    targetDocument.status !== 'issued'
  ) {
    blockingIssues.push(
      issue(
        'invoice_not_issued',
        `Invoice ${targetDocument.id} is in status ${targetDocument.status} and should be issued before sending.`,
      ),
    );
  }

  return {
    agent: 'aikount_safe_execution_skill',
    approved: blockingIssues.length === 0,
    warnings,
    blockingIssues: dedupeIssues(blockingIssues),
  };
}

function dedupeIssues(issues) {
  const seen = new Set();
  return issues.filter((item) => {
    const key = `${item.code}:${item.message}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

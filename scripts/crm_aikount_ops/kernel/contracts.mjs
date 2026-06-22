import crypto from 'node:crypto';

export const CRM_AIKOUNT_TOOL = 'crm-aikount-ops';

export const VALID_ACTIONS = new Set([
  'create_quote',
  'update_quote',
  'send_quote',
  'accept_quote',
  'reject_quote',
  'convert_quote_to_invoice',
  'create_invoice',
  'update_invoice',
  'issue_invoice',
  'share_invoice',
  'send_invoice',
]);

const VALID_MODES = new Set(['dry_run', 'apply']);

export function parseAikountActionRequest(input) {
  if (!isObject(input)) {
    throw new Error('AikountActionRequest must be an object.');
  }
  if (!nonEmptyString(input.requester)) {
    throw new Error('AikountActionRequest.requester is required.');
  }
  if (!VALID_ACTIONS.has(input.action)) {
    throw new Error(
      `AikountActionRequest.action must be one of: ${[...VALID_ACTIONS].join(', ')}`,
    );
  }

  const mode = input.mode ?? 'dry_run';
  if (!VALID_MODES.has(mode)) {
    throw new Error(
      `AikountActionRequest.mode must be one of: ${[...VALID_MODES].join(', ')}`,
    );
  }

  return {
    requestId: input.requestId ?? createRequestId(),
    requester: input.requester,
    mode,
    action: input.action,
    intent: String(input.intent ?? ''),
    dealLookup: normalizeDealLookup(input.dealLookup),
    selectedMappings: isObject(input.selectedMappings) ? input.selectedMappings : {},
    answers: isObject(input.answers) ? input.answers : {},
    constraints: normalizeConstraints(input.constraints),
    container: normalizeContainerContext(input.container),
  };
}

export function createRequestId() {
  return `aikountops_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto
    .randomUUID()
    .slice(0, 8)}`;
}

export function issue(code, message, details = {}) {
  return { code, message, ...details };
}

export function agentArtifact({
  agent,
  status = 'completed',
  warnings = [],
  blockingIssues = [],
  ...rest
}) {
  return {
    agent,
    status,
    warnings,
    blockingIssues,
    ...rest,
  };
}

export function sanitizeForLog(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const sanitized = {};
  for (const [key, child] of Object.entries(value)) {
    if (/api[_-]?key|authorization|bearer|secret|token|password/i.test(key)) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeForLog(child);
    }
  }
  return sanitized;
}

function normalizeDealLookup(raw) {
  if (typeof raw === 'string') {
    return { search: raw };
  }
  if (!isObject(raw)) {
    return {};
  }
  return {
    opportunityId: nonEmptyString(raw.opportunityId) ? raw.opportunityId.trim() : null,
    opportunityUrl: nonEmptyString(raw.opportunityUrl)
      ? raw.opportunityUrl.trim()
      : null,
    search: nonEmptyString(raw.search) ? raw.search.trim() : null,
  };
}

function normalizeConstraints(raw) {
  const constraints = isObject(raw) ? raw : {};
  const maxDocuments = constraints.maxDocuments ?? 10;
  if (!Number.isInteger(maxDocuments) || maxDocuments < 1 || maxDocuments > 100) {
    throw new Error('constraints.maxDocuments must be an integer from 1 to 100.');
  }

  return {
    maxDocuments,
    requireHumanConfirmation: booleanOrDefault(
      constraints.requireHumanConfirmation,
      true,
    ),
    allowCreate: booleanOrDefault(constraints.allowCreate, true),
    allowUpdate: booleanOrDefault(constraints.allowUpdate, true),
    allowSend: booleanOrDefault(constraints.allowSend, true),
  };
}

function normalizeContainerContext(raw) {
  if (!isObject(raw)) {
    return null;
  }

  const itemIds = Array.isArray(raw.itemIds)
    ? raw.itemIds.map((item) => String(item)).filter(Boolean)
    : [];

  return {
    itemIds,
    sourceMode: nonEmptyString(raw.sourceMode) ? raw.sourceMode : null,
    files: Array.isArray(raw.files) ? raw.files : [],
    title: nonEmptyString(raw.title) ? raw.title : null,
    notes: nonEmptyString(raw.notes) ? raw.notes : null,
  };
}

function booleanOrDefault(value, fallback) {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'boolean') {
    throw new Error('Constraint flags must be booleans.');
  }
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

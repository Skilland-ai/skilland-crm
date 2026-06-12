import crypto from 'node:crypto';

export const CRM_EXECUTION_TOOL = 'crm-execution-crew';

const VALID_MODES = new Set(['dry_run', 'apply']);
const VALID_OPERATION_TYPES = new Set([
  'create_opportunity',
  'update_opportunity',
  'create_note',
  'create_task',
  'close_task',
  'delete_record',
  'metadata_change',
]);

export function parseCrmActionRequest(input) {
  if (!isObject(input)) throw new Error('CrmActionRequest must be an object.');
  if (!nonEmptyString(input.requester)) {
    throw new Error('CrmActionRequest.requester is required.');
  }

  const mode = input.mode ?? 'dry_run';
  if (!VALID_MODES.has(mode)) {
    throw new Error(`CrmActionRequest.mode must be one of: ${[...VALID_MODES].join(', ')}`);
  }

  const operations = Array.isArray(input.operations) ? input.operations : [];
  if (operations.length === 0 && !input.requestText) {
    throw new Error('CrmActionRequest requires operations[] or requestText.');
  }

  return {
    requestId: input.requestId ?? createRequestId(),
    requester: input.requester,
    mode,
    intent: String(input.intent ?? ''),
    requestText: input.requestText,
    scope: isObject(input.scope) ? input.scope : {},
    constraints: normalizeConstraints(input.constraints),
    operations: operations.map(normalizeOperation),
  };
}

export function createRequestId() {
  return `crmexec_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto
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
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
  if (!value || typeof value !== 'object') return value;

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

function normalizeConstraints(raw) {
  const constraints = isObject(raw) ? raw : {};
  const maxRecords = constraints.maxRecords ?? 200;
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 1000) {
    throw new Error('constraints.maxRecords must be an integer from 1 to 1000.');
  }

  return {
    maxRecords,
    requireHumanConfirmation: booleanOrDefault(
      constraints.requireHumanConfirmation,
      true,
    ),
    allowCreate: booleanOrDefault(constraints.allowCreate, true),
    allowUpdate: booleanOrDefault(constraints.allowUpdate, true),
    allowDelete: booleanOrDefault(constraints.allowDelete, false),
    allowMetadataChanges: booleanOrDefault(
      constraints.allowMetadataChanges,
      false,
    ),
  };
}

function normalizeOperation(operation, index) {
  if (!isObject(operation)) {
    throw new Error(`operations[${index}] must be an object.`);
  }
  if (!VALID_OPERATION_TYPES.has(operation.type)) {
    throw new Error(
      `operations[${index}].type must be one of: ${[...VALID_OPERATION_TYPES].join(', ')}`,
    );
  }

  return {
    ...operation,
    lookup: isObject(operation.lookup) ? operation.lookup : {},
    data: operation.data === undefined ? undefined : requireObject(operation.data, `operations[${index}].data`),
    note: operation.note === undefined ? undefined : normalizeNote(operation.note, index),
    task: operation.task === undefined ? undefined : normalizeTask(operation.task, index),
  };
}

function normalizeNote(note, index) {
  if (!isObject(note)) throw new Error(`operations[${index}].note must be an object.`);
  if (!nonEmptyString(note.markdown)) {
    throw new Error(`operations[${index}].note.markdown is required.`);
  }
  return {
    title: nonEmptyString(note.title) ? note.title : 'CRM Execution Crew note',
    markdown: note.markdown,
  };
}

function normalizeTask(task, index) {
  if (!isObject(task)) throw new Error(`operations[${index}].task must be an object.`);
  if (!nonEmptyString(task.title)) {
    throw new Error(`operations[${index}].task.title is required.`);
  }
  return {
    title: task.title,
    markdown: String(task.markdown ?? ''),
    dueAt: task.dueAt ?? null,
    assigneeId: task.assigneeId ?? null,
  };
}

function requireObject(value, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function booleanOrDefault(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error('Constraint flags must be booleans.');
  return value;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export const ROUTER_ERROR_CODES = new Set([
  'INVALID_HANDOFF',
  'CONTRACT_VERSION_UNSUPPORTED',
  'REPO_MISMATCH',
  'FOUNDATION_INVALID',
  'CAPABILITY_UNKNOWN',
  'CAPABILITY_INTERNAL',
  'CAPABILITY_BLOCKED',
  'CAPABILITY_NOT_IMPLEMENTED',
  'MODE_UNSUPPORTED',
  'ENVIRONMENT_UNSUPPORTED',
  'WORKSPACE_BINDING_MISMATCH',
  'SCOPE_EXCEEDED',
  'ADAPTER_NOT_FOUND',
  'OUTPUT_POLICY_VIOLATION',
  'SOURCE_DATA_INCOMPLETE',
  'INVALID_PLAN',
  'PLAN_HASH_MISMATCH',
  'POLICY_DENIED',
  'POLICY_VERSION_MISMATCH',
  'APPROVAL_REQUIRED',
  'INVALID_APPROVAL',
  'APPROVAL_MISMATCH',
  'APPROVAL_EXPIRED',
  'PRECONDITION_FAILED',
  'PRECONDITION_DRIFT',
  'IDEMPOTENCY_CONFLICT',
  'IDEMPOTENCY_IN_PROGRESS',
  'IDEMPOTENCY_OUTCOME_UNKNOWN',
  'WORKER_NOT_FOUND',
  'WORKER_OUTPUT_INVALID',
  'OUTCOME_UNKNOWN',
  'EXECUTION_FAILED',
]);

const DEFAULT_MESSAGES = Object.freeze({
  INVALID_HANDOFF: 'The repository handoff is invalid.',
  CONTRACT_VERSION_UNSUPPORTED: 'The repository handoff contract version is not supported.',
  REPO_MISMATCH: 'The handoff does not target this repository.',
  FOUNDATION_INVALID: 'The local routing foundation is invalid.',
  CAPABILITY_UNKNOWN: 'The requested capability is not registered unambiguously.',
  CAPABILITY_INTERNAL: 'The requested capability is not exposed through the local front door.',
  CAPABILITY_BLOCKED: 'The requested capability is blocked by local policy.',
  CAPABILITY_NOT_IMPLEMENTED: 'The requested capability is not implemented in the local front door.',
  MODE_UNSUPPORTED: 'The requested execution mode is not supported.',
  ENVIRONMENT_UNSUPPORTED: 'The requested environment is not allowlisted for this capability.',
  WORKSPACE_BINDING_MISMATCH: 'The requested workspace is not bound to the configured environment.',
  SCOPE_EXCEEDED: 'The requested scope exceeds the registered capability limits.',
  ADAPTER_NOT_FOUND: 'No allowlisted adapter is registered for this capability.',
  OUTPUT_POLICY_VIOLATION: 'The requested output violates the local artifact policy.',
  SOURCE_DATA_INCOMPLETE: 'Source completeness cannot be demonstrated for this operation.',
  INVALID_PLAN: 'The operation plan is invalid.',
  PLAN_HASH_MISMATCH: 'The operation plan hash does not match its canonical content.',
  POLICY_DENIED: 'The current policy denies this operation.',
  POLICY_VERSION_MISMATCH: 'The plan is not bound to the current registry and policy versions.',
  APPROVAL_REQUIRED: 'A valid plan-bound approval is required.',
  INVALID_APPROVAL: 'The operation approval is invalid.',
  APPROVAL_MISMATCH: 'The approval is not bound to this exact operation plan.',
  APPROVAL_EXPIRED: 'The operation plan or approval has expired.',
  PRECONDITION_FAILED: 'A required operation precondition is not satisfied.',
  PRECONDITION_DRIFT: 'A required operation precondition changed after planning.',
  IDEMPOTENCY_CONFLICT: 'An idempotency key is already bound to a different plan.',
  IDEMPOTENCY_IN_PROGRESS: 'An execution with the same idempotency key is already in progress.',
  IDEMPOTENCY_OUTCOME_UNKNOWN: 'A previous execution has an unknown outcome and cannot be retried automatically.',
  WORKER_NOT_FOUND: 'No static allowlisted worker is registered for this capability.',
  WORKER_OUTPUT_INVALID: 'The deterministic worker returned an invalid execution result.',
  OUTCOME_UNKNOWN: 'The worker outcome is unknown; manual reconciliation is required.',
  EXECUTION_FAILED: 'The capability execution failed safely.',
});

export class RouterError extends Error {
  constructor(code, options = {}) {
    const normalizedCode = ROUTER_ERROR_CODES.has(code)
      ? code
      : 'EXECUTION_FAILED';
    const publicMessage =
      options.publicMessage ?? DEFAULT_MESSAGES[normalizedCode];

    super(publicMessage, options.cause ? { cause: options.cause } : undefined);
    this.name = 'RouterError';
    this.code = normalizedCode;
    this.publicMessage = publicMessage;
    this.retryable = options.retryable === true;
    this.outcome = options.outcome === 'failed' ? 'failed' : 'blocked';
  }
}

export function asRouterError(error, fallback = {}) {
  if (error instanceof RouterError) {
    return error;
  }

  const hasTrustedCode =
    typeof error?.code === 'string' && ROUTER_ERROR_CODES.has(error.code);
  const candidateCode = hasTrustedCode
    ? error.code
    : fallback.code ?? 'EXECUTION_FAILED';

  return new RouterError(candidateCode, {
    cause: error,
    publicMessage:
      hasTrustedCode && typeof error?.publicMessage === 'string'
        ? error.publicMessage
        : fallback.publicMessage,
    retryable:
      typeof error?.retryable === 'boolean'
        ? error.retryable
        : fallback.retryable,
    outcome:
      error?.outcome === 'blocked' || error?.outcome === 'failed'
        ? error.outcome
        : fallback.outcome,
  });
}

export function defaultPublicMessage(code) {
  return DEFAULT_MESSAGES[code] ?? DEFAULT_MESSAGES.EXECUTION_FAILED;
}

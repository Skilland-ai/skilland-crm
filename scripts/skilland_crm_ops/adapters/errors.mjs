export class SafeAdapterError extends Error {
  constructor(
    code,
    publicMessage,
    { retryable = false, outcome = 'blocked', cause } = {},
  ) {
    super(publicMessage, cause ? { cause } : undefined);
    this.name = 'SafeAdapterError';
    this.code = code;
    this.publicMessage = publicMessage;
    this.retryable = retryable;
    this.outcome = outcome;
  }
}

export function asSafeAdapterError(error) {
  if (error instanceof SafeAdapterError) return error;

  if (
    error &&
    typeof error.code === 'string' &&
    typeof error.publicMessage === 'string' &&
    typeof error.retryable === 'boolean' &&
    ['blocked', 'failed'].includes(error.outcome)
  ) {
    return new SafeAdapterError(error.code, error.publicMessage, {
      retryable: error.retryable,
      outcome: error.outcome,
      cause: error,
    });
  }

  return new SafeAdapterError(
    'CRM_EXPORT_EXECUTION_FAILED',
    'El export CRM fallo de forma segura y no publico un artefacto completo.',
    { retryable: false, outcome: 'failed', cause: error },
  );
}

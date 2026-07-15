import { redactSensitive } from './redaction.mjs';

function clockIso(clock) {
  try {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  } catch {
    // Logging must not alter the routing decision.
  }
  return new Date().toISOString();
}

export function createJsonStderrLogger({
  stream = process.stderr,
  clock = () => new Date(),
} = {}) {
  return Object.freeze({
    event(event, fields = {}) {
      const safeEvent =
        typeof event === 'string' && /^[a-z][a-z0-9_.-]*$/.test(event)
          ? event
          : 'router.invalid_event';
      const payload = redactSensitive({
        ...fields,
        timestamp: clockIso(clock),
        event: safeEvent,
      });
      stream.write(`${JSON.stringify(payload)}\n`);
    },
  });
}

export function emitRouterLog(logger, event, fields = {}) {
  try {
    if (typeof logger === 'function') {
      logger(event, redactSensitive(fields));
      return;
    }
    logger?.event?.(event, fields);
  } catch {
    // Observability is best effort; a logger failure never broadens authority
    // and never replaces the structured router result.
  }
}

import { performance } from 'node:perf_hooks';

import { asRouterError, RouterError } from './errors.mjs';
import { loadFoundation } from './foundation.mjs';
import { emitRouterLog } from './logger.mjs';
import {
  findSecretShapedKeyPath,
  findSensitiveTextPath,
  redactSafeStrings,
  redactSensitive,
  redactText,
} from './redaction.mjs';
import {
  OPERATION_ENVELOPE_SCHEMA,
  OPERATION_ENVELOPE_VERSION,
  REPO_ID,
  validateExecutionRecord,
  validateIssue,
  validateOperationResult,
  validateRepoHandoff,
} from './validation.mjs';

const GATE_007_CAPABILITY_ALLOWLIST = new Set(['report.crm.export']);
const NUMERIC_SCOPE_LIMITS = [
  'maxRecords',
  'maxDocuments',
  'maxRecipients',
  'maxLocalArtifacts',
];
const BOOLEAN_SCOPE_LIMITS = [
  'allowExternalSend',
  'allowMetadataMutation',
  'allowDestructive',
  'allowWorkflowActivation',
];

function nowIso(clock) {
  try {
    const value = clock();
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  } catch {
    // Fall through to a safe local timestamp.
  }
  return new Date().toISOString();
}

function sentinelContext(timestamp) {
  return {
    requestId: 'request_invalid_000',
    correlationId: 'correlation_invalid_000',
    capabilityId: 'system.routing.invalid',
    requester: { id: 'system_router', type: 'system', channel: 'local' },
    environment: { name: 'test', workspace: 'unknown' },
    mode: 'read_only',
    createdAt: timestamp,
  };
}

function requestContext(request, capabilityId = request.capabilityId) {
  return {
    requestId: request.requestId,
    correlationId: request.correlationId,
    capabilityId,
    requester: structuredClone(request.requester),
    environment: structuredClone(request.environment),
    mode: request.mode,
    createdAt: request.createdAt,
  };
}

function issueFromError(error) {
  return {
    code: error.code,
    message: redactText(error.publicMessage),
    retryable: error.retryable,
  };
}

function buildResult({
  context,
  registry,
  status,
  policyDecision,
  operations = [],
  evidence = [],
  warnings = [],
  errors = [],
  nextActions = [],
  completedAt,
}) {
  return {
    $schema: OPERATION_ENVELOPE_SCHEMA,
    schemaVersion: OPERATION_ENVELOPE_VERSION,
    kind: 'operation_result',
    requestId: context.requestId,
    correlationId: context.correlationId,
    repoId: REPO_ID,
    capabilityId: context.capabilityId,
    requester: context.requester,
    environment: context.environment,
    mode: context.mode,
    createdAt: context.createdAt,
    planId: null,
    planHash: null,
    registryVersion: registry?.registryVersion ?? null,
    policyVersion: registry?.policyVersion ?? null,
    policyDecision,
    approvalIds: [],
    status,
    effectiveMode: context.mode,
    operations,
    evidence,
    warnings,
    errors,
    partialFailure: null,
    nextActions,
    completedAt,
  };
}

function failureResult({ context, registry, error, completedAt, authorized }) {
  const status = error.outcome === 'failed' ? 'failed' : 'blocked';
  return buildResult({
    context,
    registry,
    status,
    policyDecision: status === 'blocked' || !authorized ? 'deny' : 'allow',
    errors: [issueFromError(error)],
    nextActions: [
      status === 'blocked'
        ? 'Correct the request or local configuration before retrying.'
        : 'Inspect redacted local telemetry before retrying.',
    ],
    completedAt,
  });
}

function readinessAllowsMode(readiness, mode) {
  if (mode === 'read_only') {
    return ['read_only', 'dry_run', 'apply_guarded'].includes(readiness);
  }
  if (mode === 'dry_run') return ['dry_run', 'apply_guarded'].includes(readiness);
  return false;
}

export function resolveCapability(registry, requestedCapabilityId) {
  const canonical = registry.capabilities.find(
    (capability) => capability.id === requestedCapabilityId,
  );
  if (canonical) return { capability: canonical, aliasUsed: null };

  const aliasMatches = registry.capabilities.filter((capability) =>
    capability.aliases.includes(requestedCapabilityId),
  );
  if (aliasMatches.length !== 1) {
    throw new RouterError('CAPABILITY_UNKNOWN');
  }
  return {
    capability: aliasMatches[0],
    aliasUsed: requestedCapabilityId,
  };
}

function rejectScope() {
  throw new RouterError('SCOPE_EXCEEDED');
}

export function enforceScopeLimits(requested, registered) {
  for (const key of NUMERIC_SCOPE_LIMITS) {
    if (requested[key] > registered[key]) rejectScope();
  }
  for (const key of BOOLEAN_SCOPE_LIMITS) {
    if (requested[key] === true && registered[key] !== true) rejectScope();
  }
  if (
    requested.allowMetadataMutation ||
    requested.allowDestructive ||
    requested.allowWorkflowActivation
  ) {
    rejectScope();
  }

  const cardinalityLimits = [
    ['recordIds', 'maxRecords'],
    ['documentIds', 'maxDocuments'],
    ['recipientRefs', 'maxRecipients'],
    ['workflowIds', 'maxRecords'],
  ];
  for (const [arrayKey, limitKey] of cardinalityLimits) {
    if (requested[arrayKey]?.length > requested[limitKey]) rejectScope();
  }
  if (requested.senderAccountRef && requested.maxRecipients === 0) rejectScope();

  for (const key of ['resourceTypes', 'fieldNames']) {
    if (!Object.hasOwn(requested, key)) continue;
    if (!Object.hasOwn(registered, key)) {
      if (requested[key].length > 0) rejectScope();
      continue;
    }
    if (requested[key].some((item) => !registered[key].includes(item))) rejectScope();
  }

  if (Object.hasOwn(requested, 'localPathPrefixes')) {
    if (
      !Array.isArray(registered.localPathPrefixes) ||
      requested.localPathPrefixes.length > requested.maxLocalArtifacts ||
      requested.localPathPrefixes.some(
        (prefix) => !registered.localPathPrefixes.includes(prefix),
      )
    ) {
      rejectScope();
    }
  }
  if (Object.hasOwn(requested, 'allowOverwrite')) {
    if (
      typeof registered.allowOverwrite !== 'boolean' ||
      (requested.allowOverwrite && !registered.allowOverwrite)
    ) {
      rejectScope();
    }
  }
  if (Object.hasOwn(requested, 'maxArtifactBytes')) {
    if (
      !Number.isSafeInteger(registered.maxArtifactBytes) ||
      requested.maxArtifactBytes < 1 ||
      requested.maxArtifactBytes > registered.maxArtifactBytes
    ) {
      rejectScope();
    }
  }

  for (const key of ['maxAmountMinor', 'currency']) {
    if (Object.hasOwn(requested, key) && !Object.hasOwn(registered, key)) {
      rejectScope();
    }
  }
  if (
    Object.hasOwn(requested, 'maxAmountMinor') &&
    requested.maxAmountMinor > registered.maxAmountMinor
  ) {
    rejectScope();
  }
  if (
    Object.hasOwn(requested, 'currency') &&
    requested.currency !== registered.currency
  ) {
    rejectScope();
  }
}

function enforceCapabilityGates(request, capability) {
  if (capability.routingExposure !== 'public') {
    throw new RouterError('CAPABILITY_INTERNAL');
  }
  if (
    capability.lifecycleStatus === 'blocked' ||
    capability.frontDoorReadiness === 'denied'
  ) {
    throw new RouterError('CAPABILITY_BLOCKED');
  }
  if (capability.lifecycleStatus !== 'active') {
    throw new RouterError('CAPABILITY_NOT_IMPLEMENTED');
  }
  if (capability.frontDoorReadiness === 'not_implemented') {
    throw new RouterError('CAPABILITY_NOT_IMPLEMENTED');
  }
  if (!['read_only', 'dry_run'].includes(request.mode)) {
    throw new RouterError('MODE_UNSUPPORTED');
  }
  if (
    !capability.supportedModes.includes(request.mode) ||
    !readinessAllowsMode(capability.frontDoorReadiness, request.mode)
  ) {
    throw new RouterError('MODE_UNSUPPORTED');
  }
  if (!capability.environmentAllowlist.includes(request.environment.name)) {
    throw new RouterError('ENVIRONMENT_UNSUPPORTED');
  }
  enforceScopeLimits(request.requestedScope, capability.scopeLimits);
  if (!GATE_007_CAPABILITY_ALLOWLIST.has(capability.id)) {
    throw new RouterError('CAPABILITY_NOT_IMPLEMENTED');
  }
  if (capability.id === 'report.crm.export') {
    const allowedKeys = new Set([
      'maxRecords',
      'maxDocuments',
      'maxRecipients',
      'maxLocalArtifacts',
      'localPathPrefixes',
      'allowOverwrite',
      'maxArtifactBytes',
      'allowExternalSend',
      'allowMetadataMutation',
      'allowDestructive',
      'allowWorkflowActivation',
    ]);
    const scope = request.requestedScope;
    if (
      Object.keys(scope).some((key) => !allowedKeys.has(key)) ||
      scope.maxRecords < 1 ||
      scope.maxDocuments !== 0 ||
      scope.maxRecipients !== 0 ||
      scope.maxLocalArtifacts !== 1 ||
      scope.localPathPrefixes?.length !== 1 ||
      scope.localPathPrefixes[0] !== '04_outputs/crm_manual_update_session' ||
      scope.allowOverwrite !== false ||
      !Number.isSafeInteger(scope.maxArtifactBytes) ||
      scope.maxArtifactBytes < 1 ||
      scope.allowExternalSend !== false ||
      scope.allowMetadataMutation !== false ||
      scope.allowDestructive !== false ||
      scope.allowWorkflowActivation !== false
    ) {
      throw new RouterError('SCOPE_EXCEEDED');
    }
  }
}

function getAdapter(adapters, capabilityId) {
  if (adapters instanceof Map) return adapters.get(capabilityId);
  if (adapters && typeof adapters === 'object') {
    return Object.hasOwn(adapters, capabilityId)
      ? adapters[capabilityId]
      : undefined;
  }
  return undefined;
}

function sanitizeWarnings(warnings) {
  if (!Array.isArray(warnings)) {
    throw new RouterError('EXECUTION_FAILED', { outcome: 'failed' });
  }
  return warnings.map((warning) => {
    if (!warning || typeof warning !== 'object') {
      throw new RouterError('EXECUTION_FAILED', { outcome: 'failed' });
    }
    const sanitized = {
      code: warning.code,
      message: redactText(warning.message),
      retryable: warning.retryable,
    };
    try {
      validateIssue(sanitized);
    } catch (error) {
      throw new RouterError('EXECUTION_FAILED', {
        cause: error,
        outcome: 'failed',
      });
    }
    return sanitized;
  });
}

function sanitizeAdapterOutput(output, request) {
  if (!output || typeof output !== 'object') {
    throw new RouterError('EXECUTION_FAILED', { outcome: 'failed' });
  }
  const selectedOutput = {
    operation: output.operation,
    evidence: output.evidence,
    warnings: output.warnings,
  };
  if (
    findSecretShapedKeyPath(selectedOutput) ||
    findSensitiveTextPath(selectedOutput)
  ) {
    throw new RouterError('EXECUTION_FAILED', { outcome: 'failed' });
  }
  const operation = redactSensitive(output.operation);
  try {
    validateExecutionRecord(operation);
  } catch (error) {
    throw new RouterError('EXECUTION_FAILED', {
      cause: error,
      outcome: 'failed',
    });
  }

  if (request.mode === 'read_only' && operation.status !== 'succeeded') {
    throw new RouterError('EXECUTION_FAILED', { outcome: 'failed' });
  }
  if (
    request.mode === 'dry_run' &&
    !['simulated', 'planned'].includes(operation.status)
  ) {
    throw new RouterError('EXECUTION_FAILED', { outcome: 'failed' });
  }

  const evidence = [...new Set(redactSafeStrings(output.evidence))];
  if (!Array.isArray(output.evidence) || evidence.length !== output.evidence.length) {
    throw new RouterError('EXECUTION_FAILED', { outcome: 'failed' });
  }

  return {
    operation,
    evidence,
    warnings: sanitizeWarnings(output.warnings),
  };
}

function canonicalRequest(request, capabilityId) {
  return structuredClone({ ...request, capabilityId });
}

function validateEmittedResult(result) {
  try {
    return validateOperationResult(result);
  } catch (error) {
    throw new RouterError('EXECUTION_FAILED', {
      cause: error,
      publicMessage: 'The local router could not produce a valid operation result.',
      outcome: 'failed',
    });
  }
}

/**
 * Resolve and execute one repository-local handoff.
 *
 * Adapters are an injected, static canonical-id map. The router never derives a
 * command, module path, API call, or fallback from handoff content.
 */
export async function routeRepoHandoff(
  handoff,
  {
    rootDir,
    adapters = Object.freeze({}),
    clock = () => new Date(),
    logger = null,
  } = {},
) {
  const startedAt = performance.now();
  const initialTimestamp = nowIso(clock);
  let context = sentinelContext(initialTimestamp);
  let foundation = null;
  let resolved = null;
  let authorized = false;

  emitRouterLog(logger, 'router.received');

  try {
    const validatedHandoff = validateRepoHandoff(handoff);
    const request = validatedHandoff.operationRequest;
    context = requestContext(request);
    emitRouterLog(logger, 'router.handoff_validated', {
      requestId: request.requestId,
      correlationId: request.correlationId,
      environment: request.environment.name,
      mode: request.mode,
    });

    foundation = await loadFoundation({ rootDir });
    resolved = resolveCapability(
      foundation.registry,
      request.capabilityId,
    );
    context = requestContext(request, resolved.capability.id);
    emitRouterLog(logger, 'router.capability_resolved', {
      requestId: request.requestId,
      correlationId: request.correlationId,
      capabilityId: resolved.capability.id,
      aliasUsed: resolved.aliasUsed,
      environment: request.environment.name,
      mode: request.mode,
    });

    enforceCapabilityGates(request, resolved.capability);
    const adapter = getAdapter(adapters, resolved.capability.id);
    if (typeof adapter !== 'function') {
      throw new RouterError('ADAPTER_NOT_FOUND');
    }

    authorized = true;
    const requestForAdapter = canonicalRequest(
      request,
      resolved.capability.id,
    );
    const adapterOutput = await adapter({
      request: requestForAdapter,
      capability: structuredClone(resolved.capability),
      clock,
    });
    const safeOutput = sanitizeAdapterOutput(adapterOutput, requestForAdapter);
    const status = request.mode === 'dry_run' ? 'simulated' : 'succeeded';
    const result = buildResult({
      context,
      registry: foundation.registry,
      status,
      policyDecision: 'allow',
      operations: [safeOutput.operation],
      evidence: safeOutput.evidence,
      warnings: safeOutput.warnings,
      completedAt: nowIso(clock),
    });
    validateEmittedResult(result);

    emitRouterLog(logger, 'router.completed', {
      requestId: context.requestId,
      correlationId: context.correlationId,
      capabilityId: context.capabilityId,
      environment: context.environment.name,
      mode: context.mode,
      decision: 'allow',
      status,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      operationCount: result.operations.length,
    });
    return result;
  } catch (caught) {
    const error = asRouterError(caught, {
      code: foundation ? 'EXECUTION_FAILED' : 'INVALID_HANDOFF',
      outcome: foundation ? 'failed' : 'blocked',
    });
    if (!resolved) {
      context = {
        ...context,
        capabilityId: 'system.routing.invalid',
      };
    }
    const result = failureResult({
      context,
      registry: foundation?.registry ?? null,
      error,
      completedAt: nowIso(clock),
      authorized,
    });

    try {
      validateOperationResult(result);
    } catch {
      const emergency = failureResult({
        context: sentinelContext(nowIso(clock)),
        registry: null,
        error: new RouterError('EXECUTION_FAILED', {
          publicMessage: 'The local router failed closed while building its result.',
          outcome: 'failed',
        }),
        completedAt: nowIso(clock),
        authorized: false,
      });
      validateOperationResult(emergency);
      emitRouterLog(logger, 'router.failed_closed', {
        errorCode: 'EXECUTION_FAILED',
        decision: 'deny',
        status: 'failed',
      });
      return emergency;
    }

    emitRouterLog(logger, 'router.rejected', {
      ...(context.requestId !== 'request_invalid_000'
        ? {
            requestId: context.requestId,
            correlationId: context.correlationId,
          }
        : {}),
      ...(resolved ? { capabilityId: context.capabilityId } : {}),
      environment:
        context.requestId !== 'request_invalid_000'
          ? context.environment.name
          : undefined,
      mode: context.requestId !== 'request_invalid_000' ? context.mode : undefined,
      decision: result.policyDecision,
      status: result.status,
      errorCode: error.code,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    });
    return result;
  }
}

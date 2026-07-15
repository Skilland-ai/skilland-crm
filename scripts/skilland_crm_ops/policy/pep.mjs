import { RouterError, asRouterError, defaultPublicMessage } from '../errors.mjs';
import {
  OPERATION_ENVELOPE_SCHEMA,
  OPERATION_ENVELOPE_VERSION,
  REPO_ID,
  isPlainObject,
  validateExecutionRecord,
  validateIssue,
  validateOperationPlan,
  validatePolicyOperationResult,
} from '../validation.mjs';
import { validatePlanBoundApproval } from './approval.mjs';
import { canonicalJson, deepFrozenJsonClone } from './canonical-json.mjs';
import { InMemoryIdempotencyStore } from './idempotency-store.mjs';
import { verifyOperationPlanHash } from './plan.mjs';
import { evaluatePlanPolicy } from './policy.mjs';

const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function clockIso(clock) {
  const value = clock();
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RouterError('EXECUTION_FAILED', {
      publicMessage: 'The policy enforcement clock is invalid.',
    });
  }
  return date.toISOString();
}

function issue(code, message = defaultPublicMessage(code), retryable = false) {
  return { code, message, retryable };
}

function resultBase(plan, completedAt) {
  return {
    $schema: OPERATION_ENVELOPE_SCHEMA,
    schemaVersion: OPERATION_ENVELOPE_VERSION,
    kind: 'operation_result',
    requestId: plan.requestId,
    correlationId: plan.correlationId,
    repoId: REPO_ID,
    capabilityId: plan.capabilityId,
    requester: deepFrozenJsonClone(plan.requester),
    environment: deepFrozenJsonClone(plan.environment),
    mode: plan.mode,
    createdAt: plan.createdAt,
    planId: plan.planId,
    planHash: plan.planHash,
    registryVersion: plan.registryVersion,
    policyVersion: plan.policyVersion,
    effectiveMode: plan.mode,
    evidence: [],
    warnings: [],
    errors: [],
    partialFailure: null,
    nextActions: [],
    completedAt,
  };
}

function finalizeResult(result) {
  validatePolicyOperationResult(result);
  return deepFrozenJsonClone(result);
}

function blockedResult(plan, error, completedAt) {
  return finalizeResult({
    ...resultBase(plan, completedAt),
    policyDecision: 'deny',
    approvalIds: [],
    status: 'blocked',
    operations: [],
    errors: [issue(error.code, error.publicMessage, error.retryable)],
    nextActions: ['Correct the plan, approval, or policy state before retrying.'],
  });
}

function unknownOutcomeResult(plan, approval, workerVersion, completedAt) {
  return finalizeResult({
    ...resultBase(plan, completedAt),
    policyDecision: 'require_approval',
    approvalIds: [approval.approvalId],
    status: 'failed',
    operations: plan.operations.map((operation) => ({
      operationId: operation.operationId,
      targetSystem: operation.targetSystem,
      workerVersion,
      status: 'failed',
      resourceRef: null,
      idempotencyKey: operation.idempotencyKey,
      evidence: [],
    })),
    errors: [issue('OUTCOME_UNKNOWN')],
    nextActions: [
      'Reconcile every target operation manually; do not retry this plan automatically.',
    ],
  });
}

function assertWorkerOutput(output, plan, workerVersion) {
  if (
    !isPlainObject(output) ||
    Object.keys(output).length !== 4 ||
    !['operations', 'evidence', 'warnings', 'errors'].every((key) =>
      Object.hasOwn(output, key),
    ) ||
    !Array.isArray(output.operations) ||
    !Array.isArray(output.evidence) ||
    !Array.isArray(output.warnings) ||
    !Array.isArray(output.errors)
  ) {
    throw new RouterError('WORKER_OUTPUT_INVALID');
  }
  for (const record of output.operations) {
    try {
      validateExecutionRecord(record, 'WORKER_OUTPUT_INVALID');
    } catch (error) {
      throw new RouterError('WORKER_OUTPUT_INVALID', { cause: error });
    }
  }
  for (const warning of output.warnings) {
    try {
      validateIssue(warning, 'WORKER_OUTPUT_INVALID');
    } catch (error) {
      throw new RouterError('WORKER_OUTPUT_INVALID', { cause: error });
    }
  }
  for (const error of output.errors) {
    try {
      validateIssue(error, 'WORKER_OUTPUT_INVALID');
    } catch (cause) {
      throw new RouterError('WORKER_OUTPUT_INVALID', { cause });
    }
  }
  if (
    output.evidence.some(
      (entry) => typeof entry !== 'string' || entry.length < 1,
    )
  ) {
    throw new RouterError('WORKER_OUTPUT_INVALID');
  }

  const plannedById = new Map(
    plan.operations.map((operation) => [operation.operationId, operation]),
  );
  if (
    output.operations.length !== plan.operations.length ||
    new Set(output.operations.map((record) => record.operationId)).size !==
      output.operations.length ||
    output.operations.some((record) => {
      const planned = plannedById.get(record.operationId);
      return (
        !planned ||
        record.targetSystem !== planned.targetSystem ||
        record.idempotencyKey !== planned.idempotencyKey ||
        record.workerVersion !== workerVersion ||
        !['succeeded', 'failed', 'compensated'].includes(record.status)
      );
    })
  ) {
    throw new RouterError('WORKER_OUTPUT_INVALID');
  }
  return deepFrozenJsonClone(output);
}

function executionResult(plan, approval, output, completedAt) {
  const completed = output.operations.filter((record) =>
    ['succeeded', 'compensated'].includes(record.status),
  );
  const failed = output.operations.filter((record) => record.status === 'failed');
  const allSucceeded = completed.length === output.operations.length &&
    completed.every((record) => record.status === 'succeeded');
  const partial = completed.length > 0 && failed.length > 0;
  const errors = [...output.errors];
  if (!allSucceeded && errors.length === 0) {
    errors.push(
      issue(
        'WORKER_OPERATION_FAILED',
        'One or more deterministic worker operations failed.',
      ),
    );
  }

  return finalizeResult({
    ...resultBase(plan, completedAt),
    policyDecision: 'require_approval',
    approvalIds: [approval.approvalId],
    status: allSucceeded ? 'succeeded' : partial ? 'partial_failure' : 'failed',
    operations: output.operations,
    evidence: output.evidence,
    warnings: output.warnings,
    errors,
    partialFailure: partial
      ? {
          completedOperationIds: completed.map((record) => record.operationId),
          failedOperationIds: failed.map((record) => record.operationId),
          compensationStatus: completed.some(
            (record) => record.status === 'compensated',
          )
            ? 'completed'
            : 'not_available',
          manualReconciliationRequired: true,
        }
      : null,
    nextActions: allSucceeded
      ? []
      : ['Reconcile failed operations manually; no automatic compensation or retry was attempted.'],
  });
}

function reservationsFor(plan) {
  return plan.operations.map((operation) => ({
    key: operation.idempotencyKey,
    planHash: plan.planHash,
    operationId: operation.operationId,
  }));
}

async function revalidatePreconditions(plan, verifier, currentTime) {
  for (const precondition of plan.preconditions) {
    if (precondition.status !== 'satisfied') {
      throw new RouterError('PRECONDITION_FAILED');
    }
    if (
      precondition.validUntil !== null &&
      Date.parse(precondition.validUntil) <= currentTime
    ) {
      throw new RouterError('PRECONDITION_FAILED', {
        publicMessage: 'A required operation precondition has expired.',
      });
    }
    if (typeof verifier !== 'function') {
      throw new RouterError('PRECONDITION_FAILED', {
        publicMessage: 'No read-only verifier is configured for the plan preconditions.',
      });
    }

    let observation;
    try {
      observation = await verifier(deepFrozenJsonClone(precondition), {
        planId: plan.planId,
        capabilityId: plan.capabilityId,
      });
      observation = deepFrozenJsonClone(observation);
    } catch (cause) {
      throw new RouterError('PRECONDITION_FAILED', { cause });
    }
    if (
      !isPlainObject(observation) ||
      Object.keys(observation).some(
        (key) => !['satisfied', 'version', 'hash'].includes(key),
      ) ||
      observation.satisfied !== true
    ) {
      throw new RouterError('PRECONDITION_FAILED');
    }
    if (
      (precondition.expectedVersion !== null &&
        observation.version !== precondition.expectedVersion) ||
      (precondition.expectedHash !== null &&
        observation.hash !== precondition.expectedHash)
    ) {
      throw new RouterError('PRECONDITION_DRIFT');
    }
  }
}

function staticWorkerMap(workers) {
  if (!(workers instanceof Map)) {
    throw new RouterError('WORKER_NOT_FOUND', {
      publicMessage: 'The static worker registry must be a Map.',
    });
  }
  const copy = new Map();
  for (const [capabilityId, worker] of workers) {
    if (
      typeof capabilityId !== 'string' ||
      !isPlainObject(worker) ||
      typeof worker.execute !== 'function' ||
      typeof worker.version !== 'string' ||
      !SEMVER_PATTERN.test(worker.version)
    ) {
      throw new RouterError('WORKER_NOT_FOUND', {
        publicMessage: 'A static worker registration is invalid.',
      });
    }
    copy.set(capabilityId, Object.freeze({ ...worker }));
  }
  return copy;
}

export function createPolicyKernel({
  workers = new Map(),
  idempotencyStore = new InMemoryIdempotencyStore(),
  preconditionVerifier = null,
  clock = () => new Date(),
  audit = () => {},
} = {}) {
  const workerMap = staticWorkerMap(workers);

  const emit = (event) => {
    try {
      audit(deepFrozenJsonClone(event));
    } catch {
      // Telemetry must not change the enforcement outcome.
    }
  };

  return Object.freeze({
    async enforce({ plan, approval = null, registry }) {
      validateOperationPlan(plan);
      const completedAtForFailure = () => clockIso(clock);
      let currentIso;
      try {
        currentIso = clockIso(clock);
        const currentTime = Date.parse(currentIso);
        verifyOperationPlanHash(plan);
        if (
          plan.registryVersion !== registry?.registryVersion ||
          plan.policyVersion !== registry?.policyVersion
        ) {
          throw new RouterError('POLICY_VERSION_MISMATCH');
        }
        const policy = evaluatePlanPolicy({ plan, registry });
        if (canonicalJson(policy.risk) !== canonicalJson(plan.risk)) {
          throw new RouterError('POLICY_VERSION_MISMATCH', {
            publicMessage: 'The plan risk no longer matches the current policy.',
          });
        }
        if (policy.decision === 'deny') throw new RouterError('POLICY_DENIED');
        if (plan.mode !== 'apply' || policy.decision !== 'require_approval') {
          throw new RouterError('POLICY_DENIED', {
            publicMessage: 'The write enforcement kernel accepts only guarded apply plans.',
          });
        }
        if (Date.parse(plan.expiresAt) <= currentTime) {
          throw new RouterError('APPROVAL_EXPIRED', {
            publicMessage: 'The operation plan has expired.',
          });
        }
        validatePlanBoundApproval({ plan, approval, now: currentIso });
        await revalidatePreconditions(
          plan,
          preconditionVerifier,
          currentTime,
        );

        const worker = workerMap.get(plan.capabilityId);
        if (!worker) throw new RouterError('WORKER_NOT_FOUND');
        const reservations = reservationsFor(plan);
        const reservation = await idempotencyStore.reserveBatch(reservations);
        if (reservation.kind === 'replay') {
          validatePolicyOperationResult(reservation.result);
          emit({
            event: 'policy_execution_replayed',
            planId: plan.planId,
            planHash: plan.planHash,
            capabilityId: plan.capabilityId,
          });
          return reservation.result;
        }

        emit({
          event: 'policy_worker_invocation_started',
          planId: plan.planId,
          planHash: plan.planHash,
          capabilityId: plan.capabilityId,
          workerVersion: worker.version,
        });
        let result;
        try {
          const rawOutput = await worker.execute({
            plan,
            approval,
          });
          const output = assertWorkerOutput(rawOutput, plan, worker.version);
          result = executionResult(plan, approval, output, clockIso(clock));
          await idempotencyStore.completeBatch(reservations, result);
        } catch (cause) {
          await idempotencyStore.markUnknownBatch(reservations).catch(() => {});
          emit({
            event: 'policy_worker_outcome_unknown',
            planId: plan.planId,
            planHash: plan.planHash,
            capabilityId: plan.capabilityId,
            workerVersion: worker.version,
          });
          return unknownOutcomeResult(
            plan,
            approval,
            worker.version,
            clockIso(clock),
          );
        }

        emit({
          event: 'policy_worker_invocation_completed',
          planId: plan.planId,
          planHash: plan.planHash,
          capabilityId: plan.capabilityId,
          workerVersion: worker.version,
          status: result.status,
        });
        return result;
      } catch (cause) {
        const error = asRouterError(cause, {
          code: 'EXECUTION_FAILED',
          outcome: 'blocked',
        });
        emit({
          event: 'policy_execution_blocked',
          planId: plan.planId,
          planHash: plan.planHash,
          capabilityId: plan.capabilityId,
          code: error.code,
        });
        return blockedResult(plan, error, completedAtForFailure());
      }
    },
  });
}

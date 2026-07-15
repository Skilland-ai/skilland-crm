import { RouterError } from '../errors.mjs';
import {
  OPERATION_ENVELOPE_SCHEMA,
  OPERATION_ENVELOPE_VERSION,
  REPO_ID,
  isPlainObject,
  validateOperationPlan,
} from '../validation.mjs';
import {
  OPERATION_PLAN_HASH_DOMAIN,
  canonicalJson,
  constantTimeHashEqual,
  deepFrozenJsonClone,
  sha256Canonical,
} from './canonical-json.mjs';
import { evaluatePlanPolicy } from './policy.mjs';

const PLAN_DRAFT_KEYS = [
  '$schema',
  'schemaVersion',
  'kind',
  'requestId',
  'correlationId',
  'repoId',
  'capabilityId',
  'requester',
  'environment',
  'mode',
  'createdAt',
  'planId',
  'operations',
  'preconditions',
  'scopeLimits',
  'expiresAt',
];

function invalidDraft(message = 'The operation plan draft is invalid.') {
  throw new RouterError('INVALID_PLAN', {
    publicMessage: message,
    outcome: 'blocked',
  });
}

export function validatePlanDraft(value, registry) {
  if (!isPlainObject(value)) invalidDraft();
  const keys = Object.keys(value);
  if (
    keys.length !== PLAN_DRAFT_KEYS.length ||
    PLAN_DRAFT_KEYS.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !PLAN_DRAFT_KEYS.includes(key))
  ) {
    invalidDraft(
      'PlanDraft must have the exact planner-owned shape and cannot assign risk, versions, or hash.',
    );
  }

  const draft = deepFrozenJsonClone(value);
  const policy = evaluatePlanPolicy({ plan: draft, registry });
  const probe = {
    ...draft,
    planHash: `sha256:${'0'.repeat(64)}`,
    registryVersion: registry?.registryVersion,
    policyVersion: registry?.policyVersion,
    risk: policy.risk,
  };
  validateOperationPlan(probe);
  if (
    draft.$schema !== OPERATION_ENVELOPE_SCHEMA ||
    draft.schemaVersion !== OPERATION_ENVELOPE_VERSION ||
    draft.kind !== 'operation_plan' ||
    draft.repoId !== REPO_ID
  ) {
    invalidDraft();
  }
  return draft;
}

export function operationPlanHashProjection(plan) {
  if (!isPlainObject(plan)) invalidDraft();
  canonicalJson(plan);
  const projection = {};
  for (const key of Object.keys(plan)) {
    if (key !== 'planHash') projection[key] = plan[key];
  }
  return projection;
}

export function computeOperationPlanHash(plan) {
  return sha256Canonical(
    operationPlanHashProjection(plan),
    OPERATION_PLAN_HASH_DOMAIN,
  );
}

export function verifyOperationPlanHash(plan) {
  const computed = computeOperationPlanHash(plan);
  if (!constantTimeHashEqual(plan?.planHash, computed)) {
    throw new RouterError('PLAN_HASH_MISMATCH');
  }
  return true;
}

export function finalizeOperationPlan({ draft, registry }) {
  const safeDraft = validatePlanDraft(draft, registry);
  const policy = evaluatePlanPolicy({ plan: safeDraft, registry });
  const withoutHash = {
    ...safeDraft,
    registryVersion: registry.registryVersion,
    policyVersion: registry.policyVersion,
    risk: policy.risk,
  };
  const plan = {
    ...withoutHash,
    planHash: computeOperationPlanHash(withoutHash),
  };
  validateOperationPlan(plan);
  verifyOperationPlanHash(plan);
  return deepFrozenJsonClone(plan);
}

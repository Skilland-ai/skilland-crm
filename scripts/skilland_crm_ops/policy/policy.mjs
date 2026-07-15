import { deepFrozenJsonClone } from './canonical-json.mjs';
import { isScopeContained, operationsFitScope } from './scope.mjs';

const TIER_RANK = new Map([
  ['none', 0],
  ['operator', 1],
  ['owner', 2],
  ['two_stage', 3],
  ['denied', 4],
]);

const DENIED_EFFECTS = new Set([
  'destructive',
  'metadata_write',
  'workflow_change',
]);

function moreRestrictiveTier(current, candidate) {
  return (TIER_RANK.get(candidate) ?? 4) > (TIER_RANK.get(current) ?? 4)
    ? candidate
    : current;
}

function pushUnique(values, value) {
  if (!values.includes(value)) values.push(value);
}

function readinessAllowsMode(readiness, mode) {
  if (mode === 'read_only') {
    return ['read_only', 'dry_run', 'apply_guarded'].includes(readiness);
  }
  if (mode === 'dry_run') return ['dry_run', 'apply_guarded'].includes(readiness);
  if (mode === 'apply') return readiness === 'apply_guarded';
  return false;
}

function unionOperationEffects(planLike) {
  if (!Array.isArray(planLike?.operations)) return [];
  return [
    ...new Set(
      planLike.operations.flatMap((operation) =>
        Array.isArray(operation?.expectedEffects)
          ? operation.expectedEffects.filter((effect) => typeof effect === 'string')
          : [],
      ),
    ),
  ].sort();
}

function deniedRisk(planLike, rationale, effects) {
  return {
    effects,
    domainSpan: 'single_domain',
    dataClasses: ['internal'],
    reversibility: 'irreversible',
    approvalTier: 'denied',
    rationale,
  };
}

export function findCanonicalCapability(registry, capabilityId) {
  if (!Array.isArray(registry?.capabilities)) return null;
  return (
    registry.capabilities.find((capability) => capability.id === capabilityId) ??
    null
  );
}

export function evaluatePlanPolicy({ plan, registry }) {
  const rationale = [];
  const effects = unionOperationEffects(plan);
  const capability = findCanonicalCapability(registry, plan?.capabilityId);

  if (!capability) {
    pushUnique(rationale, 'CAPABILITY_UNKNOWN');
    return deepFrozenJsonClone({
      decision: 'deny',
      capability: null,
      risk: deniedRisk(plan, rationale, effects),
    });
  }

  let denied = false;
  let approvalTier = TIER_RANK.has(capability.approvalTier)
    ? capability.approvalTier
    : 'denied';

  const deny = (reason) => {
    denied = true;
    pushUnique(rationale, reason);
  };

  if (capability.routingExposure !== 'public') deny('CAPABILITY_NOT_PUBLIC');
  if (capability.lifecycleStatus !== 'active') deny('CAPABILITY_NOT_ACTIVE');
  if (!readinessAllowsMode(capability.frontDoorReadiness, plan?.mode)) {
    deny('FRONT_DOOR_MODE_NOT_READY');
  }
  if (!Array.isArray(capability.supportedModes) || !capability.supportedModes.includes(plan?.mode)) {
    deny('MODE_NOT_SUPPORTED');
  }
  if (
    !Array.isArray(capability.environmentAllowlist) ||
    !capability.environmentAllowlist.includes(plan?.environment?.name)
  ) {
    deny('ENVIRONMENT_NOT_ALLOWED');
  }
  if (!isScopeContained(plan?.scopeLimits, capability.scopeLimits)) {
    deny('SCOPE_OUTSIDE_CAPABILITY');
  }
  if (!operationsFitScope(plan?.operations, plan?.scopeLimits)) {
    deny('OPERATION_SCOPE_OR_TARGET_MISMATCH');
  }
  if (effects.some((effect) => !capability.effects?.includes(effect))) {
    deny('EFFECT_OUTSIDE_CAPABILITY');
  }
  if (plan?.mode === 'read_only' && effects.length > 0) {
    deny('READ_ONLY_EFFECTS_FORBIDDEN');
  }

  if (effects.includes('crm_write')) {
    approvalTier = moreRestrictiveTier(approvalTier, 'operator');
    pushUnique(rationale, 'CRM_WRITE_MIN_OPERATOR');
  }
  if (effects.includes('external_draft')) {
    approvalTier = moreRestrictiveTier(approvalTier, 'owner');
    pushUnique(rationale, 'EXTERNAL_DRAFT_MIN_OWNER');
    if (capability.domainSpan !== 'cross_domain') {
      deny('EXTERNAL_DRAFT_REQUIRES_CROSS_DOMAIN');
    }
  }
  if (
    effects.includes('erp_write') ||
    effects.includes('external_send') ||
    (capability.domainSpan === 'cross_domain' && effects.includes('crm_write'))
  ) {
    approvalTier = moreRestrictiveTier(approvalTier, 'two_stage');
    pushUnique(rationale, 'HIGH_IMPACT_MIN_TWO_STAGE');
  }
  if (capability.dataClasses?.includes('pii') && effects.includes('crm_write')) {
    approvalTier = moreRestrictiveTier(approvalTier, 'owner');
    pushUnique(rationale, 'PII_CRM_WRITE_MIN_OWNER');
  }
  if (
    capability.dataClasses?.includes('pii') &&
    effects.includes('external_draft')
  ) {
    approvalTier = moreRestrictiveTier(approvalTier, 'two_stage');
    pushUnique(rationale, 'PII_EXTERNAL_DRAFT_MIN_TWO_STAGE');
  }
  if (effects.some((effect) => DENIED_EFFECTS.has(effect))) {
    deny('EFFECT_CLASS_DENIED');
  }
  if (
    effects.includes('local_write') &&
    capability.dataClasses?.includes('pii') &&
    plan?.environment?.name !== 'test'
  ) {
    deny('RETENTION_ENFORCEMENT_REQUIRED');
  }
  if (plan?.mode === 'apply' && effects.length === 0) {
    deny('APPLY_REQUIRES_DECLARED_EFFECT');
  }
  if (plan?.mode === 'apply' && approvalTier === 'none') {
    approvalTier = 'operator';
    pushUnique(rationale, 'APPLY_MIN_OPERATOR');
  }
  if (approvalTier === 'denied') deny('APPROVAL_TIER_DENIED');

  if (denied) approvalTier = 'denied';
  const decision = denied
    ? 'deny'
    : plan.mode === 'apply'
      ? 'require_approval'
      : 'allow';
  pushUnique(
    rationale,
    decision === 'deny'
      ? 'POLICY_DENY'
      : decision === 'require_approval'
        ? 'POLICY_APPROVAL_REQUIRED'
        : 'POLICY_ALLOW_MODE',
  );

  return deepFrozenJsonClone({
    decision,
    capability: {
      id: capability.id,
      frontDoorReadiness: capability.frontDoorReadiness,
    },
    risk: {
      effects,
      domainSpan: capability.domainSpan,
      dataClasses: [...capability.dataClasses].sort(),
      reversibility: capability.reversibility,
      approvalTier,
      rationale,
    },
  });
}

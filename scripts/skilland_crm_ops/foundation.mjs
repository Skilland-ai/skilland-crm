import fs from 'node:fs/promises';
import path from 'node:path';

import { RouterError } from './errors.mjs';
import {
  REPO_HANDOFF_SCHEMA,
  REPO_HANDOFF_VERSION,
  REPO_ID,
  isCapabilityId,
  isPlainObject,
  validateScopeLimits,
} from './validation.mjs';

export const MANIFEST_RELATIVE_PATH =
  'shared/contracts/skilland-crm-ops/repo-manifest.json';
export const REGISTRY_RELATIVE_PATH =
  'shared/contracts/skilland-crm-ops/capability-registry.json';

const MANIFEST_SCHEMA =
  'https://schemas.skilland.ai/skilland-crm-ops/v1/repo-manifest.schema.json';
const REGISTRY_SCHEMA =
  'https://schemas.skilland.ai/skilland-crm-ops/v1/capability-registry.schema.json';
const SEMVER_V1_PATTERN =
  /^1\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const MAX_FOUNDATION_BYTES = 2 * 1024 * 1024;
const MANIFEST_ID_PATTERN = /^[a-z][a-z0-9_.-]*$/;
const DOMAIN_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;
const MEDIA_TYPE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EXPLICIT_MODE_FALLBACK_RULE =
  'Every operation envelope must declare mode explicitly; dryRunDefault is a future planning posture and never coerces or defaults a missing mode.';

const MODES = ['read_only', 'dry_run', 'apply'];
const DATA_CLASSES = ['internal', 'commercial', 'pii', 'accounting'];
const EFFECTS = [
  'local_write',
  'crm_write',
  'erp_write',
  'metadata_write',
  'workflow_change',
  'external_draft',
  'external_send',
  'destructive',
];
const READINESS_VALUES = [
  'unknown',
  'not_implemented',
  'read_only',
  'dry_run',
  'apply_guarded',
  'denied',
];
const FRONT_DOOR_READINESS_VALUES = READINESS_VALUES.filter(
  (value) => value !== 'unknown',
);
const INTERNAL_CAPABILITY_IDS = new Set([
  'crm.metadata.read',
  'crm.schema.introspect',
  'crm.plan.validate',
  'crm.execution.apply',
  'aikount.openapi.live',
  'aikount.execution.apply',
  'bridge.crm_aikount.context',
  'bridge.crm_aikount.writeback.plan',
]);

function foundationInvalid(cause) {
  throw new RouterError('FOUNDATION_INVALID', {
    cause,
    publicMessage: 'The local routing foundation is invalid.',
    outcome: 'blocked',
  });
}

function requireCondition(condition) {
  if (!condition) foundationInvalid();
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

function isUniqueStringArray(value, allowed = null) {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isNonEmptyString(item) && (allowed === null || allowed.includes(item)),
    ) &&
    new Set(value).size === value.length
  );
}

function isString(value) {
  return typeof value === 'string';
}

function isBoolean(value) {
  return typeof value === 'boolean';
}

function isDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`;
  }
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hasUniqueItems(value) {
  return (
    Array.isArray(value) &&
    new Set(value.map((item) => stableSerialize(item))).size === value.length
  );
}

function isExactArray(value, expected) {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item, index) => item === expected[index])
  );
}

function hasOnlyKeys(value, required, optional = []) {
  if (!isPlainObject(value)) return false;
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  );
}

async function readFixedJson(rootDir, relativePath) {
  const absoluteRoot = path.resolve(rootDir);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  if (
    absolutePath !== absoluteRoot &&
    !absolutePath.startsWith(`${absoluteRoot}${path.sep}`)
  ) {
    foundationInvalid();
  }

  let handle;
  try {
    handle = await fs.open(absolutePath, 'r');
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < 2 || stat.size > MAX_FOUNDATION_BYTES) {
      foundationInvalid();
    }
    const text = await handle.readFile({ encoding: 'utf8' });
    if (Buffer.byteLength(text, 'utf8') > MAX_FOUNDATION_BYTES) {
      foundationInvalid();
    }
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof RouterError) throw error;
    foundationInvalid(error);
  } finally {
    await handle?.close().catch(() => {});
  }
}

export function validateRepoManifest(manifest) {
  const required = [
    '$schema',
    'schemaVersion',
    'repoId',
    'displayName',
    'role',
    'scope',
    'globalControlPlane',
    'localFrontDoor',
    'domains',
    'sensitivity',
    'supportedModes',
    'entrypoints',
    'capabilityRegistry',
    'canonicalKnowledge',
    'operability',
    'outputs',
    'fallbackPolicy',
    'lastVerifiedAt',
  ];
  requireCondition(hasOnlyKeys(manifest, required));
  requireCondition(manifest.$schema === MANIFEST_SCHEMA);
  requireCondition(manifest.schemaVersion === '1.0.0');
  requireCondition(manifest.repoId === REPO_ID);
  requireCondition(manifest.role === 'domain_subharness');
  requireCondition(isNonEmptyString(manifest.displayName));
  requireCondition(isDate(manifest.lastVerifiedAt));

  requireCondition(
    hasOnlyKeys(manifest.scope, ['owns', 'doesNotOwn', 'localBoundary']),
  );
  requireCondition(
    isUniqueStringArray(manifest.scope.owns) && manifest.scope.owns.length > 0,
  );
  requireCondition(
    isUniqueStringArray(manifest.scope.doesNotOwn) &&
      manifest.scope.doesNotOwn.length > 0,
  );
  requireCondition(isNonEmptyString(manifest.scope.localBoundary));

  const controlPlane = manifest.globalControlPlane;
  requireCondition(
    hasOnlyKeys(controlPlane, [
      'name',
      'repository',
      'responsibilities',
      'handoffContract',
    ]),
  );
  requireCondition(isNonEmptyString(controlPlane.name));
  requireCondition(isNonEmptyString(controlPlane.repository));
  requireCondition(
    isUniqueStringArray(controlPlane.responsibilities) &&
      controlPlane.responsibilities.length > 0,
  );
  requireCondition(
    hasOnlyKeys(
      controlPlane.handoffContract,
      ['path', 'schemaId', 'schemaVersion', 'contractStatus', 'authority'],
    ),
  );
  requireCondition(
    controlPlane.handoffContract.path ===
      'shared/contracts/skilland-crm-ops/repo-handoff.schema.json' &&
      controlPlane.handoffContract.schemaId === REPO_HANDOFF_SCHEMA &&
      controlPlane.handoffContract.schemaVersion === REPO_HANDOFF_VERSION &&
      controlPlane.handoffContract.contractStatus === 'provisional_local' &&
      controlPlane.handoffContract.authority === 'skilland-crm-local',
  );

  requireCondition(
    hasOnlyKeys(manifest.localFrontDoor, [
      'name',
      'namespace',
      'status',
      'responsibilities',
      'forbiddenResponsibilities',
    ]),
  );
  requireCondition(manifest.localFrontDoor.name === 'Skilland CRM Ops');
  requireCondition(manifest.localFrontDoor.namespace === 'skilland-crm.ops');
  requireCondition(manifest.localFrontDoor.status === 'available');
  requireCondition(
    isUniqueStringArray(manifest.localFrontDoor.responsibilities) &&
      manifest.localFrontDoor.responsibilities.length > 0,
  );
  requireCondition(
    isUniqueStringArray(manifest.localFrontDoor.forbiddenResponsibilities) &&
      manifest.localFrontDoor.forbiddenResponsibilities.length > 0,
  );

  requireCondition(
    Array.isArray(manifest.domains) &&
      manifest.domains.length > 0 &&
      hasUniqueItems(manifest.domains),
  );
  for (const domain of manifest.domains) {
    requireCondition(hasOnlyKeys(domain, ['id', 'role', 'systemOfRecord']));
    requireCondition(
      typeof domain.id === 'string' && DOMAIN_ID_PATTERN.test(domain.id),
    );
    requireCondition(isNonEmptyString(domain.role));
    requireCondition(isNonEmptyString(domain.systemOfRecord));
  }
  requireCondition(
    new Set(manifest.domains.map((domain) => domain.id)).size ===
      manifest.domains.length,
  );

  const sensitivity = manifest.sensitivity;
  requireCondition(
    hasOnlyKeys(sensitivity, [
      'dataClasses',
      'ambiguousEnvironmentRiskAssumption',
      'executionRequiresExplicitEnvironment',
      'secretPolicy',
    ]),
  );
  requireCondition(
    isUniqueStringArray(sensitivity.dataClasses, DATA_CLASSES) &&
      sensitivity.dataClasses.length > 0,
  );
  requireCondition(sensitivity.ambiguousEnvironmentRiskAssumption === 'production');
  requireCondition(sensitivity.executionRequiresExplicitEnvironment === true);
  requireCondition(isNonEmptyString(sensitivity.secretPolicy));

  requireCondition(
    isUniqueStringArray(manifest.supportedModes, MODES) &&
      manifest.supportedModes.length > 0,
  );
  requireCondition(manifest.supportedModes.includes('read_only'));
  requireCondition(manifest.supportedModes.includes('dry_run'));

  requireCondition(Array.isArray(manifest.entrypoints));
  for (const entrypoint of manifest.entrypoints) {
    requireCondition(
      hasOnlyKeys(entrypoint, [
        'id',
        'command',
        'surfaceRole',
        'status',
        'supportedModes',
        'capabilityIds',
      ]),
    );
    requireCondition(
      typeof entrypoint.id === 'string' &&
        MANIFEST_ID_PATTERN.test(entrypoint.id),
    );
    requireCondition(isNonEmptyString(entrypoint.command));
    requireCondition(
      ['compatibility', 'local_front_door'].includes(entrypoint.surfaceRole),
    );
    requireCondition(
      ['current', 'legacy', 'planned', 'blocked'].includes(entrypoint.status),
    );
    requireCondition(
      isUniqueStringArray(entrypoint.supportedModes, MODES) &&
        entrypoint.supportedModes.length > 0,
    );
    requireCondition(
      isUniqueStringArray(entrypoint.capabilityIds) &&
        entrypoint.capabilityIds.length > 0 &&
        entrypoint.capabilityIds.every((id) => MANIFEST_ID_PATTERN.test(id)),
    );
  }
  requireCondition(
    new Set(manifest.entrypoints.map((entrypoint) => entrypoint.id)).size ===
      manifest.entrypoints.length,
  );
  requireCondition(
    manifest.entrypoints.filter(
      (entrypoint) => entrypoint.surfaceRole === 'local_front_door',
    ).length === 1,
  );
  const localEntrypoints = manifest.entrypoints.filter(
    (entrypoint) => entrypoint?.id === 'crm.ops',
  );
  requireCondition(localEntrypoints.length === 1);
  const localEntrypoint = localEntrypoints[0];
  requireCondition(localEntrypoint.surfaceRole === 'local_front_door');
  requireCondition(localEntrypoint.status === 'current');
  requireCondition(localEntrypoint.command === 'yarn crm:ops');
  requireCondition(isExactArray(localEntrypoint.supportedModes, ['read_only']));
  requireCondition(
    isExactArray(localEntrypoint.capabilityIds, ['report.crm.export']),
  );

  const registryRef = manifest.capabilityRegistry;
  requireCondition(
    hasOnlyKeys(registryRef, [
      'path',
      'schemaPath',
      'canonicalCount',
      'legacyResolvableIdCount',
      'aliasResolution',
    ]),
  );
  requireCondition(registryRef.path === REGISTRY_RELATIVE_PATH);
  requireCondition(
    registryRef.schemaPath ===
      'shared/contracts/skilland-crm-ops/capability-registry.schema.json',
  );
  requireCondition(registryRef.canonicalCount === 38);
  requireCondition(registryRef.legacyResolvableIdCount === 39);
  requireCondition(isNonEmptyString(registryRef.aliasResolution));

  requireCondition(
    isUniqueStringArray(manifest.canonicalKnowledge) &&
      manifest.canonicalKnowledge.length > 0,
  );

  const operability = manifest.operability;
  requireCondition(
    hasOnlyKeys(operability, [
      'localFrontDoorImplemented',
      'dryRunDefault',
      'localFrontDoorProductionWritesEnabled',
      'legacyApplyEntrypointsPresent',
      'externalCallsDuringPhase006',
      'externalCallsDuringGate007Validation',
      'sideEffectExecutor',
    ]),
  );
  requireCondition(operability.localFrontDoorImplemented === true);
  requireCondition(operability.dryRunDefault === true);
  requireCondition(operability.localFrontDoorProductionWritesEnabled === false);
  requireCondition(isBoolean(operability.legacyApplyEntrypointsPresent));
  requireCondition(operability.externalCallsDuringPhase006 === false);
  requireCondition(operability.externalCallsDuringGate007Validation === false);
  requireCondition(operability.sideEffectExecutor === 'deterministic_worker');

  requireCondition(Array.isArray(manifest.outputs));
  for (const output of manifest.outputs) {
    requireCondition(
      hasOnlyKeys(output, [
        'id',
        'path',
        'mediaTypes',
        'mutatesExternalSystems',
      ]),
    );
    requireCondition(
      typeof output.id === 'string' && MANIFEST_ID_PATTERN.test(output.id),
    );
    requireCondition(isNonEmptyString(output.path));
    requireCondition(
      isUniqueStringArray(output.mediaTypes) &&
        output.mediaTypes.length > 0 &&
        output.mediaTypes.every((mediaType) => MEDIA_TYPE_PATTERN.test(mediaType)),
    );
    requireCondition(output.mutatesExternalSystems === false);
  }
  requireCondition(
    new Set(manifest.outputs.map((output) => output.id)).size ===
      manifest.outputs.length,
  );

  const fallback = manifest.fallbackPolicy;
  requireCondition(
    hasOnlyKeys(fallback, [
      'failClosed',
      'unknownCapability',
      'ambiguousEnvironment',
      'missingMode',
      'missingApproval',
      'missingAdapterOrCapability',
      'rules',
    ]),
  );
  requireCondition(fallback.failClosed === true);
  requireCondition(fallback.unknownCapability === 'deny');
  requireCondition(fallback.ambiguousEnvironment === 'deny');
  requireCondition(fallback.missingMode === 'deny');
  requireCondition(fallback.missingApproval === 'deny');
  requireCondition(
    fallback.missingAdapterOrCapability ===
      'deny_direct_api_or_database_fallback',
  );
  requireCondition(
    isUniqueStringArray(fallback.rules) && fallback.rules.length > 0,
  );
  requireCondition(fallback.rules.includes(EXPLICIT_MODE_FALLBACK_RULE));

  return manifest;
}

function validateRegistryScope(scope) {
  const required = [
    'maxRecords',
    'maxDocuments',
    'maxRecipients',
    'maxLocalArtifacts',
    'allowExternalSend',
    'allowMetadataMutation',
    'allowDestructive',
    'allowWorkflowActivation',
  ];
  const optional = [
    'localPathPrefixes',
    'allowOverwrite',
    'maxArtifactBytes',
  ];
  requireCondition(hasOnlyKeys(scope, required, optional));
  try {
    validateScopeLimits(scope, 'FOUNDATION_INVALID');
  } catch (error) {
    foundationInvalid(error);
  }
  if (Object.hasOwn(scope, 'localPathPrefixes')) {
    requireCondition(
      Array.isArray(scope.localPathPrefixes) &&
        scope.localPathPrefixes.length > 0,
    );
  }
  if (Object.hasOwn(scope, 'allowOverwrite')) {
    requireCondition(isBoolean(scope.allowOverwrite));
  }
  if (Object.hasOwn(scope, 'maxArtifactBytes')) {
    requireCondition(
      Number.isSafeInteger(scope.maxArtifactBytes) &&
        scope.maxArtifactBytes >= 1,
    );
  }
  requireCondition(scope.allowMetadataMutation === false);
  requireCondition(scope.allowDestructive === false);
  requireCondition(scope.allowWorkflowActivation === false);
}

function validateEvidence(evidence) {
  requireCondition(
    hasOnlyKeys(evidence, ['type', 'path', 'verifiedAt', 'claim']),
  );
  requireCondition(
    [
      'source_inspection',
      'documentation',
      'automated_test',
      'integration_test',
      'live_verification',
    ].includes(evidence.type),
  );
  requireCondition(isNonEmptyString(evidence.path));
  requireCondition(evidence.verifiedAt === null || isDate(evidence.verifiedAt));
  requireCondition(isNonEmptyString(evidence.claim));
}

function validateContractReference(contractReference) {
  requireCondition(
    hasOnlyKeys(contractReference, ['target', 'current']),
  );
  requireCondition(isNonEmptyString(contractReference.target));
  requireCondition(isUniqueStringArray(contractReference.current));
}

function validateCapability(capability) {
  const required = [
    'id',
    'domain',
    'ownerComponent',
    'routingExposure',
    'lifecycleStatus',
    'semanticMaturity',
    'runtimeReadiness',
    'frontDoorReadiness',
    'testLevel',
    'evidence',
    'supportedModes',
    'effects',
    'domainSpan',
    'dataClasses',
    'reversibility',
    'approvalTier',
    'environmentAllowlist',
    'scopeLimits',
    'currentEntrypoints',
    'inputContract',
    'outputContract',
    'lastVerifiedAt',
    'aliases',
    'deprecatedBy',
    'notes',
  ];
  requireCondition(hasOnlyKeys(capability, required));
  requireCondition(isCapabilityId(capability.id));
  requireCondition(
    ['crm', 'aikount', 'crm_aikount_bridge', 'ia_mujeres_campaign', 'reporting'].includes(
      capability.domain,
    ),
  );
  requireCondition(
    [
      'crm-core',
      'crm-metadata-admin',
      'twenty-workflows',
      'crm-conversation',
      'aikount-erp',
      'crm-aikount-bridge',
      'ia-mujeres-campaign',
      'reporting',
    ].includes(capability.ownerComponent),
  );
  requireCondition(
    ['public', 'internal', 'legacy_only'].includes(capability.routingExposure),
  );
  requireCondition(
    ['active', 'planned', 'deprecated', 'blocked'].includes(
      capability.lifecycleStatus,
    ),
  );
  requireCondition(
    ['unknown', 'experimental', 'partial', 'stable'].includes(
      capability.semanticMaturity,
    ),
  );
  requireCondition(READINESS_VALUES.includes(capability.runtimeReadiness));
  requireCondition(
    FRONT_DOOR_READINESS_VALUES.includes(capability.frontDoorReadiness),
  );
  requireCondition(
    ['unknown', 'none', 'unit', 'integration', 'live'].includes(
      capability.testLevel,
    ),
  );
  requireCondition(Array.isArray(capability.evidence));
  for (const evidence of capability.evidence) validateEvidence(evidence);
  requireCondition(
    isUniqueStringArray(capability.supportedModes, MODES) &&
      capability.supportedModes.length > 0,
  );
  requireCondition(isUniqueStringArray(capability.effects, EFFECTS));
  requireCondition(
    ['single_domain', 'cross_domain'].includes(capability.domainSpan),
  );
  requireCondition(
    isUniqueStringArray(capability.dataClasses, DATA_CLASSES) &&
      capability.dataClasses.length > 0,
  );
  requireCondition(
    ['reversible', 'compensatable', 'irreversible'].includes(
      capability.reversibility,
    ),
  );
  requireCondition(
    ['none', 'operator', 'owner', 'two_stage', 'denied'].includes(
      capability.approvalTier,
    ),
  );
  requireCondition(
    isUniqueStringArray(capability.environmentAllowlist, [
      'test',
      'sandbox',
      'production',
    ]) && capability.environmentAllowlist.length > 0,
  );
  requireCondition(
    Array.isArray(capability.aliases) &&
      capability.aliases.every(isCapabilityId) &&
      new Set(capability.aliases).size === capability.aliases.length,
  );
  validateRegistryScope(capability.scopeLimits);
  requireCondition(isUniqueStringArray(capability.currentEntrypoints));
  validateContractReference(capability.inputContract);
  validateContractReference(capability.outputContract);
  requireCondition(
    capability.lastVerifiedAt === null || isDate(capability.lastVerifiedAt),
  );
  requireCondition(
    capability.deprecatedBy === null ||
      isCapabilityId(capability.deprecatedBy),
  );
  requireCondition(isString(capability.notes));

  if (capability.semanticMaturity === 'stable') {
    requireCondition(capability.evidence.length > 0);
    requireCondition(['unit', 'integration', 'live'].includes(capability.testLevel));
    requireCondition(isDate(capability.lastVerifiedAt));
  }
  if (capability.lifecycleStatus === 'blocked') {
    requireCondition(capability.approvalTier === 'denied');
    requireCondition(capability.frontDoorReadiness === 'denied');
  }
  if (capability.lifecycleStatus === 'deprecated') {
    requireCondition(typeof capability.deprecatedBy === 'string');
  }
  if (INTERNAL_CAPABILITY_IDS.has(capability.id)) {
    requireCondition(capability.routingExposure === 'internal');
  }
  if (capability.frontDoorReadiness === 'denied') {
    requireCondition(capability.approvalTier === 'denied');
  }

  const effects = new Set(capability.effects);
  if (effects.has('crm_write')) {
    requireCondition(
      ['operator', 'owner', 'two_stage', 'denied'].includes(
        capability.approvalTier,
      ),
    );
  }
  if (effects.has('external_draft')) {
    requireCondition(
      ['owner', 'two_stage', 'denied'].includes(capability.approvalTier),
    );
    requireCondition(capability.domainSpan === 'cross_domain');
  }
  for (const deniedEffect of [
    'destructive',
    'metadata_write',
    'workflow_change',
  ]) {
    if (effects.has(deniedEffect)) {
      requireCondition(capability.approvalTier === 'denied');
      requireCondition(capability.frontDoorReadiness === 'denied');
    }
  }
  if (effects.has('external_send')) {
    requireCondition(capability.approvalTier === 'two_stage');
    requireCondition(capability.domainSpan === 'cross_domain');
    requireCondition(capability.scopeLimits.allowExternalSend === true);
  }
  if (effects.has('erp_write')) {
    requireCondition(capability.approvalTier === 'two_stage');
  }
  if (
    capability.domainSpan === 'cross_domain' &&
    effects.has('crm_write')
  ) {
    requireCondition(capability.approvalTier === 'two_stage');
  }

  return capability;
}

export function validateCapabilityRegistry(registry) {
  const required = [
    '$schema',
    'schemaVersion',
    'registryVersion',
    'policyVersion',
    'registryId',
    'repoId',
    'canonicalCapabilityCount',
    'legacyResolvableIdCount',
    'policyDefaults',
    'capabilities',
  ];
  requireCondition(hasOnlyKeys(registry, required));
  requireCondition(registry.$schema === REGISTRY_SCHEMA);
  requireCondition(registry.schemaVersion === '1.0.0');
  requireCondition(SEMVER_V1_PATTERN.test(registry.registryVersion));
  requireCondition(SEMVER_V1_PATTERN.test(registry.policyVersion));
  requireCondition(registry.registryId === 'skilland-crm-ops.capabilities');
  requireCondition(registry.repoId === REPO_ID);
  requireCondition(
    registry.canonicalCapabilityCount === 38 &&
      registry.legacyResolvableIdCount === 39,
  );
  requireCondition(
    Array.isArray(registry.capabilities) && registry.capabilities.length === 38,
  );
  requireCondition(
    registry.canonicalCapabilityCount === registry.capabilities.length,
  );
  requireCondition(registry.canonicalCapabilityCount === 38);

  for (const capability of registry.capabilities) validateCapability(capability);
  const canonicalIds = registry.capabilities.map((capability) => capability.id);
  requireCondition(new Set(canonicalIds).size === canonicalIds.length);
  const canonicalIdSet = new Set(canonicalIds);
  const aliasOwners = new Map();
  const resolvableIds = new Set(canonicalIds);
  for (const capability of registry.capabilities) {
    for (const alias of capability.aliases) {
      requireCondition(!canonicalIdSet.has(alias));
      requireCondition(!aliasOwners.has(alias));
      aliasOwners.set(alias, capability.id);
      resolvableIds.add(alias);
    }
  }
  requireCondition(registry.legacyResolvableIdCount === resolvableIds.size);

  const defaults = registry.policyDefaults;
  requireCondition(
    hasOnlyKeys(defaults, [
      'unknownCapability',
      'unknownField',
      'ambiguousEnvironment',
      'destructive',
      'metadataMutation',
      'workflowActivation',
      'productionWriteRequiresPlanBoundApproval',
      'externalSendApprovalTier',
      'accountingEffectApprovalTier',
      'crossDomainCrmWritebackApprovalTier',
    ]),
  );
  requireCondition(defaults.unknownCapability === 'denied');
  requireCondition(defaults.unknownField === 'denied');
  requireCondition(defaults.ambiguousEnvironment === 'denied');
  requireCondition(defaults.destructive === 'denied');
  requireCondition(defaults.metadataMutation === 'denied');
  requireCondition(defaults.workflowActivation === 'denied');
  requireCondition(defaults.productionWriteRequiresPlanBoundApproval === true);
  requireCondition(defaults.externalSendApprovalTier === 'two_stage');
  requireCondition(defaults.accountingEffectApprovalTier === 'two_stage');
  requireCondition(defaults.crossDomainCrmWritebackApprovalTier === 'two_stage');

  const exportCapability = registry.capabilities.find(
    (capability) => capability.id === 'report.crm.export',
  );
  requireCondition(exportCapability?.routingExposure === 'public');
  requireCondition(exportCapability?.lifecycleStatus === 'active');
  requireCondition(exportCapability?.runtimeReadiness === 'read_only');
  requireCondition(exportCapability?.frontDoorReadiness === 'read_only');
  requireCondition(exportCapability?.testLevel === 'integration');
  requireCondition(
    Array.isArray(exportCapability?.evidence) &&
      exportCapability.evidence.length > 0 &&
      exportCapability.evidence.some(
        (entry) => entry.type === 'automated_test' && entry.verifiedAt !== null,
      ) &&
      exportCapability.evidence.some(
        (entry) => entry.type === 'integration_test' && entry.verifiedAt !== null,
      ),
  );
  requireCondition(isDate(exportCapability?.lastVerifiedAt));
  requireCondition(
    exportCapability.supportedModes.length === 1 &&
      exportCapability.supportedModes[0] === 'read_only',
  );
  requireCondition(isExactArray(exportCapability.effects, ['local_write']));
  requireCondition(exportCapability.approvalTier === 'none');
  requireCondition(
    isExactArray(exportCapability.environmentAllowlist, ['test']),
  );
  requireCondition(exportCapability.scopeLimits.maxRecords >= 1);
  requireCondition(exportCapability.scopeLimits.maxRecords <= 1000);
  requireCondition(exportCapability.scopeLimits.maxDocuments === 0);
  requireCondition(exportCapability.scopeLimits.maxRecipients === 0);
  requireCondition(exportCapability.scopeLimits.maxLocalArtifacts === 1);
  requireCondition(exportCapability.scopeLimits.allowExternalSend === false);
  requireCondition(
    Array.isArray(exportCapability.scopeLimits.localPathPrefixes) &&
      exportCapability.scopeLimits.localPathPrefixes.length === 1 &&
      exportCapability.scopeLimits.localPathPrefixes[0] ===
        '04_outputs/crm_manual_update_session',
  );
  requireCondition(exportCapability.scopeLimits.allowOverwrite === false);
  requireCondition(
    Number.isSafeInteger(exportCapability.scopeLimits.maxArtifactBytes) &&
      exportCapability.scopeLimits.maxArtifactBytes >= 1 &&
      exportCapability.scopeLimits.maxArtifactBytes <= 5 * 1024 * 1024,
  );
  requireCondition(
    isExactArray(exportCapability.aliases, ['crm.export.chatgpt']),
  );
  requireCondition(
    exportCapability.currentEntrypoints.includes('yarn crm:ops'),
  );
  requireCondition(
    exportCapability.inputContract.target ===
      './operation-envelope.schema.json#/$defs/OperationRequest' &&
      exportCapability.outputContract.target ===
        './operation-envelope.schema.json#/$defs/OperationResult',
  );
  requireCondition(
    exportCapability.inputContract.current.includes(
      'shared/contracts/skilland-crm-ops/repo-handoff.schema.json',
    ) &&
      exportCapability.inputContract.current.includes(
        'scripts/skilland_crm_ops/adapters/report-crm-export.mjs',
      ) &&
      exportCapability.outputContract.current.includes(
        'scripts/skilland_crm_ops/router.mjs',
      ),
  );
  for (const capability of registry.capabilities) {
    if (capability.id === 'report.crm.export') continue;
    requireCondition(
      ['not_implemented', 'denied'].includes(capability.frontDoorReadiness),
    );
  }

  return registry;
}

export function validateFoundation(manifest, registry) {
  validateRepoManifest(manifest);
  validateCapabilityRegistry(registry);
  requireCondition(
    manifest.capabilityRegistry.canonicalCount ===
      registry.canonicalCapabilityCount,
  );
  requireCondition(
    manifest.capabilityRegistry.legacyResolvableIdCount ===
      registry.legacyResolvableIdCount,
  );
  const capabilityIds = new Set(
    registry.capabilities.map((capability) => capability.id),
  );
  for (const entrypoint of manifest.entrypoints) {
    requireCondition(
      entrypoint.capabilityIds.every((capabilityId) =>
        capabilityIds.has(capabilityId),
      ),
    );
    requireCondition(
      entrypoint.supportedModes.every((mode) =>
        manifest.supportedModes.includes(mode),
      ),
    );
  }
  const exportOutput = manifest.outputs.find(
    (output) => output.id === 'report.crm.export.markdown',
  );
  requireCondition(
    exportOutput?.path === '04_outputs/crm_manual_update_session/*.md' &&
      exportOutput.mediaTypes.includes('text/markdown') &&
      exportOutput.mutatesExternalSystems === false,
  );
  return { manifest, registry };
}

export async function loadFoundation({ rootDir }) {
  if (!isNonEmptyString(rootDir)) foundationInvalid();
  try {
    const [manifest, registry] = await Promise.all([
      readFixedJson(rootDir, MANIFEST_RELATIVE_PATH),
      readFixedJson(rootDir, REGISTRY_RELATIVE_PATH),
    ]);
    return validateFoundation(manifest, registry);
  } catch (error) {
    if (error instanceof RouterError && error.code === 'FOUNDATION_INVALID') {
      throw error;
    }
    foundationInvalid(error);
  }
}

import path from 'node:path';

import { RouterError } from './errors.mjs';
import {
  containsSensitiveText,
  findSecretShapedKeyPath,
  findSensitiveTextPath,
} from './redaction.mjs';

export const OPERATION_ENVELOPE_SCHEMA =
  'https://schemas.skilland.ai/skilland-crm-ops/v1/operation-envelope.schema.json';
export const OPERATION_ENVELOPE_VERSION = '1.0.0';
export const REPO_HANDOFF_SCHEMA =
  'https://schemas.skilland.ai/skilland-crm-ops/v1/repo-handoff.schema.json';
export const REPO_HANDOFF_VERSION = '0.1.0';
export const REPO_ID = 'skilland-crm';

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_-]*_[A-Za-z0-9_-]+$/;
const CAPABILITY_PATTERN = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;
const ISSUE_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SEMVER_V1_PATTERN =
  /^1\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const HASH_PATTERN = /^sha256:[a-f0-9]{64}$/;
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][-A-Za-z0-9._:]{0,255}$/;
const FIELD_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]*$/;
const DATE_TIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const COMMON_KEYS = [
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
];

const REQUEST_KEYS = [
  ...COMMON_KEYS,
  'intent',
  'input',
  'requestedScope',
  'idempotencyKey',
];

const PLAN_KEYS = [
  ...COMMON_KEYS,
  'planId',
  'planHash',
  'registryVersion',
  'policyVersion',
  'operations',
  'preconditions',
  'risk',
  'scopeLimits',
  'expiresAt',
];

const APPROVAL_KEYS = [
  ...COMMON_KEYS,
  'approvalId',
  'planId',
  'approvedPlanHash',
  'approver',
  'approvalTier',
  'approvalStages',
  'allowedScope',
  'expiresAt',
  'decision',
  'decidedAt',
];

const RESULT_KEYS = [
  ...COMMON_KEYS,
  'planId',
  'planHash',
  'registryVersion',
  'policyVersion',
  'policyDecision',
  'approvalIds',
  'status',
  'effectiveMode',
  'operations',
  'evidence',
  'warnings',
  'errors',
  'partialFailure',
  'nextActions',
  'completedAt',
];

const SCOPE_REQUIRED_KEYS = [
  'maxRecords',
  'maxDocuments',
  'maxRecipients',
  'maxLocalArtifacts',
  'allowExternalSend',
  'allowMetadataMutation',
  'allowDestructive',
  'allowWorkflowActivation',
];

const SCOPE_OPTIONAL_KEYS = [
  'recordIds',
  'resourceTypes',
  'fieldNames',
  'documentIds',
  'recipientRefs',
  'senderAccountRef',
  'maxAmountMinor',
  'currency',
  'workflowIds',
  'localPathPrefixes',
  'allowOverwrite',
  'maxArtifactBytes',
];

const EFFECT_VALUES = [
  'local_write',
  'crm_write',
  'erp_write',
  'metadata_write',
  'workflow_change',
  'external_draft',
  'external_send',
  'destructive',
];

function invalid(code, publicMessage) {
  throw new RouterError(code, { publicMessage, outcome: 'blocked' });
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertPlainObject(value, code, message) {
  if (!isPlainObject(value)) invalid(code, message);
}

function assertExactKeys(value, allowed, required, code, message) {
  assertPlainObject(value, code, message);
  const allowedSet = new Set(allowed);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowedSet.has(key))) invalid(code, message);
  if (required.some((key) => !Object.hasOwn(value, key))) invalid(code, message);
}

function assertString(value, code, message, { min = 1, max = 4096 } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max) {
    invalid(code, message);
  }
}

function assertEnum(value, values, code, message) {
  if (!values.includes(value)) invalid(code, message);
}

function assertInteger(value, code, message, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) invalid(code, message);
}

function assertDateTime(value, code, message) {
  if (
    typeof value !== 'string' ||
    !DATE_TIME_PATTERN.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    invalid(code, message);
  }
}

function assertIdentifier(value, code, message) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    invalid(code, message);
  }
}

function assertCapabilityId(value, code, message) {
  if (typeof value !== 'string' || !CAPABILITY_PATTERN.test(value)) {
    invalid(code, message);
  }
}

function assertOpaqueRef(value, code, message) {
  if (
    typeof value !== 'string' ||
    !OPAQUE_REF_PATTERN.test(value) ||
    containsSensitiveText(value) ||
    /^https?:\/\//i.test(value)
  ) {
    invalid(code, message);
  }
}

function assertUniqueStringArray(
  value,
  code,
  message,
  itemValidator = (item) => assertString(item, code, message),
) {
  if (!Array.isArray(value)) invalid(code, message);
  for (const item of value) itemValidator(item);
  if (new Set(value).size !== value.length) invalid(code, message);
}

function assertSafeJson(value, code, message, seen = new WeakSet()) {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object') invalid(code, message);
  if (seen.has(value)) invalid(code, message);
  seen.add(value);
  if (Array.isArray(value)) {
    for (const child of value) assertSafeJson(child, code, message, seen);
    seen.delete(value);
    return;
  }
  if (!isPlainObject(value)) invalid(code, message);
  for (const child of Object.values(value)) {
    assertSafeJson(child, code, message, seen);
  }
  seen.delete(value);
}

function assertNoSecretKeys(value, code, message) {
  if (findSecretShapedKeyPath(value)) invalid(code, message);
}

function assertNoSensitiveText(value, code, message) {
  if (findSensitiveTextPath(value)) invalid(code, message);
}

function validateIdentity(value, code) {
  const message = 'The requester identity is invalid.';
  assertExactKeys(value, ['id', 'type', 'channel'], ['id', 'type', 'channel'], code, message);
  assertOpaqueRef(value.id, code, message);
  assertEnum(value.type, ['human', 'agent', 'system'], code, message);
  assertOpaqueRef(value.channel, code, message);
}

function validateEnvironment(value, code) {
  const message = 'The operation environment is invalid or ambiguous.';
  assertExactKeys(value, ['name', 'workspace'], ['name', 'workspace'], code, message);
  assertEnum(value.name, ['test', 'sandbox', 'production'], code, message);
  assertOpaqueRef(value.workspace, code, message);
}

export function validateScopeLimits(value, code = 'INVALID_HANDOFF') {
  const message = 'The requested operation scope is invalid.';
  const allowed = [...SCOPE_REQUIRED_KEYS, ...SCOPE_OPTIONAL_KEYS];
  assertExactKeys(value, allowed, SCOPE_REQUIRED_KEYS, code, message);

  for (const key of [
    'maxRecords',
    'maxDocuments',
    'maxRecipients',
    'maxLocalArtifacts',
  ]) {
    assertInteger(value[key], code, message);
  }
  for (const key of [
    'allowExternalSend',
    'allowMetadataMutation',
    'allowDestructive',
    'allowWorkflowActivation',
  ]) {
    if (typeof value[key] !== 'boolean') invalid(code, message);
  }

  for (const key of ['recordIds', 'documentIds', 'recipientRefs', 'workflowIds']) {
    if (Object.hasOwn(value, key)) {
      assertUniqueStringArray(value[key], code, message, (item) =>
        assertOpaqueRef(item, code, message),
      );
    }
  }
  for (const key of ['resourceTypes', 'fieldNames']) {
    if (Object.hasOwn(value, key)) {
      assertUniqueStringArray(value[key], code, message, (item) => {
        if (typeof item !== 'string' || !FIELD_NAME_PATTERN.test(item)) {
          invalid(code, message);
        }
      });
    }
  }
  if (Object.hasOwn(value, 'senderAccountRef') && value.senderAccountRef !== null) {
    assertOpaqueRef(value.senderAccountRef, code, message);
  }
  if (Object.hasOwn(value, 'maxAmountMinor')) {
    assertInteger(value.maxAmountMinor, code, message);
  }
  if (
    Object.hasOwn(value, 'currency') &&
    (typeof value.currency !== 'string' || !/^[A-Z]{3}$/.test(value.currency))
  ) {
    invalid(code, message);
  }
  if (Object.hasOwn(value, 'localPathPrefixes')) {
    assertUniqueStringArray(value.localPathPrefixes, code, message, (prefix) => {
      assertString(prefix, code, message, { max: 512 });
      if (
        path.isAbsolute(prefix) ||
        prefix.includes('\\') ||
        prefix.split('/').some((segment) => segment === '..' || segment === '')
      ) {
        invalid(code, message);
      }
    });
  }
  if (Object.hasOwn(value, 'allowOverwrite') && typeof value.allowOverwrite !== 'boolean') {
    invalid(code, message);
  }
  if (Object.hasOwn(value, 'maxArtifactBytes')) {
    assertInteger(value.maxArtifactBytes, code, message);
  }

  return value;
}

function validateCommonEnvelope(value, expectedKind, code) {
  if (value.$schema !== OPERATION_ENVELOPE_SCHEMA || value.schemaVersion !== OPERATION_ENVELOPE_VERSION) {
    invalid('CONTRACT_VERSION_UNSUPPORTED', 'The operation envelope version is not supported.');
  }
  if (value.kind !== expectedKind) invalid(code, 'The operation envelope kind is invalid.');
  assertIdentifier(value.requestId, code, 'The operation request identifier is invalid.');
  assertIdentifier(value.correlationId, code, 'The operation correlation identifier is invalid.');
  if (value.repoId !== REPO_ID) invalid('REPO_MISMATCH', 'The operation targets another repository.');
  assertCapabilityId(value.capabilityId, code, 'The capability identifier is invalid.');
  validateIdentity(value.requester, code);
  validateEnvironment(value.environment, code);
  assertEnum(value.mode, ['read_only', 'dry_run', 'apply'], code, 'The operation mode is invalid.');
  assertDateTime(value.createdAt, code, 'The operation creation timestamp is invalid.');
}

export function validateOperationRequest(value) {
  const code = 'INVALID_HANDOFF';
  const message = 'The operation request does not conform to envelope v1.';
  assertExactKeys(value, REQUEST_KEYS, REQUEST_KEYS, code, message);
  assertNoSecretKeys(value, code, 'Secret-shaped properties are forbidden in repository handoffs.');
  assertNoSensitiveText(value, code, 'Credential-like values and raw email addresses are forbidden in operation requests.');
  assertSafeJson(value, code, message);
  validateCommonEnvelope(value, 'operation_request', code);
  assertString(value.intent, code, message, { max: 4096 });
  assertPlainObject(value.input, code, message);
  validateScopeLimits(value.requestedScope, code);
  if (value.idempotencyKey !== null) {
    assertString(value.idempotencyKey, code, message, { min: 8, max: 256 });
    if (containsSensitiveText(value.idempotencyKey)) invalid(code, message);
  }
  return value;
}

function assertHash(value, code, message) {
  if (typeof value !== 'string' || !HASH_PATTERN.test(value)) {
    invalid(code, message);
  }
}

function assertSemVerV1(value, code, message) {
  if (typeof value !== 'string' || !SEMVER_V1_PATTERN.test(value)) {
    invalid(code, message);
  }
}

function validateNormalizedOperation(value, code) {
  const message = 'A normalized plan operation is invalid.';
  const keys = [
    'operationId',
    'action',
    'targetSystem',
    'resourceType',
    'resourceId',
    'input',
    'idempotencyKey',
    'expectedEffects',
    'constraints',
  ];
  assertExactKeys(value, keys, keys, code, message);
  assertIdentifier(value.operationId, code, message);
  if (typeof value.action !== 'string' || !/^[a-z][a-z0-9_.-]*$/.test(value.action)) {
    invalid(code, message);
  }
  assertEnum(
    value.targetSystem,
    ['local_filesystem', 'twenty', 'aikount', 'gmail'],
    code,
    message,
  );
  assertString(value.resourceType, code, message, { max: 256 });
  if (value.resourceId !== null) assertOpaqueRef(value.resourceId, code, message);
  assertPlainObject(value.input, code, message);
  assertPlainObject(value.constraints, code, message);
  assertString(value.idempotencyKey, code, message, { min: 8, max: 256 });
  if (containsSensitiveText(value.idempotencyKey)) invalid(code, message);
  assertUniqueStringArray(value.expectedEffects, code, message, (effect) =>
    assertEnum(effect, EFFECT_VALUES, code, message),
  );
}

function validatePrecondition(value, code) {
  const message = 'An operation plan precondition is invalid.';
  const keys = [
    'id',
    'type',
    'status',
    'sourceRef',
    'observedAt',
    'validUntil',
    'expectedVersion',
    'expectedHash',
    'evidence',
  ];
  assertExactKeys(value, keys, keys, code, message);
  assertOpaqueRef(value.id, code, message);
  assertString(value.type, code, message, { max: 128 });
  assertEnum(value.status, ['satisfied', 'pending', 'failed'], code, message);
  assertOpaqueRef(value.sourceRef, code, message);
  assertDateTime(value.observedAt, code, message);
  if (value.validUntil !== null) {
    assertDateTime(value.validUntil, code, message);
    if (Date.parse(value.validUntil) <= Date.parse(value.observedAt)) {
      invalid(code, message);
    }
  }
  if (value.expectedVersion !== null) {
    assertString(value.expectedVersion, code, message, { max: 256 });
    if (containsSensitiveText(value.expectedVersion)) invalid(code, message);
  }
  if (value.expectedHash !== null) assertHash(value.expectedHash, code, message);
  if (value.evidence !== null) {
    assertString(value.evidence, code, message, { max: 2048 });
    if (containsSensitiveText(value.evidence)) invalid(code, message);
  }
}

function validateRisk(value, code) {
  const message = 'The operation plan risk assessment is invalid.';
  const keys = [
    'effects',
    'domainSpan',
    'dataClasses',
    'reversibility',
    'approvalTier',
    'rationale',
  ];
  assertExactKeys(value, keys, keys, code, message);
  assertUniqueStringArray(value.effects, code, message, (effect) =>
    assertEnum(effect, EFFECT_VALUES, code, message),
  );
  assertEnum(value.domainSpan, ['single_domain', 'cross_domain'], code, message);
  assertUniqueStringArray(value.dataClasses, code, message, (dataClass) =>
    assertEnum(
      dataClass,
      ['internal', 'commercial', 'pii', 'accounting'],
      code,
      message,
    ),
  );
  if (value.dataClasses.length < 1) invalid(code, message);
  assertEnum(
    value.reversibility,
    ['reversible', 'compensatable', 'irreversible'],
    code,
    message,
  );
  assertEnum(
    value.approvalTier,
    ['none', 'operator', 'owner', 'two_stage', 'denied'],
    code,
    message,
  );
  assertUniqueStringArray(value.rationale, code, message, (entry) => {
    assertString(entry, code, message, { max: 256 });
    if (containsSensitiveText(entry)) invalid(code, message);
  });
  if (value.rationale.length < 1) invalid(code, message);
}

export function validateOperationPlan(value) {
  const code = 'INVALID_PLAN';
  const message = 'The operation plan does not conform to envelope v1.';
  assertExactKeys(value, PLAN_KEYS, PLAN_KEYS, code, message);
  assertNoSecretKeys(value, code, 'Secret-shaped properties are forbidden in operation plans.');
  assertNoSensitiveText(value, code, 'Sensitive values are forbidden in operation plans.');
  assertSafeJson(value, code, message);
  validateCommonEnvelope(value, 'operation_plan', code);
  assertIdentifier(value.planId, code, message);
  assertHash(value.planHash, code, message);
  assertSemVerV1(value.registryVersion, code, message);
  assertSemVerV1(value.policyVersion, code, message);
  if (!Array.isArray(value.operations) || value.operations.length < 1) {
    invalid(code, message);
  }
  for (const operation of value.operations) validateNormalizedOperation(operation, code);
  if (!Array.isArray(value.preconditions)) invalid(code, message);
  for (const precondition of value.preconditions) validatePrecondition(precondition, code);
  validateRisk(value.risk, code);
  validateScopeLimits(value.scopeLimits, code);
  assertDateTime(value.expiresAt, code, message);
  if (Date.parse(value.expiresAt) <= Date.parse(value.createdAt)) {
    invalid(code, message);
  }

  const operationIds = value.operations.map((operation) => operation.operationId);
  const idempotencyKeys = value.operations.map(
    (operation) => operation.idempotencyKey,
  );
  const preconditionIds = value.preconditions.map((precondition) => precondition.id);
  if (
    new Set(operationIds).size !== operationIds.length ||
    new Set(idempotencyKeys).size !== idempotencyKeys.length ||
    new Set(preconditionIds).size !== preconditionIds.length
  ) {
    invalid(code, message);
  }
  const expectedEffects = [
    ...new Set(
      value.operations.flatMap((operation) => operation.expectedEffects),
    ),
  ].sort();
  const riskEffects = [...value.risk.effects].sort();
  if (
    expectedEffects.length !== riskEffects.length ||
    expectedEffects.some((effect, index) => effect !== riskEffects[index])
  ) {
    invalid(code, 'risk.effects must equal the union of operation effects.');
  }
  return value;
}

function validateApprovalStage(value, code) {
  const message = 'An approval stage is invalid.';
  assertExactKeys(
    value,
    ['stage', 'approver', 'decision', 'decidedAt'],
    ['stage', 'approver', 'decision', 'decidedAt'],
    code,
    message,
  );
  assertEnum(
    value.stage,
    [
      'operator_review',
      'owner_authorization',
      'business_content_approval',
      'effect_target_approval',
    ],
    code,
    message,
  );
  validateIdentity(value.approver, code);
  assertEnum(value.decision, ['approved', 'rejected', 'revoked'], code, message);
  assertDateTime(value.decidedAt, code, message);
}

export function validateOperationApproval(value) {
  const code = 'INVALID_APPROVAL';
  const message = 'The operation approval does not conform to envelope v1.';
  assertExactKeys(value, APPROVAL_KEYS, APPROVAL_KEYS, code, message);
  assertNoSecretKeys(value, code, 'Secret-shaped properties are forbidden in approvals.');
  assertNoSensitiveText(value, code, 'Sensitive values are forbidden in approvals.');
  assertSafeJson(value, code, message);
  validateCommonEnvelope(value, 'operation_approval', code);
  if (value.mode !== 'apply') invalid(code, message);
  assertIdentifier(value.approvalId, code, message);
  assertIdentifier(value.planId, code, message);
  assertHash(value.approvedPlanHash, code, message);
  validateIdentity(value.approver, code);
  assertEnum(value.approvalTier, ['operator', 'owner', 'two_stage'], code, message);
  if (!Array.isArray(value.approvalStages) || value.approvalStages.length < 1) {
    invalid(code, message);
  }
  for (const stage of value.approvalStages) validateApprovalStage(stage, code);
  const stageNames = value.approvalStages.map((stage) => stage.stage);
  if (new Set(stageNames).size !== stageNames.length) invalid(code, message);
  validateScopeLimits(value.allowedScope, code);
  if (
    value.allowedScope.allowMetadataMutation ||
    value.allowedScope.allowDestructive ||
    value.allowedScope.allowWorkflowActivation
  ) {
    invalid(code, message);
  }
  assertDateTime(value.expiresAt, code, message);
  assertEnum(value.decision, ['approved', 'rejected', 'revoked'], code, message);
  assertDateTime(value.decidedAt, code, message);
  if (
    Date.parse(value.decidedAt) < Date.parse(value.createdAt) ||
    Date.parse(value.expiresAt) <= Date.parse(value.decidedAt)
  ) {
    invalid(code, message);
  }
  const requiredStages =
    value.approvalTier === 'operator'
      ? ['operator_review']
      : value.approvalTier === 'owner'
        ? ['owner_authorization']
        : ['business_content_approval', 'effect_target_approval'];
  if (
    stageNames.length !== requiredStages.length ||
    requiredStages.some((stage) => !stageNames.includes(stage))
  ) {
    invalid(code, message);
  }
  if (
    value.decision === 'approved' &&
    value.approvalStages.some((stage) => stage.decision !== 'approved')
  ) {
    invalid(code, message);
  }
  return value;
}

export function validateRepoHandoff(value) {
  const code = 'INVALID_HANDOFF';
  const message = 'The repository handoff does not conform to the provisional local contract.';
  assertPlainObject(value, code, message);
  assertNoSecretKeys(value, code, 'Secret-shaped properties are forbidden in repository handoffs.');
  assertNoSensitiveText(value, code, 'Credential-like values and raw email addresses are forbidden in repository handoffs.');
  assertSafeJson(value, code, message);

  if (value.$schema !== REPO_HANDOFF_SCHEMA || value.schemaVersion !== REPO_HANDOFF_VERSION) {
    invalid('CONTRACT_VERSION_UNSUPPORTED', 'The repository handoff contract version is not supported.');
  }
  assertExactKeys(
    value,
    [
      '$schema',
      'schemaVersion',
      'kind',
      'contractStatus',
      'handoffId',
      'source',
      'targetRepoId',
      'createdAt',
      'operationRequest',
    ],
    [
      '$schema',
      'schemaVersion',
      'kind',
      'contractStatus',
      'handoffId',
      'source',
      'targetRepoId',
      'createdAt',
      'operationRequest',
    ],
    code,
    message,
  );
  if (value.kind !== 'repo_handoff_request' || value.contractStatus !== 'provisional_local') {
    invalid(code, message);
  }
  assertIdentifier(value.handoffId, code, message);
  assertExactKeys(
    value.source,
    ['controlPlane', 'repository', 'contractAuthority'],
    ['controlPlane', 'repository', 'contractAuthority'],
    code,
    message,
  );
  assertString(value.source.controlPlane, code, message, { max: 128 });
  assertString(value.source.repository, code, message, { max: 512 });
  let sourceRepository;
  try {
    sourceRepository = new URL(value.source.repository);
  } catch {
    invalid(code, message);
  }
  if (
    sourceRepository.protocol !== 'https:' ||
    sourceRepository.username !== '' ||
    sourceRepository.password !== '' ||
    sourceRepository.search !== '' ||
    sourceRepository.hash !== '' ||
    value.source.contractAuthority !== 'skilland-crm-local'
  ) {
    invalid(code, message);
  }
  if (value.targetRepoId !== REPO_ID) invalid('REPO_MISMATCH', 'The handoff targets another repository.');
  assertDateTime(value.createdAt, code, message);
  validateOperationRequest(value.operationRequest);
  if (value.operationRequest.repoId !== value.targetRepoId) {
    invalid('REPO_MISMATCH', 'The handoff and operation request target different repositories.');
  }
  return value;
}

export function validateIssue(value, code = 'EXECUTION_FAILED') {
  const message = 'An operation issue is invalid.';
  assertExactKeys(value, ['code', 'message', 'retryable'], ['code', 'message', 'retryable'], code, message);
  if (typeof value.code !== 'string' || !ISSUE_CODE_PATTERN.test(value.code)) invalid(code, message);
  assertString(value.message, code, message, { max: 2048 });
  if (containsSensitiveText(value.message)) invalid(code, message);
  if (typeof value.retryable !== 'boolean') invalid(code, message);
  return value;
}

export function validateExecutionRecord(value, code = 'EXECUTION_FAILED') {
  const message = 'An execution record is invalid.';
  const keys = [
    'operationId',
    'targetSystem',
    'workerVersion',
    'status',
    'resourceRef',
    'idempotencyKey',
    'evidence',
  ];
  assertExactKeys(value, keys, keys, code, message);
  assertIdentifier(value.operationId, code, message);
  assertEnum(value.targetSystem, ['local_filesystem', 'twenty', 'aikount', 'gmail'], code, message);
  if (value.workerVersion !== null && (typeof value.workerVersion !== 'string' || !SEMVER_PATTERN.test(value.workerVersion))) {
    invalid(code, message);
  }
  assertEnum(
    value.status,
    ['planned', 'simulated', 'succeeded', 'blocked', 'failed', 'compensated'],
    code,
    message,
  );
  if (value.resourceRef !== null) {
    assertString(value.resourceRef, code, message, { max: 1024 });
    if (containsSensitiveText(value.resourceRef)) invalid(code, message);
    if (
      value.targetSystem === 'local_filesystem' &&
      (path.isAbsolute(value.resourceRef) ||
        /^https?:\/\//i.test(value.resourceRef) ||
        value.resourceRef.includes('\\') ||
        value.resourceRef.split('/').some((segment) => segment === '..' || segment === ''))
    ) {
      invalid(code, message);
    }
  }
  assertString(value.idempotencyKey, code, message, { min: 8, max: 256 });
  if (containsSensitiveText(value.idempotencyKey)) invalid(code, message);
  assertUniqueStringArray(value.evidence, code, message, (item) => {
    assertString(item, code, message, { max: 2048 });
    if (containsSensitiveText(item)) invalid(code, message);
  });
  return value;
}

function validatePartialFailure(value, code) {
  const message = 'The partial-failure record is invalid.';
  const keys = [
    'completedOperationIds',
    'failedOperationIds',
    'compensationStatus',
    'manualReconciliationRequired',
  ];
  assertExactKeys(value, keys, keys, code, message);
  assertUniqueStringArray(value.completedOperationIds, code, message, (item) =>
    assertIdentifier(item, code, message),
  );
  assertUniqueStringArray(value.failedOperationIds, code, message, (item) =>
    assertIdentifier(item, code, message),
  );
  if (value.failedOperationIds.length < 1) invalid(code, message);
  assertEnum(
    value.compensationStatus,
    ['not_required', 'not_available', 'pending', 'completed', 'failed'],
    code,
    message,
  );
  if (typeof value.manualReconciliationRequired !== 'boolean') invalid(code, message);
}

export function validateOperationResult(value) {
  const code = 'EXECUTION_FAILED';
  const message = 'The operation result does not conform to envelope v1.';
  assertExactKeys(value, RESULT_KEYS, RESULT_KEYS, code, message);
  assertNoSecretKeys(value, code, 'Secret-shaped properties are forbidden in operation results.');
  assertNoSensitiveText(value, code, 'Sensitive values are forbidden in operation results.');
  assertSafeJson(value, code, message);
  validateCommonEnvelope(value, 'operation_result', code);

  if (value.planId !== null) assertIdentifier(value.planId, code, message);
  if (value.planHash !== null && (typeof value.planHash !== 'string' || !HASH_PATTERN.test(value.planHash))) {
    invalid(code, message);
  }
  for (const key of ['registryVersion', 'policyVersion']) {
    if (value[key] !== null && (typeof value[key] !== 'string' || !SEMVER_V1_PATTERN.test(value[key]))) {
      invalid(code, message);
    }
  }
  assertEnum(value.policyDecision, ['allow', 'require_approval', 'deny'], code, message);
  assertUniqueStringArray(value.approvalIds, code, message, (item) =>
    assertIdentifier(item, code, message),
  );
  assertEnum(
    value.status,
    ['planned', 'simulated', 'succeeded', 'blocked', 'partial_failure', 'failed'],
    code,
    message,
  );
  assertEnum(value.effectiveMode, ['read_only', 'dry_run', 'apply'], code, message);
  if (!Array.isArray(value.operations)) invalid(code, message);
  for (const operation of value.operations) validateExecutionRecord(operation, code);
  assertUniqueStringArray(value.evidence, code, message, (item) => {
    assertString(item, code, message, { max: 2048 });
    if (containsSensitiveText(item)) invalid(code, message);
  });
  if (!Array.isArray(value.warnings) || !Array.isArray(value.errors)) invalid(code, message);
  for (const warning of value.warnings) validateIssue(warning, code);
  for (const error of value.errors) validateIssue(error, code);
  if (value.partialFailure !== null) validatePartialFailure(value.partialFailure, code);
  assertUniqueStringArray(value.nextActions, code, message, (item) => {
    assertString(item, code, message, { max: 2048 });
    if (containsSensitiveText(item)) invalid(code, message);
  });
  assertDateTime(value.completedAt, code, message);

  if (value.mode === 'read_only' && value.effectiveMode !== 'read_only') invalid(code, message);
  if (value.mode === 'dry_run' && !['read_only', 'dry_run'].includes(value.effectiveMode)) invalid(code, message);
  if (['planned', 'simulated', 'succeeded', 'partial_failure'].includes(value.status)) {
    if (value.registryVersion === null || value.policyVersion === null) invalid(code, message);
  }
  if (value.status === 'succeeded') {
    if (
      !['allow', 'require_approval'].includes(value.policyDecision) ||
      value.errors.length !== 0 ||
      value.partialFailure !== null ||
      value.operations.some((operation) => operation.status !== 'succeeded')
    ) {
      invalid(code, message);
    }
  }
  if (value.status === 'simulated') {
    if (
      value.effectiveMode !== 'dry_run' ||
      value.errors.length !== 0 ||
      value.partialFailure !== null ||
      value.operations.some((operation) => !['simulated', 'planned'].includes(operation.status))
    ) {
      invalid(code, message);
    }
  }
  if (value.status === 'planned') {
    if (
      value.errors.length !== 0 ||
      value.partialFailure !== null ||
      value.operations.some((operation) => operation.status !== 'planned')
    ) {
      invalid(code, message);
    }
  }
  if (value.status === 'blocked' || value.status === 'failed') {
    if (
      (value.status === 'blocked' && value.policyDecision !== 'deny') ||
      value.errors.length < 1 ||
      value.partialFailure !== null ||
      value.operations.some((operation) => operation.status === 'succeeded')
    ) {
      invalid(code, message);
    }
  }
  if (value.status === 'partial_failure') {
    const succeeded = value.operations.some((operation) =>
      ['succeeded', 'compensated'].includes(operation.status),
    );
    const failed = value.operations.some((operation) => operation.status === 'failed');
    if (
      value.operations.length < 2 ||
      !succeeded ||
      !failed ||
      value.errors.length < 1 ||
      value.partialFailure === null
    ) {
      invalid(code, message);
    }
  }

  return value;
}

export function validatePolicyOperationResult(value) {
  validateOperationResult(value);
  const code = 'EXECUTION_FAILED';
  const message = 'The policy-enforced operation result is inconsistent.';
  const operationIds = value.operations.map((operation) => operation.operationId);
  if (new Set(operationIds).size !== operationIds.length) invalid(code, message);
  if ((value.planId === null) !== (value.planHash === null)) invalid(code, message);
  if (Date.parse(value.completedAt) < Date.parse(value.createdAt)) {
    invalid(code, message);
  }

  if (value.mode === 'apply' && ['succeeded', 'partial_failure'].includes(value.status)) {
    if (
      value.effectiveMode !== 'apply' ||
      value.planId === null ||
      value.planHash === null ||
      value.policyDecision !== 'require_approval' ||
      value.approvalIds.length < 1
    ) {
      invalid(code, message);
    }
  }
  if (value.policyDecision === 'require_approval' && value.status === 'succeeded') {
    if (value.mode !== 'apply' || value.approvalIds.length < 1) {
      invalid(code, message);
    }
  }

  if (value.status === 'partial_failure') {
    const records = new Map(
      value.operations.map((operation) => [operation.operationId, operation]),
    );
    const completed = new Set(value.partialFailure.completedOperationIds);
    const failed = new Set(value.partialFailure.failedOperationIds);
    if (
      [...completed].some((id) => failed.has(id)) ||
      [...completed].some(
        (id) => !['succeeded', 'compensated'].includes(records.get(id)?.status),
      ) ||
      [...failed].some((id) => records.get(id)?.status !== 'failed') ||
      value.operations.some((operation) => {
        if (['succeeded', 'compensated'].includes(operation.status)) {
          return !completed.has(operation.operationId);
        }
        if (operation.status === 'failed') return !failed.has(operation.operationId);
        return true;
      })
    ) {
      invalid(code, message);
    }
  }

  return value;
}

export function isIdentifier(value) {
  return typeof value === 'string' && IDENTIFIER_PATTERN.test(value);
}

export function isCapabilityId(value) {
  return typeof value === 'string' && CAPABILITY_PATTERN.test(value);
}

export function isDateTime(value) {
  return (
    typeof value === 'string' &&
    DATE_TIME_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

const NUMERIC_KEYS = [
  'maxRecords',
  'maxDocuments',
  'maxRecipients',
  'maxLocalArtifacts',
  'maxAmountMinor',
  'maxArtifactBytes',
];

const BOOLEAN_KEYS = [
  'allowExternalSend',
  'allowMetadataMutation',
  'allowDestructive',
  'allowWorkflowActivation',
  'allowOverwrite',
];

const ARRAY_KEYS = [
  'recordIds',
  'resourceTypes',
  'fieldNames',
  'documentIds',
  'recipientRefs',
  'workflowIds',
  'localPathPrefixes',
];

const EXACT_KEYS = ['currency', 'senderAccountRef'];

export function isScopeContained(candidate, limit) {
  if (!candidate || !limit) return false;

  for (const key of NUMERIC_KEYS) {
    const candidateHas = Object.hasOwn(candidate, key);
    const limitHas = Object.hasOwn(limit, key);
    if (candidateHas !== limitHas && (candidateHas || limitHas)) return false;
    if (candidateHas && candidate[key] > limit[key]) return false;
  }

  for (const key of BOOLEAN_KEYS) {
    const candidateHas = Object.hasOwn(candidate, key);
    const limitHas = Object.hasOwn(limit, key);
    if (candidateHas && !limitHas) return false;
    if (limitHas && !candidateHas) return false;
    if (candidateHas && candidate[key] === true && limit[key] !== true) return false;
  }

  for (const key of ARRAY_KEYS) {
    const candidateHas = Object.hasOwn(candidate, key);
    const limitHas = Object.hasOwn(limit, key);
    if (candidateHas !== limitHas) return false;
    if (
      candidateHas &&
      candidate[key].some((item) => !limit[key].includes(item))
    ) {
      return false;
    }
  }

  for (const key of EXACT_KEYS) {
    const candidateHas = Object.hasOwn(candidate, key);
    const limitHas = Object.hasOwn(limit, key);
    if (candidateHas !== limitHas) return false;
    if (candidateHas && candidate[key] !== limit[key]) return false;
  }

  return true;
}

const EFFECT_TARGETS = new Map([
  ['local_write', new Set(['local_filesystem'])],
  ['crm_write', new Set(['twenty'])],
  ['erp_write', new Set(['aikount'])],
  ['metadata_write', new Set(['twenty'])],
  ['workflow_change', new Set(['twenty'])],
  ['external_draft', new Set(['gmail', 'aikount'])],
  ['external_send', new Set(['gmail', 'aikount'])],
]);

export function operationsFitScope(operations, scope) {
  if (!Array.isArray(operations) || !scope) return false;
  const withEffect = (effect) =>
    operations.filter((operation) => operation.expectedEffects?.includes(effect));

  const crm = withEffect('crm_write');
  const erp = withEffect('erp_write');
  const sends = withEffect('external_send');
  const local = withEffect('local_write');
  if (
    crm.length > scope.maxRecords ||
    erp.length > scope.maxDocuments ||
    sends.length > scope.maxRecipients ||
    local.length > scope.maxLocalArtifacts ||
    (sends.length > 0 && scope.allowExternalSend !== true)
  ) {
    return false;
  }

  if (
    operations.some((operation) =>
      operation.expectedEffects?.some((effect) => {
        const targets = EFFECT_TARGETS.get(effect);
        return targets ? !targets.has(operation.targetSystem) : false;
      }),
    )
  ) {
    return false;
  }

  if (
    Array.isArray(scope.recordIds) &&
    crm.some(
      (operation) =>
        operation.resourceId !== null &&
        !scope.recordIds.includes(operation.resourceId),
    )
  ) {
    return false;
  }
  if (
    Array.isArray(scope.documentIds) &&
    erp.some(
      (operation) =>
        operation.resourceId !== null &&
        !scope.documentIds.includes(operation.resourceId),
    )
  ) {
    return false;
  }
  if (
    Array.isArray(scope.resourceTypes) &&
    operations.some(
      (operation) => !scope.resourceTypes.includes(operation.resourceType),
    )
  ) {
    return false;
  }
  if (
    Array.isArray(scope.fieldNames) &&
    crm.some((operation) =>
      Object.keys(operation.input ?? {}).some(
        (fieldName) => !scope.fieldNames.includes(fieldName),
      ),
    )
  ) {
    return false;
  }

  return true;
}

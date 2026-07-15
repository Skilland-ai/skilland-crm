import {
  generateCrmExportMarkdown,
} from '../../crm_manual_update_crew/export-para-chatgpt.mjs';

import {
  CRM_EXPORT_MAX_ARTIFACT_BYTES,
  CRM_EXPORT_OUTPUT_DIRECTORY,
  createCrmExportArtifactStore,
} from './artifact-store.mjs';
import { asSafeAdapterError, SafeAdapterError } from './errors.mjs';
import { createLiveQueryOnlyCrmReader } from './query-only-twenty.mjs';

const CAPABILITY_ID = 'report.crm.export';
const WORKER_VERSION = '1.0.0';
const HARD_MAX_RECORDS = 1000;

export function createReportCrmExportAdapter({
  rootDir,
  clock,
  crmReaderFactory = ({ request }) =>
    createLiveQueryOnlyCrmReader({ request }),
  artifactStoreFactory = () => createCrmExportArtifactStore({ rootDir }),
} = {}) {
  return async function reportCrmExportAdapter({
    request,
    capability,
    clock: invocationClock,
  }) {
    try {
      const maxRecords = validateInvocation({ request, capability });
      const generatedAt = readClock(invocationClock ?? clock);
      const reader = await crmReaderFactory({ request, capability });
      const exportResult = await generateCrmExportMarkdown({
        client: reader,
        generatedAt,
        pageSize: Math.min(100, maxRecords),
        maxPages: Math.ceil(maxRecords / Math.min(100, maxRecords)),
        notesLimit: 100,
        tasksLimit: 100,
        maxRecords,
      });
      const artifactStore = await artifactStoreFactory({
        rootDir,
        request,
        capability,
      });
      const artifact = await artifactStore.writeMarkdown({
        requestId: request.requestId,
        markdown: exportResult.markdown,
        requestedMaxBytes: request.requestedScope.maxArtifactBytes,
      });
      const evidence = [
        `artifact.path=${artifact.relativePath}`,
        `artifact.sha256=${artifact.sha256}`,
        `artifact.bytes=${artifact.sizeBytes}`,
        `artifact.mediaType=${artifact.mediaType}`,
        `records.fetched=${exportResult.counts.fetched}`,
        `records.exported=${exportResult.counts.exported}`,
        `records.excluded=${exportResult.counts.excluded}`,
        'source.complete=true',
      ];
      const warnings = exportResult.warnings.map(() => ({
        code: 'CRM_EXPORT_SOURCE_CATALOG_WARNING',
        message:
          'Un catalogo auxiliar no estuvo disponible; el export uso datos completos incluidos en cada oportunidad.',
        retryable: true,
      }));
      const operation = {
        operationId: `op_${request.requestId}`,
        targetSystem: 'local_filesystem',
        workerVersion: WORKER_VERSION,
        status: 'succeeded',
        resourceRef: artifact.relativePath,
        idempotencyKey:
          request.idempotencyKey ?? `readonly:${request.requestId}`,
        evidence,
      };

      return {
        operation,
        evidence,
        warnings,
        artifact,
        counts: exportResult.counts,
        completeness: exportResult.completeness,
      };
    } catch (error) {
      throw toRouterError(asSafeAdapterError(error));
    }
  };
}

function validateInvocation({ request, capability }) {
  if (!request || !capability) {
    throw new SafeAdapterError(
      'CRM_EXPORT_INVOCATION_INVALID',
      'El adapter requiere request y capability ya resueltos por el router.',
    );
  }
  if (
    request.capabilityId !== CAPABILITY_ID ||
    capability.id !== CAPABILITY_ID
  ) {
    throw new SafeAdapterError(
      'CRM_EXPORT_CAPABILITY_MISMATCH',
      'El adapter solo ejecuta la capability canonica report.crm.export.',
    );
  }
  if (request.mode !== 'read_only') {
    throw new SafeAdapterError(
      'CRM_EXPORT_MODE_UNSUPPORTED',
      'report.crm.export solo admite mode=read_only.',
    );
  }
  if (
    !Array.isArray(capability.environmentAllowlist) ||
    capability.environmentAllowlist.length !== 1 ||
    capability.environmentAllowlist[0] !== 'test'
  ) {
    throw new SafeAdapterError(
      'CRM_EXPORT_CAPABILITY_POLICY_INVALID',
      'La capability report.crm.export debe permanecer limitada exactamente al entorno test.',
    );
  }
  if (request.environment?.name !== 'test') {
    throw new SafeAdapterError(
      'CRM_EXPORT_ENVIRONMENT_UNSUPPORTED',
      'report.crm.export solo admite el entorno test en Gate 007.',
    );
  }

  const inputKeys = Object.keys(request.input ?? {}).sort();
  if (
    inputKeys.length !== 2 ||
    inputKeys[0] !== 'excludeBusinessLines' ||
    inputKeys[1] !== 'format' ||
    request.input.format !== 'markdown' ||
    !Array.isArray(request.input.excludeBusinessLines) ||
    request.input.excludeBusinessLines.length !== 1 ||
    request.input.excludeBusinessLines[0] !== 'IA Mujeres'
  ) {
    throw new SafeAdapterError(
      'CRM_EXPORT_INPUT_INVALID',
      'El input debe declarar exactamente format=markdown y excludeBusinessLines=[IA Mujeres].',
    );
  }
  if (
    !Array.isArray(capability.supportedModes) ||
    !capability.supportedModes.includes('read_only')
  ) {
    throw new SafeAdapterError(
      'CRM_EXPORT_CAPABILITY_POLICY_INVALID',
      'La capability no declara read_only en su politica vigente.',
    );
  }

  const requestScope = request.requestedScope;
  const capabilityScope = capability.scopeLimits;
  if (!requestScope || !capabilityScope) {
    throw new SafeAdapterError(
      'CRM_EXPORT_SCOPE_MISSING',
      'Faltan limites de scope requeridos para el export.',
    );
  }
  const allowedRequestScopeKeys = new Set([
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
  if (
    Object.keys(requestScope).length !== allowedRequestScopeKeys.size ||
    Object.keys(requestScope).some((key) => !allowedRequestScopeKeys.has(key))
  ) {
    throw new SafeAdapterError(
      'CRM_EXPORT_SCOPE_INVALID',
      'El export requiere su scope exacto y no admite selectors o limites adicionales.',
    );
  }
  if (
    !Number.isInteger(capabilityScope.maxRecords) ||
    capabilityScope.maxRecords < 1 ||
    capabilityScope.maxRecords > HARD_MAX_RECORDS ||
    capabilityScope.maxDocuments !== 0 ||
    capabilityScope.maxRecipients !== 0 ||
    capabilityScope.maxLocalArtifacts !== 1 ||
    capabilityScope.allowExternalSend !== false ||
    capabilityScope.allowMetadataMutation !== false ||
    capabilityScope.allowDestructive !== false ||
    capabilityScope.allowWorkflowActivation !== false
  ) {
    throw new SafeAdapterError(
      'CRM_EXPORT_CAPABILITY_POLICY_INVALID',
      'La capability no contiene la politica cerrada esperada por este worker.',
    );
  }
  if (
    !Number.isInteger(requestScope.maxRecords) ||
    requestScope.maxRecords < 1 ||
    requestScope.maxRecords > HARD_MAX_RECORDS ||
    requestScope.maxRecords > capabilityScope.maxRecords
  ) {
    throw new SafeAdapterError(
      'CRM_EXPORT_RECORD_SCOPE_EXCEEDED',
      'maxRecords debe estar entre 1 y el limite autorizado, nunca por encima de 1000.',
    );
  }
  if (
    requestScope.maxDocuments !== 0 ||
    requestScope.maxRecipients !== 0 ||
    requestScope.maxLocalArtifacts !== 1 ||
    capabilityScope.maxLocalArtifacts !== 1
  ) {
    throw new SafeAdapterError(
      'CRM_EXPORT_ARTIFACT_SCOPE_INVALID',
      'El scope debe permitir exactamente un artefacto y cero documentos o recipients.',
    );
  }
  const capabilityMaxBytes = Number.isInteger(capabilityScope.maxArtifactBytes)
    ? capabilityScope.maxArtifactBytes
    : CRM_EXPORT_MAX_ARTIFACT_BYTES;
  if (
    !Number.isInteger(requestScope.maxArtifactBytes) ||
    requestScope.maxArtifactBytes < 1 ||
    requestScope.maxArtifactBytes >
      Math.min(capabilityMaxBytes, CRM_EXPORT_MAX_ARTIFACT_BYTES)
  ) {
    throw new SafeAdapterError(
      'CRM_EXPORT_ARTIFACT_SCOPE_INVALID',
      'maxArtifactBytes debe estar entre 1 y el limite autorizado del worker.',
    );
  }
  if (requestScope.allowOverwrite !== false) {
    throw new SafeAdapterError(
      'CRM_EXPORT_OVERWRITE_DENIED',
      'El adapter no admite overwrite.',
    );
  }
  if (
    requestScope.allowExternalSend !== false ||
    requestScope.allowMetadataMutation !== false ||
    requestScope.allowDestructive !== false ||
    requestScope.allowWorkflowActivation !== false
  ) {
    throw new SafeAdapterError(
      'CRM_EXPORT_SIDE_EFFECT_SCOPE_DENIED',
      'El scope solicita side effects incompatibles con un export de solo lectura.',
    );
  }
  if (
    !Array.isArray(requestScope.localPathPrefixes) ||
    requestScope.localPathPrefixes.length !== 1 ||
    requestScope.localPathPrefixes[0] !== CRM_EXPORT_OUTPUT_DIRECTORY
  ) {
    throw new SafeAdapterError(
      'CRM_EXPORT_OUTPUT_SCOPE_DENIED',
      'El export solo puede escribir en su directorio local allowlisted.',
    );
  }

  return requestScope.maxRecords;
}

function toRouterError(error) {
  const sourceIncompleteCodes = new Set([
    'CRM_EXPORT_INCOMPLETE_PAGE_INFO',
    'CRM_EXPORT_INVALID_PAGINATION',
    'CRM_EXPORT_INVALID_RECORD',
    'CRM_EXPORT_NOTES_TRUNCATED',
    'CRM_EXPORT_PAGE_LIMIT_REACHED',
    'CRM_EXPORT_RECORD_LIMIT_EXCEEDED',
    'CRM_EXPORT_TASKS_TRUNCATED',
    'CRM_EXPORT_UNQUERYABLE_EXCLUSION_SIGNAL',
  ]);
  const bindingCodes = new Set([
    'CRM_EXPORT_ENVIRONMENT_BINDING_MISMATCH',
    'CRM_EXPORT_SKILLAND_CRM_OPS_ENVIRONMENT_REQUIRED',
    'CRM_EXPORT_SKILLAND_CRM_OPS_WORKSPACE_REQUIRED',
  ]);
  const scopeCodes = new Set([
    'CRM_EXPORT_ARTIFACT_SCOPE_INVALID',
    'CRM_EXPORT_ARTIFACT_SCOPE_MISSING',
    'CRM_EXPORT_INPUT_INVALID',
    'CRM_EXPORT_OUTPUT_SCOPE_DENIED',
    'CRM_EXPORT_RECORD_SCOPE_EXCEEDED',
    'CRM_EXPORT_SCOPE_INVALID',
    'CRM_EXPORT_SCOPE_MISSING',
    'CRM_EXPORT_SIDE_EFFECT_SCOPE_DENIED',
  ]);
  const outputPolicyCodes = new Set([
    'CRM_EXPORT_ARTIFACT_EXISTS',
    'CRM_EXPORT_ARTIFACT_INVALID',
    'CRM_EXPORT_ARTIFACT_LIMIT_INVALID',
    'CRM_EXPORT_ARTIFACT_TOO_LARGE',
    'CRM_EXPORT_OUTPUT_PATH_UNSAFE',
    'CRM_EXPORT_OUTPUT_SCOPE_DENIED',
    'CRM_EXPORT_OVERWRITE_DENIED',
    'CRM_EXPORT_ROOT_INVALID',
  ]);
  const executionCodes = new Set([
    'CRM_EXPORT_ARTIFACT_VERIFICATION_FAILED',
    'CRM_EXPORT_ARTIFACT_WRITE_FAILED',
    'CRM_EXPORT_EXECUTION_FAILED',
    'CRM_EXPORT_FETCH_UNAVAILABLE',
    'CRM_EXPORT_BASE_URL_INSECURE',
    'CRM_EXPORT_BASE_URL_INVALID',
    'CRM_EXPORT_CLOCK_INVALID',
    'CRM_EXPORT_READER_INVALID',
    'CRM_EXPORT_TWENTY_API_KEY_REQUIRED',
    'CRM_EXPORT_TWENTY_BASE_URL_REQUIRED',
    'CRM_EXPORT_METADATA_INVALID',
    'CRM_EXPORT_NETWORK_FAILED',
    'CRM_EXPORT_RESPONSE_INVALID',
    'CRM_EXPORT_ROOT_UNAVAILABLE',
    'CRM_EXPORT_SOURCE_REJECTED',
  ]);

  if (sourceIncompleteCodes.has(error.code)) {
    return canonicalError('SOURCE_DATA_INCOMPLETE', error);
  }
  if (bindingCodes.has(error.code)) {
    return canonicalError('WORKSPACE_BINDING_MISMATCH', error);
  }
  if (scopeCodes.has(error.code)) {
    return canonicalError('SCOPE_EXCEEDED', error);
  }
  if (outputPolicyCodes.has(error.code)) {
    return canonicalError('OUTPUT_POLICY_VIOLATION', error);
  }
  if (executionCodes.has(error.code)) {
    return canonicalError('EXECUTION_FAILED', error);
  }
  if (error.code === 'CRM_EXPORT_ENVIRONMENT_UNSUPPORTED') {
    return canonicalError('ENVIRONMENT_UNSUPPORTED', error);
  }
  if (error.code === 'CRM_EXPORT_MODE_UNSUPPORTED') {
    return canonicalError('MODE_UNSUPPORTED', error);
  }
  if (
    error.code === 'CRM_EXPORT_CAPABILITY_MISMATCH' ||
    error.code === 'CRM_EXPORT_CAPABILITY_POLICY_INVALID' ||
    error.code === 'CRM_EXPORT_INVOCATION_INVALID'
  ) {
    return canonicalError('FOUNDATION_INVALID', error);
  }
  return canonicalError('EXECUTION_FAILED', error);
}

function canonicalError(code, error) {
  return new SafeAdapterError(code, error.publicMessage, {
    retryable: error.retryable,
    outcome: error.outcome,
    cause: error,
  });
}

function readClock(clock) {
  const value =
    typeof clock === 'function'
      ? clock()
      : typeof clock?.now === 'function'
        ? clock.now()
        : new Date();
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new SafeAdapterError(
      'CRM_EXPORT_CLOCK_INVALID',
      'El clock del router devolvio una fecha invalida.',
    );
  }
  return date;
}

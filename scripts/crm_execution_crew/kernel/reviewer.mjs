import { issue } from './contracts.mjs';

const ALLOWED_OPERATION_TYPES = new Set([
  'create_record',
  'update_record',
  'create_note',
  'create_task',
  'link_note_to_targets',
  'link_task_to_targets',
  'blocked_operation',
]);

const CREATE_RECORD_OBJECTS = new Set(['company', 'person', 'opportunity']);
const UPDATE_RECORD_OBJECTS = new Set(['company', 'person', 'opportunity', 'task']);

export function reviewCrmOperationPlan({
  request,
  plan,
  effectiveMode,
  applyRequested,
  confirmationProvided,
}) {
  const blockingIssues = [...(plan.validation?.blockingIssues ?? [])];
  const warnings = [...(plan.validation?.warnings ?? [])];
  const requiredConfirmations = [];

  for (const operation of plan.operations) {
    if (!ALLOWED_OPERATION_TYPES.has(operation.type)) {
      blockingIssues.push(
        issue('unknown_operation', `Unknown operation type: ${operation.type}`, {
          operationId: operation.id,
          type: operation.type,
        }),
      );
    }

    if (operation.type === 'blocked_operation') {
      blockingIssues.push(
        issue('blocked_operation', operation.reason, {
          operationId: operation.id,
          sourceOperationIndex: operation.sourceOperationIndex,
        }),
      );
    }

    if (
      ['create_note', 'create_task', 'link_note_to_targets', 'link_task_to_targets'].includes(
        operation.type,
      ) &&
      !hasTarget(operation.target)
    ) {
      blockingIssues.push(
        issue('missing_target', 'Operation has no CRM target.', {
          operationId: operation.id,
        }),
      );
    }

    if (operation.type === 'update_record' && !operation.recordId) {
      blockingIssues.push(
        issue('missing_record_id', 'Update operation has no recordId.', {
          operationId: operation.id,
        }),
      );
    }

    if (
      operation.type === 'create_record' &&
      !CREATE_RECORD_OBJECTS.has(operation.object)
    ) {
      blockingIssues.push(
        issue('unsupported_object', `Create is not supported for ${operation.object}.`, {
          operationId: operation.id,
          object: operation.object,
        }),
      );
    }

    if (
      operation.type === 'update_record' &&
      !UPDATE_RECORD_OBJECTS.has(operation.object)
    ) {
      blockingIssues.push(
        issue('unsupported_object', `Update is not supported for ${operation.object}.`, {
          operationId: operation.id,
          object: operation.object,
        }),
      );
    }

    if (operation.type === 'create_record') {
      validateCreateRecordRequiredFields({ operation, blockingIssues });
    }

    if (operation.type === 'update_record' && !request.constraints.allowUpdate) {
      blockingIssues.push(
        issue('updates_not_allowed', 'Request constraints disallow updates.', {
          operationId: operation.id,
        }),
      );
    }

    if (
      ['create_record', 'create_note', 'create_task'].includes(operation.type) &&
      !request.constraints.allowCreate
    ) {
      blockingIssues.push(
        issue('creates_not_allowed', 'Request constraints disallow creates.', {
          operationId: operation.id,
        }),
      );
    }
  }

  if (request.constraints.allowDelete) {
    warnings.push('allowDelete=true was ignored because deletes are disabled in v1.');
  }
  if (request.constraints.allowMetadataChanges) {
    warnings.push(
      'allowMetadataChanges=true was ignored because metadata mutations are disabled in v1.',
    );
  }

  const affectedRecords = countAffectedRecords(plan.operations);
  if (affectedRecords > request.constraints.maxRecords) {
    blockingIssues.push(
      issue(
        'max_records_exceeded',
        `Plan affects ${affectedRecords} records, above maxRecords=${request.constraints.maxRecords}.`,
        { affectedRecords, maxRecords: request.constraints.maxRecords },
      ),
    );
  }

  if (effectiveMode === 'apply' && !applyRequested) {
    blockingIssues.push(
      issue('apply_not_requested', 'Apply mode requires the --apply flag.'),
    );
  }

  if (
    effectiveMode === 'apply' &&
    request.constraints.requireHumanConfirmation &&
    !confirmationProvided
  ) {
    const confirmation = {
      code: 'human_confirmation_required',
      message: 'Apply requires --yes or an interactive human confirmation.',
    };
    requiredConfirmations.push(confirmation);
    blockingIssues.push(confirmation);
  }

  const dedupedBlockingIssues = dedupeIssues(blockingIssues);

  return {
    agent: 'safety_reviewer_agent',
    approved: dedupedBlockingIssues.length === 0,
    blockingIssues: dedupedBlockingIssues,
    warnings,
    requiredConfirmations,
  };
}

function validateCreateRecordRequiredFields({ operation, blockingIssues }) {
  if (operation.object === 'company' && !operation.data?.name) {
    blockingIssues.push(
      issue('missing_required_field', 'Company creation requires data.name.', {
        operationId: operation.id,
      }),
    );
  }

  if (operation.object === 'person') {
    if (!operation.data?.emails?.primaryEmail) {
      blockingIssues.push(
        issue(
          'missing_required_field',
          'Person creation requires data.emails.primaryEmail.',
          { operationId: operation.id },
        ),
      );
    }
    if (!operation.data?.name?.firstName && !operation.data?.name?.lastName) {
      blockingIssues.push(
        issue('missing_required_field', 'Person creation requires data.name.', {
          operationId: operation.id,
        }),
      );
    }
  }

  if (operation.object === 'opportunity' && !operation.data?.name) {
    blockingIssues.push(
      issue('missing_required_field', 'Opportunity creation requires data.name.', {
        operationId: operation.id,
      }),
    );
  }
}

function countAffectedRecords(operations) {
  const recordKeys = new Set();
  for (const operation of operations) {
    if (operation.type === 'blocked_operation') continue;
    if (operation.recordId) {
      recordKeys.add(`${operation.object}:${operation.recordId}`);
      continue;
    }
    if (
      operation.type === 'create_record' ||
      operation.type === 'create_note' ||
      operation.type === 'create_task'
    ) {
      recordKeys.add(operation.id);
    }
  }
  return recordKeys.size;
}

function hasTarget(target) {
  return Boolean(
    target?.opportunityId ||
      target?.opportunityTempId ||
      target?.personId ||
      target?.personTempId ||
      target?.companyId ||
      target?.companyTempId,
  );
}

function dedupeIssues(issues) {
  const seen = new Set();
  const deduped = [];
  for (const item of issues) {
    const key = `${item.code ?? 'issue'}:${item.message ?? JSON.stringify(item)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

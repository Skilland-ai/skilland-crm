import { issue } from './contracts.mjs';

export function planCrmOperations({
  request,
  metadataArtifact,
  recordArtifact,
  workflowArtifact,
  effectiveMode,
}) {
  const operations = [];
  const blockingIssues = [
    ...(metadataArtifact?.blockingIssues ?? []),
    ...(recordArtifact?.blockingIssues ?? []),
    ...(workflowArtifact?.blockingIssues ?? []),
  ];
  const warnings = [
    ...(metadataArtifact?.warnings ?? []),
    ...(recordArtifact?.warnings ?? []),
    ...(workflowArtifact?.warnings ?? []),
  ];

  if (request.operations.length === 0 && request.requestText) {
    blockingIssues.push(
      issue(
        'needs_structured_operations_v1',
        'Natural language-only requests are not executable in v1; provide operations[].',
      ),
    );
  }

  request.operations.forEach((operation, index) => {
    const resolution = recordArtifact?.operationResolutions?.find(
      (candidate) => candidate.operationIndex === index,
    );

    if (operation.type === 'delete_record') {
      operations.push(blockedOperation(index, 'Deletes are not supported in v1.'));
      return;
    }

    if (operation.type === 'metadata_change') {
      operations.push(
        blockedOperation(index, 'Metadata mutations are not supported in v1.'),
      );
      return;
    }

    if (operation.type === 'create_opportunity') {
      const opportunityTempId = `opportunity:${index}`;
      const data = createOpportunityData({ operation, resolution });

      if (!data.name) {
        operations.push(blockedOperation(index, 'Opportunity name is required.'));
        return;
      }

      operations.push({
        id: operationId(index, 'create-opportunity'),
        type: 'create_record',
        object: 'opportunity',
        data,
        target: resolution?.targetIds ?? {},
        tempId: opportunityTempId,
        via: 'graphql',
        reason: 'Opportunity creation uses Twenty GraphQL createOpportunity.',
        sourceOperationIndex: index,
      });

      const createdTarget = {
        ...(resolution?.targetIds ?? {}),
        opportunityTempId,
      };
      if (operation.note) {
        addNoteOperations({ operations, operation, index, target: createdTarget });
      }
      if (operation.task) {
        addTaskOperations({ operations, operation, index, target: createdTarget });
      }
      return;
    }

    if (operation.type === 'update_opportunity') {
      const opportunityId = resolution?.resolvedRecords?.opportunity?.id;
      if (!opportunityId) {
        operations.push(
          blockedOperation(index, 'No unique opportunity was resolved for update.'),
        );
      } else if (operation.data && Object.keys(operation.data).length > 0) {
        operations.push({
          id: operationId(index, 'update-opportunity'),
          type: 'update_record',
          object: 'opportunity',
          recordId: opportunityId,
          data: operation.data,
          target: resolution.targetIds,
          via: 'graphql',
          reason: 'Opportunity updates use Twenty GraphQL updateOpportunity.',
          sourceOperationIndex: index,
        });
      }

      if (operation.note) {
        addNoteOperations({ operations, operation, index, resolution });
      }
      if (operation.task) {
        addTaskOperations({ operations, operation, index, resolution });
      }
      return;
    }

    if (operation.type === 'update_task') {
      const taskId = resolution?.resolvedRecords?.task?.id;
      if (!taskId) {
        operations.push(
          blockedOperation(index, 'No unique task was resolved for update.'),
        );
        return;
      }

      if (!operation.data || Object.keys(operation.data).length === 0) {
        operations.push(
          blockedOperation(index, 'Task update requires a non-empty data object.'),
        );
        return;
      }

      operations.push({
        id: operationId(index, 'update-task'),
        type: 'update_record',
        object: 'task',
        recordId: taskId,
        data: operation.data,
        target: resolution.targetIds,
        via: 'graphql',
        reason: 'Task updates use Twenty GraphQL updateTask.',
        sourceOperationIndex: index,
      });
      return;
    }

    if (operation.type === 'create_note') {
      addNoteOperations({ operations, operation, index, resolution });
      return;
    }

    if (operation.type === 'create_task') {
      addTaskOperations({ operations, operation, index, resolution });
      return;
    }

    if (operation.type === 'close_task') {
      const taskId = resolution?.resolvedRecords?.task?.id;
      if (!taskId) {
        operations.push(blockedOperation(index, 'No unique task was resolved.'));
        return;
      }

      operations.push({
        id: operationId(index, 'close-task'),
        type: 'update_record',
        object: 'task',
        recordId: taskId,
        data: { status: 'DONE' },
        target: resolution.targetIds,
        via: 'graphql',
        reason: 'Task closure uses Twenty GraphQL updateTask with status DONE.',
        sourceOperationIndex: index,
      });
      return;
    }

    operations.push(blockedOperation(index, `Unsupported operation: ${operation.type}`));
  });

  const validation = {
    metadataChecked: metadataArtifact?.status === 'completed',
    fieldsExist: (metadataArtifact?.unknownFields ?? []).length === 0,
    unknownFields: metadataArtifact?.unknownFields ?? [],
    invalidOptions: metadataArtifact?.invalidOptions ?? [],
    ambiguousLookups: recordArtifact?.ambiguousLookups ?? [],
    missingRecords: recordArtifact?.missingRecords ?? [],
    blockingIssues,
    warnings,
  };

  return {
    requestId: request.requestId,
    requester: request.requester,
    mode: effectiveMode,
    status: blockingIssues.length > 0 ? 'blocked' : 'planned',
    requiresConfirmation: request.constraints.requireHumanConfirmation,
    operations,
    validation,
  };
}

function createOpportunityData({ operation, resolution }) {
  const data = { ...(operation.data ?? {}) };
  const companyId = resolution?.resolvedRecords?.company?.id;
  const personId = resolution?.resolvedRecords?.person?.id;

  if (companyId && !data.companyId && !data.company) {
    data.companyId = companyId;
  }
  if (personId && !data.pointOfContactId && !data.pointOfContact) {
    data.pointOfContactId = personId;
  }

  return data;
}

function addNoteOperations({ operations, operation, index, resolution, target }) {
  const note = operation.note ?? operation;
  const title = note.title ?? 'CRM Execution Crew note';
  const markdown = note.markdown;
  const resolvedTarget = target ?? resolution?.targetIds ?? {};

  if (!markdown) {
    operations.push(blockedOperation(index, 'Note markdown is required.'));
    return;
  }
  if (!hasTarget(resolvedTarget)) {
    operations.push(blockedOperation(index, 'No note target was resolved.'));
    return;
  }

  const tempId = `note:${index}`;
  operations.push({
    id: operationId(index, 'create-note'),
    type: 'create_note',
    title,
    markdown,
    target: resolvedTarget,
    tempId,
    via: 'rest',
    reason: 'Notes are created through REST /notes.',
    sourceOperationIndex: index,
  });
  operations.push({
    id: operationId(index, 'link-note'),
    type: 'link_note_to_targets',
    sourceTempId: tempId,
    target: resolvedTarget,
    via: 'rest',
    reason: 'Note targets are linked through REST /noteTargets.',
    sourceOperationIndex: index,
  });
}

function addTaskOperations({ operations, operation, index, resolution, target }) {
  const task = operation.task ?? operation;
  const resolvedTarget = target ?? resolution?.targetIds ?? {};
  const title = task.title;

  if (!title) {
    operations.push(blockedOperation(index, 'Task title is required.'));
    return;
  }
  if (!hasTarget(resolvedTarget)) {
    operations.push(blockedOperation(index, 'No task target was resolved.'));
    return;
  }

  const tempId = `task:${index}`;
  operations.push({
    id: operationId(index, 'create-task'),
    type: 'create_task',
    title,
    markdown: task.markdown ?? '',
    dueAt: task.dueAt ?? null,
    status: task.status ?? 'TODO',
    assigneeId: task.assigneeId ?? null,
    target: resolvedTarget,
    tempId,
    via: 'rest',
    reason: 'Tasks are created through REST /tasks.',
    sourceOperationIndex: index,
  });
  operations.push({
    id: operationId(index, 'link-task'),
    type: 'link_task_to_targets',
    sourceTempId: tempId,
    target: resolvedTarget,
    via: 'rest',
    reason: 'Task targets are linked through REST /taskTargets.',
    sourceOperationIndex: index,
  });
}

function blockedOperation(sourceOperationIndex, reason) {
  return {
    id: operationId(sourceOperationIndex, 'blocked'),
    type: 'blocked_operation',
    via: 'none',
    reason,
    target: {},
    sourceOperationIndex,
  };
}

function operationId(index, suffix) {
  return `op_${String(index + 1).padStart(3, '0')}_${suffix}`;
}

function hasTarget(target) {
  return Boolean(
    target?.opportunityId ||
      target?.opportunityTempId ||
      target?.personId ||
      target?.companyId,
  );
}

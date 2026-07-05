import { issue } from './contracts.mjs';

const COMPANY_OPERATION_TYPES = new Set([
  'create_company',
  'update_company',
  'upsert_company',
]);

const PERSON_OPERATION_TYPES = new Set([
  'create_person',
  'update_person',
  'upsert_person',
]);

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

    if (COMPANY_OPERATION_TYPES.has(operation.type)) {
      addCompanyOperation({ operations, operation, index, resolution });
      return;
    }

    if (PERSON_OPERATION_TYPES.has(operation.type)) {
      addPersonOperation({ operations, operation, index, resolution });
      return;
    }

    if (operation.type === 'upsert_account_contact_opportunity') {
      addAccountContactOpportunityOperation({
        operations,
        operation,
        index,
        resolution,
      });
      return;
    }

    if (operation.type === 'create_opportunity') {
      addCreateOpportunityOperation({ operations, operation, index, resolution });
      return;
    }

    if (operation.type === 'update_opportunity') {
      addUpdateOpportunityOperation({ operations, operation, index, resolution });
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

function addCompanyOperation({ operations, operation, index, resolution }) {
  const existing = resolution?.resolvedRecords?.company ?? null;
  const data = companyDataWithDefaults(operation.data ?? {}, operation.lookup);

  if (operation.type === 'create_company') {
    if (existing) {
      operations.push(
        blockedOperation(index, 'Company already exists; use upsert_company.'),
      );
      return;
    }
    addCreateCompany({ operations, index, data });
    return;
  }

  if (operation.type === 'update_company') {
    if (!existing) {
      operations.push(
        blockedOperation(index, 'No unique company was resolved for update.'),
      );
      return;
    }
    addUpdateCompany({ operations, index, data, companyId: existing.id });
    return;
  }

  if (existing) {
    if (hasData(data)) {
      addUpdateCompany({ operations, index, data, companyId: existing.id });
    }
    return;
  }

  addCreateCompany({ operations, index, data });
}

function addPersonOperation({ operations, operation, index, resolution }) {
  const existing = resolution?.resolvedRecords?.person ?? null;
  const data = personDataWithDefaults({
    data: operation.data ?? {},
    lookup: operation.lookup,
    companyTarget: resolution?.targetIds ?? {},
  });

  if (operation.type === 'create_person') {
    if (existing) {
      operations.push(
        blockedOperation(index, 'Person already exists; use upsert_person.'),
      );
      return;
    }
    addCreatePerson({ operations, index, data });
    return;
  }

  if (operation.type === 'update_person') {
    if (!existing) {
      operations.push(
        blockedOperation(index, 'No unique person was resolved for update.'),
      );
      return;
    }
    addUpdatePerson({ operations, index, data, personId: existing.id });
    return;
  }

  if (existing) {
    if (hasData(data)) {
      addUpdatePerson({ operations, index, data, personId: existing.id });
    }
    return;
  }

  addCreatePerson({ operations, index, data });
}

function addAccountContactOpportunityOperation({
  operations,
  operation,
  index,
  resolution,
}) {
  const lookup = operation.lookup ?? {};
  const existingCompany = resolution?.resolvedRecords?.company ?? null;
  const existingPerson = resolution?.resolvedRecords?.person ?? null;
  const existingOpportunity = resolution?.resolvedRecords?.opportunity ?? null;

  const companyData = companyDataWithDefaults(
    operation.company?.data ?? {},
    lookup,
  );
  const companyTarget = existingCompany
    ? { companyId: existingCompany.id }
    : { companyTempId: `company:${index}` };

  if (existingCompany) {
    if (hasData(companyData)) {
      addUpdateCompany({
        operations,
        index,
        data: companyData,
        companyId: existingCompany.id,
        suffix: 'upsert-company-update',
      });
    }
  } else {
    addCreateCompany({
      operations,
      index,
      data: companyData,
      tempId: companyTarget.companyTempId,
      suffix: 'upsert-company-create',
    });
  }

  const personData = personDataWithDefaults({
    data: operation.person?.data ?? {},
    lookup,
    companyTarget,
  });
  const personTarget = existingPerson
    ? { personId: existingPerson.id }
    : { personTempId: `person:${index}` };

  if (existingPerson) {
    if (hasData(personData)) {
      addUpdatePerson({
        operations,
        index,
        data: personData,
        personId: existingPerson.id,
        suffix: 'upsert-person-update',
      });
    }
  } else {
    addCreatePerson({
      operations,
      index,
      data: personData,
      tempId: personTarget.personTempId,
      suffix: 'upsert-person-create',
    });
  }

  const opportunityData = opportunityDataWithDefaults({
    data: operation.opportunity?.data ?? {},
    lookup,
    companyTarget,
    personTarget,
  });
  const opportunityTarget = existingOpportunity
    ? { opportunityId: existingOpportunity.id }
    : { opportunityTempId: `opportunity:${index}` };

  if (existingOpportunity) {
    if (hasData(opportunityData)) {
      operations.push({
        id: operationId(index, 'upsert-opportunity-update'),
        type: 'update_record',
        object: 'opportunity',
        recordId: existingOpportunity.id,
        data: opportunityData,
        target: {
          ...companyTarget,
          ...personTarget,
          opportunityId: existingOpportunity.id,
        },
        via: 'graphql',
        reason: 'Wrapper updates the resolved opportunity.',
        sourceOperationIndex: index,
      });
    }
  } else {
    addCreateOpportunityOperation({
      operations,
      operation: {
        ...operation,
        data: opportunityData,
        note: undefined,
        task: undefined,
      },
      index,
      resolution: {
        targetIds: {
          ...companyTarget,
          ...personTarget,
        },
      },
      tempId: opportunityTarget.opportunityTempId,
      suffix: 'upsert-opportunity-create',
    });
  }

  const target = {
    ...companyTarget,
    ...personTarget,
    ...opportunityTarget,
  };

  if (operation.note) {
    addNoteOperations({ operations, operation, index, target });
  }
  if (operation.task) {
    addTaskOperations({ operations, operation, index, target });
  }
}

function addCreateCompany({
  operations,
  index,
  data,
  tempId = `company:${index}`,
  suffix = 'create-company',
}) {
  if (!data.name) {
    operations.push(blockedOperation(index, 'Company creation requires data.name.'));
    return;
  }

  operations.push({
    id: operationId(index, suffix),
    type: 'create_record',
    object: 'company',
    data,
    target: { companyTempId: tempId },
    tempId,
    via: 'graphql',
    reason: 'Company creation uses Twenty GraphQL createCompany.',
    sourceOperationIndex: index,
  });
}

function addUpdateCompany({
  operations,
  index,
  data,
  companyId,
  suffix = 'update-company',
}) {
  if (!hasData(data)) {
    operations.push(
      blockedOperation(index, 'Company update requires a non-empty data object.'),
    );
    return;
  }

  operations.push({
    id: operationId(index, suffix),
    type: 'update_record',
    object: 'company',
    recordId: companyId,
    data,
    target: { companyId },
    via: 'graphql',
    reason: 'Company updates use Twenty GraphQL updateCompany.',
    sourceOperationIndex: index,
  });
}

function addCreatePerson({
  operations,
  index,
  data,
  tempId = `person:${index}`,
  suffix = 'create-person',
}) {
  const missing = missingPersonCreateFields(data);
  if (missing.length) {
    operations.push(
      blockedOperation(
        index,
        `Person creation requires ${missing.join(' and ')}.`,
      ),
    );
    return;
  }

  operations.push({
    id: operationId(index, suffix),
    type: 'create_record',
    object: 'person',
    data,
    target: personTargetFromData(data, { personTempId: tempId }),
    tempId,
    via: 'graphql',
    reason: 'Person creation uses Twenty GraphQL createPerson.',
    sourceOperationIndex: index,
  });
}

function addUpdatePerson({
  operations,
  index,
  data,
  personId,
  suffix = 'update-person',
}) {
  if (!hasData(data)) {
    operations.push(
      blockedOperation(index, 'Person update requires a non-empty data object.'),
    );
    return;
  }

  operations.push({
    id: operationId(index, suffix),
    type: 'update_record',
    object: 'person',
    recordId: personId,
    data,
    target: personTargetFromData(data, { personId }),
    via: 'graphql',
    reason: 'Person updates use Twenty GraphQL updatePerson.',
    sourceOperationIndex: index,
  });
}

function addCreateOpportunityOperation({
  operations,
  operation,
  index,
  resolution,
  tempId = `opportunity:${index}`,
  suffix = 'create-opportunity',
}) {
  const data = createOpportunityData({ operation, resolution });

  if (!data.name) {
    operations.push(blockedOperation(index, 'Opportunity name is required.'));
    return;
  }

  operations.push({
    id: operationId(index, suffix),
    type: 'create_record',
    object: 'opportunity',
    data,
    target: {
      ...(resolution?.targetIds ?? {}),
      opportunityTempId: tempId,
    },
    tempId,
    via: 'graphql',
    reason: 'Opportunity creation uses Twenty GraphQL createOpportunity.',
    sourceOperationIndex: index,
  });

  const createdTarget = {
    ...(resolution?.targetIds ?? {}),
    opportunityTempId: tempId,
  };
  if (operation.note) {
    addNoteOperations({ operations, operation, index, target: createdTarget });
  }
  if (operation.task) {
    addTaskOperations({ operations, operation, index, target: createdTarget });
  }
}

function addUpdateOpportunityOperation({ operations, operation, index, resolution }) {
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
}

function createOpportunityData({ operation, resolution }) {
  const data = { ...(operation.data ?? {}) };
  const companyId = resolution?.resolvedRecords?.company?.id;
  const personId = resolution?.resolvedRecords?.person?.id;
  const companyTempId = resolution?.targetIds?.companyTempId;
  const personTempId = resolution?.targetIds?.personTempId;

  if (companyId && !data.companyId && !data.company) {
    data.companyId = companyId;
  } else if (companyTempId && !data.companyId && !data.company && !data.companyTempId) {
    data.companyTempId = companyTempId;
  }
  if (personId && !data.pointOfContactId && !data.pointOfContact) {
    data.pointOfContactId = personId;
  } else if (
    personTempId &&
    !data.pointOfContactId &&
    !data.pointOfContact &&
    !data.pointOfContactTempId
  ) {
    data.pointOfContactTempId = personTempId;
  }

  return data;
}

function companyDataWithDefaults(data, lookup = {}) {
  const output = { ...data };
  if (!output.name && lookup.companyName) {
    output.name = lookup.companyName;
  }
  return output;
}

function personDataWithDefaults({ data, lookup = {}, companyTarget = {} }) {
  const output = { ...data };

  if (!output.emails && lookup.personEmail) {
    output.emails = {
      primaryEmail: lookup.personEmail,
      additionalEmails: [],
    };
  }

  if (companyTarget.companyId && !output.company && !output.companyId) {
    output.companyId = companyTarget.companyId;
  } else if (
    companyTarget.companyTempId &&
    !output.company &&
    !output.companyId &&
    !output.companyTempId
  ) {
    output.companyTempId = companyTarget.companyTempId;
  }

  return output;
}

function opportunityDataWithDefaults({
  data,
  lookup = {},
  companyTarget = {},
  personTarget = {},
}) {
  const output = { ...data };
  if (!output.name && lookup.opportunityName) {
    output.name = lookup.opportunityName;
  }
  if (companyTarget.companyId && !output.company && !output.companyId) {
    output.companyId = companyTarget.companyId;
  } else if (
    companyTarget.companyTempId &&
    !output.company &&
    !output.companyId &&
    !output.companyTempId
  ) {
    output.companyTempId = companyTarget.companyTempId;
  }
  if (personTarget.personId && !output.pointOfContact && !output.pointOfContactId) {
    output.pointOfContactId = personTarget.personId;
  } else if (
    personTarget.personTempId &&
    !output.pointOfContact &&
    !output.pointOfContactId &&
    !output.pointOfContactTempId
  ) {
    output.pointOfContactTempId = personTarget.personTempId;
  }
  return output;
}

function missingPersonCreateFields(data) {
  const missing = [];
  if (!data.emails?.primaryEmail) missing.push('emails.primaryEmail');
  if (!data.name?.firstName && !data.name?.lastName) missing.push('name');
  return missing;
}

function personTargetFromData(data, baseTarget) {
  return {
    ...baseTarget,
    companyId: data.companyId,
    companyTempId: data.companyTempId,
  };
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

function hasData(data) {
  return Boolean(data && Object.keys(data).length > 0);
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

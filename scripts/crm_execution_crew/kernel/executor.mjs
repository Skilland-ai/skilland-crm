export async function executeOperationPlan({ client, plan, apply }) {
  const operations = [];
  const tempIds = new Map();
  const errors = [];

  for (const operation of plan.operations) {
    if (!apply) {
      operations.push({ operationId: operation.id, status: 'planned', operation });
      continue;
    }

    try {
      const result = await executeOperation({ client, operation, tempIds });
      operations.push({ operationId: operation.id, status: 'applied', result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ operationId: operation.id, message });
      operations.push({ operationId: operation.id, status: 'failed', error: message });
    }
  }

  return {
    requestId: plan.requestId,
    mode: apply ? 'apply' : 'dry_run',
    status: errors.length
      ? 'failed'
      : apply
        ? 'apply_completed'
        : 'dry_run_completed',
    operations,
    summary: {
      planned: apply ? 0 : operations.length,
      applied: operations.filter((operation) => operation.status === 'applied').length,
      failed: errors.length,
    },
    errors,
  };
}

async function executeOperation({ client, operation, tempIds }) {
  if (operation.type === 'create_record' && operation.object === 'company') {
    const data = await client.gql(
      `mutation CrmExecutionCreateCompany($data: CompanyCreateInput!) {
        createCompany(data: $data) { id name }
      }`,
      { data: resolveDataReferences(operation.data, operation.object, tempIds) },
    );
    const companyId = data.createCompany?.id;
    if (!companyId) {
      throw new Error(`Company id missing: ${JSON.stringify(data).slice(0, 500)}`);
    }
    if (operation.tempId) tempIds.set(operation.tempId, companyId);
    return data.createCompany;
  }

  if (operation.type === 'update_record' && operation.object === 'company') {
    const data = await client.gql(
      `mutation CrmExecutionUpdateCompany($id: UUID!, $data: CompanyUpdateInput!) {
        updateCompany(id: $id, data: $data) { id name }
      }`,
      {
        id: operation.recordId,
        data: resolveDataReferences(operation.data, operation.object, tempIds),
      },
    );
    return data.updateCompany;
  }

  if (operation.type === 'create_record' && operation.object === 'person') {
    const data = await client.gql(
      `mutation CrmExecutionCreatePerson($data: PersonCreateInput!) {
        createPerson(data: $data) {
          id
          name { firstName lastName }
          emails { primaryEmail additionalEmails }
        }
      }`,
      { data: resolveDataReferences(operation.data, operation.object, tempIds) },
    );
    const personId = data.createPerson?.id;
    if (!personId) {
      throw new Error(`Person id missing: ${JSON.stringify(data).slice(0, 500)}`);
    }
    if (operation.tempId) tempIds.set(operation.tempId, personId);
    return data.createPerson;
  }

  if (operation.type === 'update_record' && operation.object === 'person') {
    const data = await client.gql(
      `mutation CrmExecutionUpdatePerson($id: UUID!, $data: PersonUpdateInput!) {
        updatePerson(id: $id, data: $data) {
          id
          name { firstName lastName }
          emails { primaryEmail additionalEmails }
        }
      }`,
      {
        id: operation.recordId,
        data: resolveDataReferences(operation.data, operation.object, tempIds),
      },
    );
    return data.updatePerson;
  }

  if (operation.type === 'create_record' && operation.object === 'opportunity') {
    const data = await client.gql(
      `mutation CrmExecutionCreateOpportunity($data: OpportunityCreateInput!) {
        createOpportunity(data: $data) { id name }
      }`,
      { data: resolveDataReferences(operation.data, operation.object, tempIds) },
    );
    const opportunityId = data.createOpportunity?.id;
    if (!opportunityId) {
      throw new Error(`Opportunity id missing: ${JSON.stringify(data).slice(0, 500)}`);
    }
    if (operation.tempId) tempIds.set(operation.tempId, opportunityId);
    return data.createOpportunity;
  }

  if (operation.type === 'update_record' && operation.object === 'opportunity') {
    const data = await client.gql(
      `mutation CrmExecutionUpdateOpportunity($id: UUID!, $data: OpportunityUpdateInput!) {
        updateOpportunity(id: $id, data: $data) { id name }
      }`,
      {
        id: operation.recordId,
        data: resolveDataReferences(operation.data, operation.object, tempIds),
      },
    );
    return data.updateOpportunity;
  }

  if (operation.type === 'update_record' && operation.object === 'task') {
    const data = await client.gql(
      `mutation CrmExecutionUpdateTask($id: UUID!, $data: TaskUpdateInput!) {
        updateTask(id: $id, data: $data) { id title status }
      }`,
      { id: operation.recordId, data: operation.data },
    );
    return data.updateTask;
  }

  if (operation.type === 'create_note') {
    const note = await client.rest('/notes', {
      method: 'POST',
      body: JSON.stringify({
        title: operation.title,
        bodyV2: { markdown: operation.markdown, blocknote: null },
      }),
    });
    const noteId = note.data?.createNote?.id;
    if (!noteId) throw new Error(`Note id missing: ${JSON.stringify(note).slice(0, 500)}`);
    if (operation.tempId) tempIds.set(operation.tempId, noteId);
    return { id: noteId, title: operation.title };
  }

  if (operation.type === 'create_task') {
    const createStatus = operation.status === 'DONE' ? 'TODO' : operation.status ?? 'TODO';
    const payload = {
      title: operation.title,
      status: createStatus,
      bodyV2: { markdown: operation.markdown ?? '', blocknote: null },
    };
    if (operation.dueAt) payload.dueAt = operation.dueAt;
    if (operation.assigneeId) payload.assigneeId = operation.assigneeId;

    const task = await client.rest('/tasks', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const taskId = task.data?.createTask?.id;
    if (!taskId) throw new Error(`Task id missing: ${JSON.stringify(task).slice(0, 500)}`);
    if (operation.tempId) tempIds.set(operation.tempId, taskId);
    if (operation.status && operation.status !== createStatus) {
      await client.gql(
        `mutation CrmExecutionFinalizeCreatedTask($id: UUID!, $data: TaskUpdateInput!) {
          updateTask(id: $id, data: $data) { id title status dueAt }
        }`,
        { id: taskId, data: { status: operation.status } },
      );
    }
    return { id: taskId, title: operation.title, status: operation.status ?? createStatus };
  }

  if (operation.type === 'link_note_to_targets') {
    const noteId = tempIds.get(operation.sourceTempId) ?? operation.noteId;
    if (!noteId) throw new Error(`Missing note id for ${operation.id}`);
    return linkTargets({
      client,
      tempIds,
      pathName: '/noteTargets',
      idName: 'noteId',
      idValue: noteId,
      target: operation.target,
    });
  }

  if (operation.type === 'link_task_to_targets') {
    const taskId = tempIds.get(operation.sourceTempId) ?? operation.taskId;
    if (!taskId) throw new Error(`Missing task id for ${operation.id}`);
    return linkTargets({
      client,
      tempIds,
      pathName: '/taskTargets',
      idName: 'taskId',
      idValue: taskId,
      target: operation.target,
    });
  }

  return { skipped: true, reason: `Unsupported operation ${operation.type}` };
}

function resolveDataReferences(data, object, tempIds) {
  const resolved = { ...(data ?? {}) };

  if (object === 'person') {
    const companyId =
      resolved.companyId ??
      (resolved.companyTempId ? tempIds.get(resolved.companyTempId) : null);
    if (resolved.companyTempId && !companyId) {
      throw new Error(`Missing company id for ${resolved.companyTempId}`);
    }
    delete resolved.companyId;
    delete resolved.companyTempId;
    if (companyId && !resolved.company) {
      resolved.company = {
        connect: {
          where: {
            id: companyId,
          },
        },
      };
    }
  }

  if (object === 'opportunity') {
    if (resolved.companyTempId) {
      const companyId = tempIds.get(resolved.companyTempId);
      if (!companyId) throw new Error(`Missing company id for ${resolved.companyTempId}`);
      if (!resolved.companyId && !resolved.company) {
        resolved.companyId = companyId;
      }
      delete resolved.companyTempId;
    }
    if (resolved.pointOfContactTempId) {
      const personId = tempIds.get(resolved.pointOfContactTempId);
      if (!personId) {
        throw new Error(`Missing person id for ${resolved.pointOfContactTempId}`);
      }
      if (!resolved.pointOfContactId && !resolved.pointOfContact) {
        resolved.pointOfContactId = personId;
      }
      delete resolved.pointOfContactTempId;
    }
  }

  return resolved;
}

async function linkTargets({ client, tempIds, pathName, idName, idValue, target }) {
  const resolvedTarget = resolveTargetReferences({ target, tempIds });
  const bodies = [
    resolvedTarget.opportunityId
      ? { [idName]: idValue, targetOpportunityId: resolvedTarget.opportunityId }
      : null,
    resolvedTarget.personId ? { [idName]: idValue, targetPersonId: resolvedTarget.personId } : null,
    resolvedTarget.companyId ? { [idName]: idValue, targetCompanyId: resolvedTarget.companyId } : null,
  ].filter(Boolean);
  const linked = [];

  for (const body of bodies) {
    const response = await client.rest(pathName, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    linked.push(response.data ?? response);
  }

  return { linked: linked.length };
}

function resolveTargetReferences({ target = {}, tempIds }) {
  const resolvedTarget = {
    ...target,
    opportunityId:
      target.opportunityId ??
      (target.opportunityTempId ? tempIds.get(target.opportunityTempId) : null),
    personId:
      target.personId ??
      (target.personTempId ? tempIds.get(target.personTempId) : null),
    companyId:
      target.companyId ??
      (target.companyTempId ? tempIds.get(target.companyTempId) : null),
  };
  if (target.opportunityTempId && !resolvedTarget.opportunityId) {
    throw new Error(`Missing opportunity id for ${target.opportunityTempId}`);
  }
  if (target.personTempId && !resolvedTarget.personId) {
    throw new Error(`Missing person id for ${target.personTempId}`);
  }
  if (target.companyTempId && !resolvedTarget.companyId) {
    throw new Error(`Missing company id for ${target.companyTempId}`);
  }
  return resolvedTarget;
}

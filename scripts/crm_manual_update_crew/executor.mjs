export async function executeOperations({ client, deal, operations, apply }) {
  const results = [];

  for (const operation of operations) {
    if (!apply) {
      results.push({ operation, status: 'planned' });
      continue;
    }

    if (operation.type === 'update_deal') {
      const data = await client.gql(
        `mutation CrmManualUpdateOpportunity($id: UUID!, $data: OpportunityUpdateInput!) {
          updateOpportunity(id: $id, data: $data) {
            id
            name
          }
        }`,
        { id: operation.opportunityId, data: operation.data },
      );
      results.push({
        operation,
        status: 'applied',
        result: data.updateOpportunity,
      });
      continue;
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
      if (!noteId) throw new Error(`Note id missing: ${JSON.stringify(note)}`);
      await linkNote(client, noteId, deal);
      results.push({
        operation,
        status: 'applied',
        result: { id: noteId, title: operation.title },
      });
      continue;
    }

    if (operation.type === 'create_task') {
      const payload = {
        title: operation.title,
        status: 'TODO',
        bodyV2: { markdown: operation.markdown, blocknote: null },
      };
      if (operation.dueAt) payload.dueAt = operation.dueAt;

      const task = await client.rest('/tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const taskId = task.data?.createTask?.id;
      if (!taskId) throw new Error(`Task id missing: ${JSON.stringify(task)}`);
      await linkTask(client, taskId, deal);
      results.push({
        operation,
        status: 'applied',
        result: { id: taskId, title: operation.title },
      });
      continue;
    }

    if (operation.type === 'close_task') {
      const data = await client.gql(
        `mutation CrmManualCloseTask($id: UUID!, $data: TaskUpdateInput!) {
          updateTask(id: $id, data: $data) {
            id
            title
            status
          }
        }`,
        { id: operation.taskId, data: { status: 'DONE' } },
      );
      results.push({
        operation,
        status: 'applied',
        result: data.updateTask,
      });
      continue;
    }

    results.push({ operation, status: 'skipped', reason: 'unknown operation' });
  }

  return results;
}

async function linkNote(client, noteId, deal) {
  for (const body of targetBodies({ noteId }, deal)) {
    await client.rest('/noteTargets', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}

async function linkTask(client, taskId, deal) {
  for (const body of targetBodies({ taskId }, deal)) {
    await client.rest('/taskTargets', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}

function targetBodies(base, deal) {
  return [
    { ...base, targetOpportunityId: deal.id },
    deal.pointOfContact?.id
      ? { ...base, targetPersonId: deal.pointOfContact.id }
      : null,
    deal.company?.id ? { ...base, targetCompanyId: deal.company.id } : null,
  ].filter(Boolean);
}


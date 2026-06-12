export function formatCrewResult(result) {
  const lines = [];
  lines.push('CRM Execution Crew');
  lines.push(`Mode: ${result.effectiveMode}`);
  lines.push(`Status: ${result.status}`);
  lines.push(`Request: ${result.requestId}`);
  lines.push(`Log: ${result.logPath}`);

  if (result.review?.blockingIssues?.length) {
    lines.push('\nBlocking issues:');
    for (const issue of result.review.blockingIssues) {
      lines.push(`- ${issue.code ?? 'issue'}: ${issue.message ?? JSON.stringify(issue)}`);
    }
  }

  if (result.operationPlan?.operations?.length) {
    lines.push('\nOperations:');
    for (const operation of result.operationPlan.operations) {
      lines.push(`- ${operationSummary(operation)}`);
    }
  }

  if (result.executionResult?.summary) {
    lines.push(`\nSummary: ${JSON.stringify(result.executionResult.summary)}`);
  }

  return lines.join('\n');
}

export function operationSummary(operation) {
  if (operation.type === 'create_record') {
    return `Create ${operation.object}: ${JSON.stringify(operation.data)}`;
  }
  if (operation.type === 'update_record') {
    return `Update ${operation.object} ${operation.recordId}: ${JSON.stringify(operation.data)}`;
  }
  if (operation.type === 'create_note') {
    return `Create note "${operation.title}"`;
  }
  if (operation.type === 'create_task') {
    return `Create task "${operation.title}"`;
  }
  if (operation.type === 'link_note_to_targets') {
    return `Link note to ${targetSummary(operation.target)}`;
  }
  if (operation.type === 'link_task_to_targets') {
    return `Link task to ${targetSummary(operation.target)}`;
  }
  if (operation.type === 'blocked_operation') {
    return `Blocked: ${operation.reason}`;
  }
  return JSON.stringify(operation);
}

function targetSummary(target = {}) {
  return Object.entries(target)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
}

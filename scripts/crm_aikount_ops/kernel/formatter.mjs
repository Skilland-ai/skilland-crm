export function formatAikountOpsResult(result) {
  const lines = [];
  lines.push('CRM AIKount Ops');
  lines.push(`Mode: ${result.effectiveMode}`);
  lines.push(`Status: ${result.status}`);
  lines.push(`Request: ${result.requestId}`);
  lines.push(`Action: ${result.request.action}`);
  lines.push(`Log: ${result.logPath}`);
  lines.push(`Review: ${result.reviewPath}`);

  if (result.request.container?.itemIds?.length) {
    lines.push(`Container items: ${result.request.container.itemIds.join(', ')}`);
    lines.push(`Container source: ${result.request.container.sourceMode ?? 'unknown'}`);
  }

  if (result.crmSnapshot) {
    lines.push(
      `Deal: ${result.crmSnapshot.name} (${result.crmSnapshot.opportunityId})`,
    );
  }

  if (result.review?.blockingIssues?.length) {
    lines.push('\nBlocking issues:');
    for (const item of result.review.blockingIssues) {
      lines.push(`- ${item.code ?? 'issue'}: ${item.message}`);
    }
  }

  if (result.operationPlan?.warnings?.length) {
    lines.push('\nWarnings:');
    for (const warning of result.operationPlan.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (result.operationPlan?.operations?.length) {
    lines.push('\nOperations:');
    for (const operation of result.operationPlan.operations) {
      lines.push(`- ${operationSummary(operation)}`);
    }
  }

  if (result.executionResult?.outputs?.share) {
    lines.push('\nShare output:');
    lines.push(`- URL: ${result.executionResult.outputs.share.url}`);
    lines.push(`- PDF: ${result.executionResult.outputs.share.pdf_url}`);
  }

  return lines.join('\n');
}

export function operationSummary(operation) {
  if (operation.type === 'create_contact') {
    return `Create AIKount contact "${operation.body.name}"`;
  }
  if (operation.type === 'create_quote' || operation.type === 'create_invoice') {
    return `${operation.type.replace('_', ' ')} with ${operation.body.lines.length} line(s)`;
  }
  if (operation.type === 'update_quote' || operation.type === 'update_invoice') {
    return `${operation.type.replace('_', ' ')} ${operation.documentId ?? operation.documentFromOpId}`;
  }
  if (
    operation.type === 'send_quote' ||
    operation.type === 'accept_quote' ||
    operation.type === 'reject_quote' ||
    operation.type === 'convert_quote_to_invoice' ||
    operation.type === 'issue_invoice' ||
    operation.type === 'share_invoice' ||
    operation.type === 'send_invoice'
  ) {
    return `${operation.type.replace(/_/g, ' ')} ${
      operation.documentId ?? operation.documentFromOpId
    }`;
  }
  return JSON.stringify(operation);
}

export function renderReviewMarkdown(result) {
  const lines = [];
  lines.push('# CRM AIKount Ops Review');
  lines.push('');
  lines.push(`- Request: \`${result.requestId}\``);
  lines.push(`- Action: \`${result.request.action}\``);
  lines.push(`- Mode: \`${result.effectiveMode}\``);
  lines.push(`- Status: \`${result.status}\``);
  if (result.request.container?.itemIds?.length) {
    lines.push(`- Container items: \`${result.request.container.itemIds.join(', ')}\``);
    lines.push(`- Container source: \`${result.request.container.sourceMode ?? 'unknown'}\``);
  }
  if (result.crmSnapshot) {
    lines.push(`- Deal: \`${result.crmSnapshot.name}\``);
  }
  lines.push('');

  if (result.review?.blockingIssues?.length) {
    lines.push('## Blocking Issues');
    lines.push('');
    for (const item of result.review.blockingIssues) {
      lines.push(`- \`${item.code ?? 'issue'}\`: ${item.message}`);
    }
    lines.push('');
  }

  if (result.operationPlan?.warnings?.length) {
    lines.push('## Warnings');
    lines.push('');
    for (const warning of result.operationPlan.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }

  if (result.operationPlan?.operations?.length) {
    lines.push('## Planned Operations');
    lines.push('');
    for (const operation of result.operationPlan.operations) {
      lines.push(`- ${operationSummary(operation)}`);
    }
    lines.push('');
  }

  if (result.executionResult?.summary) {
    lines.push('## Execution Summary');
    lines.push('');
    for (const [key, value] of Object.entries(result.executionResult.summary)) {
      lines.push(`- ${key}: ${JSON.stringify(value)}`);
    }
    lines.push('');
  }

  if (result.executionResult?.outputs?.share) {
    lines.push('## Share Output');
    lines.push('');
    lines.push(`- URL: ${result.executionResult.outputs.share.url}`);
    lines.push(`- PDF URL: ${result.executionResult.outputs.share.pdf_url}`);
    lines.push('');
  }

  return lines.join('\n');
}

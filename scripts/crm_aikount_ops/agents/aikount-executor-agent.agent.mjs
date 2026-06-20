import { executeAikountOperationPlan } from '../kernel/executor.mjs';
import { resolveOrPrepareContact } from '../kernel/contact-resolver.mjs';
import { selectDocumentForAction } from '../kernel/document-selection.mjs';
import { loadRegistry, recordSession, saveRegistry } from '../kernel/registry.mjs';
import { issue } from '../kernel/contracts.mjs';
import { runAikountDocumentInterviewSkill } from '../skills/aikount-document-interview.skill.mjs';
import { runAikountOpenApiLiveSkill } from '../skills/aikount-openapi-live.skill.mjs';
import { runAikountOperationPlanningSkill } from '../skills/aikount-operation-planning.skill.mjs';
import { runAikountSafeExecutionSkill } from '../skills/aikount-safe-execution.skill.mjs';

export async function runAikountExecutorAgent({
  client,
  request,
  crmSnapshot,
  effectiveMode,
  confirmationProvided = false,
  interviewer = null,
  outputDir,
}) {
  const registry = loadRegistry(outputDir);
  const preflightArtifact = await runAikountOpenApiLiveSkill({
    client,
    action: request.action,
  });
  if (preflightArtifact.blockingIssues.length) {
    return blocked(preflightArtifact, registry, outputDir, request, crmSnapshot);
  }

  const selection = await selectDocumentForAction({
    request,
    registry,
    crmSnapshot,
    interviewer,
  });
  if (selection.blockingIssues.length) {
    return blocked(selection, registry, outputDir, request, crmSnapshot);
  }

  const targetDocument = selection.targetDocumentId
    ? await fetchTargetDocument({ client, request, documentId: selection.targetDocumentId })
    : null;

  const interviewArtifact = await runAikountDocumentInterviewSkill({
    request,
    crmSnapshot,
    masterData: {
      taxes: preflightArtifact.taxes,
      numbering: preflightArtifact.numbering,
    },
    selection,
    targetDocument,
    interviewer,
  });
  if (interviewArtifact.blockingIssues.length) {
    return blocked(interviewArtifact, registry, outputDir, request, crmSnapshot);
  }

  const needsContact = ['create_quote', 'create_invoice'].includes(request.action);
  const contactResolution = needsContact
    ? await resolveOrPrepareContact({
        client,
        registry,
        crmSnapshot,
        contactOverrides: interviewArtifact.interviewData.contact,
        interviewer,
      })
    : null;

  const planningArtifact = await runAikountOperationPlanningSkill({
    request,
    crmSnapshot,
    targetDocument,
    selectedMapping: selection.selectedMapping,
    contactResolution,
    interviewData: interviewArtifact.interviewData,
  });

  let reviewArtifact = await runAikountSafeExecutionSkill({
    request,
    plan: planningArtifact.operationPlan,
    effectiveMode,
    confirmationProvided,
    targetDocument,
  });

  if (
    reviewArtifact.review?.blockingIssues?.length === 1 &&
    reviewArtifact.review.blockingIssues[0].code === 'human_confirmation_required' &&
    interviewer?.confirm
  ) {
    const confirmed = await interviewer.confirm(
      'El plan ya está listo. Confirmas la ejecución APPLY?',
      { defaultValue: false },
    );
    if (confirmed) {
      reviewArtifact = await runAikountSafeExecutionSkill({
        request,
        plan: planningArtifact.operationPlan,
        effectiveMode,
        confirmationProvided: true,
        targetDocument,
      });
    }
  }

  const executionResult = await executeAikountOperationPlan({
    client,
    plan: planningArtifact.operationPlan,
    effectiveMode,
    review: reviewArtifact.review,
    registry,
    crmSnapshot,
    request,
  });

  recordSession(registry, {
    requestId: request.requestId,
    action: request.action,
    status: executionResult.status,
    dealId: crmSnapshot.opportunityId,
    finishedAt: new Date().toISOString(),
  });
  const registryPath = saveRegistry(outputDir, registry);

  return {
    agent: 'aikount_executor_agent',
    status: reviewArtifact.review.approved ? executionResult.status : 'blocked',
    warnings: [
      ...(preflightArtifact.warnings ?? []),
      ...(interviewArtifact.warnings ?? []),
      ...(planningArtifact.warnings ?? []),
      ...(reviewArtifact.warnings ?? []),
      ...(contactResolution?.warnings ?? []),
      ...(selection.warnings ?? []),
    ],
    blockingIssues: reviewArtifact.blockingIssues ?? [],
    preflightArtifact,
    interviewArtifact,
    planningArtifact,
    reviewArtifact,
    executionResult,
    targetDocument,
    contactResolution,
    registryPath,
  };
}

async function fetchTargetDocument({ client, request, documentId }) {
  if (
    [
      'create_quote',
      'update_quote',
      'send_quote',
      'accept_quote',
      'reject_quote',
      'convert_quote_to_invoice',
    ].includes(request.action)
  ) {
    return client.getQuote(documentId);
  }
  return client.getInvoice(documentId);
}

function blocked(source, registry, outputDir, request, crmSnapshot) {
  recordSession(registry, {
    requestId: request.requestId,
    action: request.action,
    status: 'blocked',
    dealId: crmSnapshot.opportunityId,
    finishedAt: new Date().toISOString(),
  });
  const registryPath = saveRegistry(outputDir, registry);
  return {
    agent: 'aikount_executor_agent',
    status: 'blocked',
    warnings: source.warnings ?? [],
    blockingIssues: source.blockingIssues ?? [
      issue('executor_blocked', 'Unknown blocking issue.'),
    ],
    preflightArtifact: source.preflightArtifact ?? null,
    interviewArtifact: source.interviewArtifact ?? null,
    planningArtifact: source.planningArtifact ?? null,
    reviewArtifact: source.reviewArtifact ?? null,
    executionResult: {
      status: 'blocked',
      summary: { executedOperations: 0 },
      outputs: {},
    },
    targetDocument: null,
    contactResolution: null,
    registryPath,
  };
}

import { runApiPlannerAgent } from '../agents/api-planner-agent.agent.mjs';
import { runDocsAgent } from '../agents/docs-agent.agent.mjs';
import { runExecutionAgent } from '../agents/execution-agent.agent.mjs';
import { runMetadataAgent } from '../agents/metadata-agent.agent.mjs';
import { runOrchestratorAgent } from '../agents/orchestrator.agent.mjs';
import { runRecordResolverAgent } from '../agents/record-resolver-agent.agent.mjs';
import { runSafetyReviewerAgent } from '../agents/safety-reviewer-agent.agent.mjs';
import { runWorkflowSpecialistAgent } from '../agents/workflow-specialist-agent.agent.mjs';
import { CrmExecutionLogger } from '../kernel/logger.mjs';

export async function runCrmExecutionCrew({
  request,
  client,
  effectiveMode = 'dry_run',
  applyRequested = false,
  confirmationProvided = false,
  canRequestConfirmation = null,
  outputDir,
  logger = new CrmExecutionLogger({ outputDir }),
}) {
  const agentArtifacts = [];

  const orchestratorArtifact = await runOrchestratorAgent({
    request,
    effectiveMode,
    agenticMode: true,
  });
  agentArtifacts.push(orchestratorArtifact);

  const docsArtifact = await runDocsAgent({ request });
  agentArtifacts.push(docsArtifact);

  const workflowArtifact = await runWorkflowSpecialistAgent({
    request,
    docsArtifact,
  });
  agentArtifacts.push(workflowArtifact);

  const metadataArtifact = await runMetadataAgent({ client, request });
  agentArtifacts.push(metadataArtifact);

  const recordArtifact = await runRecordResolverAgent({ client, request });
  agentArtifacts.push(recordArtifact);

  const plannerArtifact = await runApiPlannerAgent({
    request,
    metadataArtifact,
    recordArtifact,
    workflowArtifact,
    effectiveMode,
  });
  agentArtifacts.push(plannerArtifact);

  const operationPlan = plannerArtifact.operationPlan;
  let review = await runSafetyReviewerAgent({
    request,
    plan: operationPlan,
    effectiveMode,
    applyRequested,
    confirmationProvided,
  });
  agentArtifacts.push(review);

  if (
    needsOnlyHumanConfirmation(review) &&
    typeof canRequestConfirmation === 'function'
  ) {
    const confirmed = await canRequestConfirmation({ request, operationPlan, review });
    if (confirmed) {
      review = await runSafetyReviewerAgent({
        request,
        plan: operationPlan,
        effectiveMode,
        applyRequested,
        confirmationProvided: true,
      });
      agentArtifacts.push({ ...review, status: 'completed_after_confirmation' });
    }
  }

  const executionArtifact = await runExecutionAgent({
    client,
    plan: operationPlan,
    review,
    effectiveMode,
  });
  agentArtifacts.push(executionArtifact);

  const executionResult = executionArtifact.result;
  const status = review.approved ? executionResult.status : 'blocked';
  const warnings = collectWarnings(agentArtifacts);
  const blockingIssues = collectBlockingIssues(agentArtifacts);
  const logPath = logger.finish({
    requestId: request.requestId,
    requester: request.requester,
    effectiveMode,
    request,
    agentArtifacts,
    operationPlan,
    review,
    executionResult,
    warnings,
    blockingIssues,
  });

  return {
    requestId: request.requestId,
    requester: request.requester,
    effectiveMode,
    status,
    agentArtifacts,
    operationPlan,
    review,
    executionResult,
    warnings,
    blockingIssues,
    logPath,
  };
}

function needsOnlyHumanConfirmation(review) {
  const blockers = review.blockingIssues ?? [];
  return (
    blockers.length > 0 &&
    blockers.every((blocker) => blocker.code === 'human_confirmation_required')
  );
}

function collectWarnings(artifacts) {
  return artifacts.flatMap((artifact) => artifact.warnings ?? []);
}

function collectBlockingIssues(artifacts) {
  return artifacts.flatMap((artifact) => artifact.blockingIssues ?? []);
}


import { runAikountExecutorAgent } from '../agents/aikount-executor-agent.agent.mjs';
import { runCrmContextAgent } from '../agents/crm-context-agent.agent.mjs';
import { runOrchestratorAgent } from '../agents/orchestrator.agent.mjs';

export async function runCrmAikountOps({
  request,
  twentyClient,
  aikountClient,
  effectiveMode = 'dry_run',
  confirmationProvided = false,
  interviewer = null,
  outputDir,
}) {
  const agentArtifacts = [];

  const orchestratorArtifact = await runOrchestratorAgent({
    request,
    effectiveMode,
  });
  agentArtifacts.push(orchestratorArtifact);

  const crmContextArtifact = await runCrmContextAgent({
    client: twentyClient,
    request,
    interviewer,
  });
  agentArtifacts.push(crmContextArtifact);

  if (crmContextArtifact.blockingIssues.length) {
    return {
      status: 'blocked',
      agentArtifacts,
      crmSnapshot: null,
      operationPlan: null,
      review: null,
      executionResult: {
        status: 'blocked',
        summary: { executedOperations: 0 },
        outputs: {},
      },
      warnings: collectWarnings(agentArtifacts),
      blockingIssues: collectBlockingIssues(agentArtifacts),
      request,
    };
  }

  const executorArtifact = await runAikountExecutorAgent({
    client: aikountClient,
    request,
    crmSnapshot: crmContextArtifact.crmSnapshot,
    effectiveMode,
    confirmationProvided,
    interviewer,
    outputDir,
  });
  agentArtifacts.push(executorArtifact);

  return {
    status: executorArtifact.status,
    agentArtifacts,
    crmSnapshot: crmContextArtifact.crmSnapshot,
    operationPlan: executorArtifact.planningArtifact?.operationPlan ?? null,
    review: executorArtifact.reviewArtifact?.review ?? null,
    executionResult: executorArtifact.executionResult,
    warnings: collectWarnings(agentArtifacts),
    blockingIssues: collectBlockingIssues(agentArtifacts),
    request,
  };
}

function collectWarnings(artifacts) {
  return artifacts.flatMap((artifact) => artifact.warnings ?? []);
}

function collectBlockingIssues(artifacts) {
  return artifacts.flatMap((artifact) => artifact.blockingIssues ?? []);
}

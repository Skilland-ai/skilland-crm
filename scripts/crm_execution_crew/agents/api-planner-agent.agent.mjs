import { agentArtifact } from '../kernel/contracts.mjs';
import { planCrmOperations } from '../kernel/planner.mjs';

export async function runApiPlannerAgent({
  request,
  metadataArtifact,
  recordArtifact,
  workflowArtifact,
  effectiveMode,
}) {
  const operationPlan = planCrmOperations({
    request,
    metadataArtifact,
    recordArtifact,
    workflowArtifact,
    effectiveMode,
  });

  return agentArtifact({
    agent: 'api_operation_planner_agent',
    status: operationPlan.status === 'blocked' ? 'completed_with_blockers' : 'completed',
    operationPlan,
    decisions: operationPlan.operations.map((operation) => ({
      operationId: operation.id,
      via: operation.via,
      reason: operation.reason,
    })),
    warnings: operationPlan.validation.warnings,
    blockingIssues: operationPlan.validation.blockingIssues,
  });
}


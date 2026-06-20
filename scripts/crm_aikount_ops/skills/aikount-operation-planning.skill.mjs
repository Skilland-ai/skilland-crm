import { agentArtifact } from '../kernel/contracts.mjs';
import { planAikountOperations } from '../kernel/planner.mjs';

export async function runAikountOperationPlanningSkill(input) {
  const plan = planAikountOperations(input);
  return agentArtifact({
    agent: 'aikount_operation_planning_skill',
    status: plan.validation.blockingIssues.length ? 'blocked' : 'completed',
    warnings: plan.warnings,
    blockingIssues: plan.validation.blockingIssues,
    operationPlan: plan,
  });
}

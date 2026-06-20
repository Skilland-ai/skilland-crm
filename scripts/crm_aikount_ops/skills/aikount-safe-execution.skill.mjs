import { agentArtifact } from '../kernel/contracts.mjs';
import { reviewAikountOperationPlan } from '../kernel/reviewer.mjs';

export async function runAikountSafeExecutionSkill(input) {
  const review = reviewAikountOperationPlan(input);
  return agentArtifact({
    agent: 'aikount_safe_execution_skill',
    status: review.approved ? 'completed' : 'blocked',
    warnings: review.warnings,
    blockingIssues: review.blockingIssues,
    review,
  });
}

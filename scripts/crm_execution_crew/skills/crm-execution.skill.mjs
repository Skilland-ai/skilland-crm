import { agentArtifact } from '../kernel/contracts.mjs';
import { executeOperationPlan } from '../kernel/executor.mjs';

export async function runCrmExecutionSkill({ client, plan, review, effectiveMode }) {
  if (!review.approved) {
    return agentArtifact({
      agent: 'execution_agent',
      status: 'blocked',
      result: {
        requestId: plan.requestId,
        mode: effectiveMode,
        status: 'blocked',
        operations: [],
        summary: { planned: 0, applied: 0, failed: 0 },
        errors: review.blockingIssues,
      },
      warnings: review.warnings,
      blockingIssues: review.blockingIssues,
    });
  }

  const result = await executeOperationPlan({
    client,
    plan,
    apply: effectiveMode === 'apply',
  });

  return agentArtifact({
    agent: 'execution_agent',
    status: result.status,
    result,
    warnings: result.errors?.length ? ['One or more operations failed.'] : [],
    blockingIssues: [],
  });
}


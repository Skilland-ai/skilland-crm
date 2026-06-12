import { runCrmMetadataSkill } from '../skills/twenty-metadata.skill.mjs';
import { runCrmExecutionSkill } from '../skills/crm-execution.skill.mjs';
import { runCrmPlanValidationSkill } from '../skills/crm-plan-validation.skill.mjs';
import { runTwentyRecordSearchSkill } from '../skills/twenty-record-search.skill.mjs';
import { planCrmOperations } from './planner.mjs';

export async function runDeterministicKernel({
  request,
  client,
  effectiveMode,
  applyRequested = false,
  confirmationProvided = false,
}) {
  const metadataArtifact = await runCrmMetadataSkill({ client, request });
  const recordArtifact = await runTwentyRecordSearchSkill({ client, request });
  const operationPlan = planCrmOperations({
    request,
    metadataArtifact,
    recordArtifact,
    workflowArtifact: null,
    effectiveMode,
  });
  const review = await runCrmPlanValidationSkill({
    request,
    plan: operationPlan,
    effectiveMode,
    applyRequested,
    confirmationProvided,
  });
  const executionArtifact = await runCrmExecutionSkill({
    client,
    plan: operationPlan,
    review,
    effectiveMode,
  });

  return {
    metadataArtifact,
    recordArtifact,
    operationPlan,
    review,
    executionArtifact,
    executionResult: executionArtifact.result,
  };
}


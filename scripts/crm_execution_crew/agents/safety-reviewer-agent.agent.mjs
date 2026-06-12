import { runCrmPlanValidationSkill } from '../skills/crm-plan-validation.skill.mjs';

export async function runSafetyReviewerAgent({
  request,
  plan,
  effectiveMode,
  applyRequested,
  confirmationProvided,
}) {
  return runCrmPlanValidationSkill({
    request,
    plan,
    effectiveMode,
    applyRequested,
    confirmationProvided,
  });
}


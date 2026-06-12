import { reviewCrmOperationPlan } from '../kernel/reviewer.mjs';

export async function runCrmPlanValidationSkill({
  request,
  plan,
  effectiveMode,
  applyRequested,
  confirmationProvided,
}) {
  return reviewCrmOperationPlan({
    request,
    plan,
    effectiveMode,
    applyRequested,
    confirmationProvided,
  });
}


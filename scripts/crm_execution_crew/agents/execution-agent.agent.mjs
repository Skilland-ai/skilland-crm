import { runCrmExecutionSkill } from '../skills/crm-execution.skill.mjs';

export async function runExecutionAgent({ client, plan, review, effectiveMode }) {
  return runCrmExecutionSkill({ client, plan, review, effectiveMode });
}


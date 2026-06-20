import { runCrmAikountContextReadonlySkill } from '../skills/crm-aikount-context-readonly.skill.mjs';

export async function runCrmContextAgent({ client, request, interviewer }) {
  return runCrmAikountContextReadonlySkill({ client, request, interviewer });
}

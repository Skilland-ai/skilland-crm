import { runTwentyRecordSearchSkill } from '../skills/twenty-record-search.skill.mjs';

export async function runRecordResolverAgent({ client, request, recordIndex }) {
  return runTwentyRecordSearchSkill({ client, request, recordIndex });
}


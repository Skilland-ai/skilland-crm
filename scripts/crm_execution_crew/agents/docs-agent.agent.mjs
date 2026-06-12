import { runTwentyDocsSearchSkill } from '../skills/twenty-docs-search.skill.mjs';

export async function runDocsAgent({ request }) {
  return runTwentyDocsSearchSkill({ request });
}


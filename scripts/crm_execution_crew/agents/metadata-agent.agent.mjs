import { runCrmMetadataSkill } from '../skills/twenty-metadata.skill.mjs';

export async function runMetadataAgent({ client, request, metadataObjects }) {
  return runCrmMetadataSkill({ client, request, metadataObjects });
}


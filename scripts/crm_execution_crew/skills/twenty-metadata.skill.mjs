import { agentArtifact } from '../kernel/contracts.mjs';
import {
  buildMetadataSnapshot,
  validateRequestAgainstMetadata,
} from '../kernel/metadata-resolver.mjs';

export async function runCrmMetadataSkill({ client, request, metadataObjects }) {
  const objects = metadataObjects ?? (await client.metadataObjects());
  const snapshot = buildMetadataSnapshot(objects);
  const validation = validateRequestAgainstMetadata(request, snapshot);

  return agentArtifact({
    agent: 'metadata_schema_agent',
    status: 'completed',
    objectsChecked: validation.objectsChecked,
    fields: validation.fields,
    unknownFields: validation.unknownFields,
    invalidOptions: validation.invalidOptions,
    warnings: validation.warnings,
    blockingIssues: validation.blockingIssues,
    metadataSnapshot: snapshot,
  });
}


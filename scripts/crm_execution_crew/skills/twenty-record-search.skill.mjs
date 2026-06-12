import { agentArtifact } from '../kernel/contracts.mjs';
import {
  fetchRecordIndex,
  resolveRequestRecords,
} from '../kernel/record-resolver.mjs';

export async function runTwentyRecordSearchSkill({ client, request, recordIndex }) {
  const index = recordIndex ?? (await fetchRecordIndex(client));
  const resolution = resolveRequestRecords({ request, recordIndex: index });

  return agentArtifact({
    agent: 'record_resolver_agent',
    status: 'completed',
    resolvedRecords: resolution.operationResolutions.map((item) => ({
      operationIndex: item.operationIndex,
      targetIds: item.targetIds,
      recordIds: {
        opportunityId: item.resolvedRecords.opportunity?.id ?? null,
        personId: item.resolvedRecords.person?.id ?? null,
        companyId: item.resolvedRecords.company?.id ?? null,
        taskId: item.resolvedRecords.task?.id ?? null,
      },
    })),
    operationResolutions: resolution.operationResolutions,
    ambiguousLookups: resolution.ambiguousLookups,
    missingRecords: resolution.missingRecords,
    warnings: resolution.warnings,
    blockingIssues: resolution.blockingIssues,
  });
}


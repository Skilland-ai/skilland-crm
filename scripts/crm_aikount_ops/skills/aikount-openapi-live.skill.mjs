import { agentArtifact, issue } from '../kernel/contracts.mjs';
import {
  requiredOperationPaths,
  supportsOperation,
} from '../kernel/aikount-client.mjs';

export async function runAikountOpenApiLiveSkill({ client, action }) {
  try {
    const [me, tenant, spec, taxes, numbering] = await Promise.all([
      client.getAuthMe(),
      client.getTenantMe(),
      client.getOpenApiSpec(),
      client.listTaxes({ context: 'sale' }),
      client.listNumbering(),
    ]);

    const blockingIssues = [];
    for (const [pathName, method] of requiredOperationPaths(action)) {
      if (!supportsOperation(spec, pathName, method)) {
        blockingIssues.push(
          issue(
            'openapi_path_missing',
            `OpenAPI does not advertise ${method.toUpperCase()} ${pathName}.`,
          ),
        );
      }
    }

    return agentArtifact({
      agent: 'aikount_openapi_live_skill',
      status: blockingIssues.length ? 'blocked' : 'completed',
      blockingIssues,
      me,
      tenant,
      spec,
      taxes,
      numbering,
    });
  } catch (error) {
    return agentArtifact({
      agent: 'aikount_openapi_live_skill',
      status: 'blocked',
      blockingIssues: [
        issue(
          'aikount_preflight_failed',
          error instanceof Error ? error.message : String(error),
        ),
      ],
      me: null,
      tenant: null,
      spec: null,
      taxes: [],
      numbering: [],
    });
  }
}

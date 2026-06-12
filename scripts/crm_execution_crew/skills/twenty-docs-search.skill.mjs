import { agentArtifact } from '../kernel/contracts.mjs';
import { retrieveTwentyDocs } from '../kernel/docs-retriever.mjs';

export async function runTwentyDocsSearchSkill({ request, cwd = process.cwd() }) {
  const docsConsulted = retrieveTwentyDocs({ request, cwd });

  return agentArtifact({
    agent: 'twenty_docs_agent',
    status: 'completed',
    docsConsulted: docsConsulted.map(({ path, reason }) => ({ path, reason })),
    findings: docsConsulted.map(({ path, summary, implications }) => ({
      path,
      summary,
      implications,
    })),
    warnings:
      docsConsulted.length === 0
        ? ['No local Twenty documentation matched the request.']
        : [],
  });
}


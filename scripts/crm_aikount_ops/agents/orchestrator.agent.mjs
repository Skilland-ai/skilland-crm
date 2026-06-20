import { agentArtifact } from '../kernel/contracts.mjs';

export async function runOrchestratorAgent({ request, effectiveMode }) {
  return agentArtifact({
    agent: 'crm_aikount_orchestrator',
    status: 'completed',
    effectiveMode,
    summary: `Interactive front door for ${request.action}.`,
  });
}

import { agentArtifact } from '../kernel/contracts.mjs';

export async function runOrchestratorAgent({ request, effectiveMode, agenticMode }) {
  const requestedAgentNames = [
    'twenty_docs_agent',
    'workflow_specialist_agent',
    'metadata_schema_agent',
    'record_resolver_agent',
    'api_operation_planner_agent',
    'safety_reviewer_agent',
    'execution_agent',
  ];

  return agentArtifact({
    agent: 'crm_orchestrator_agent',
    status: 'completed',
    mode: effectiveMode,
    agenticMode,
    requester: request.requester,
    intent: request.intent,
    agentsToRun: requestedAgentNames,
    rationale:
      'Run docs, workflow scope check, metadata, record resolution, planning, safety review, then execution through the deterministic kernel.',
  });
}


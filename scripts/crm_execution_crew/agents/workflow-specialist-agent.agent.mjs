import { agentArtifact, issue } from '../kernel/contracts.mjs';

const WORKFLOW_KEYWORDS = [
  'workflow',
  'workflows',
  'automation',
  'automatizacion',
  'automatización',
  'webhook',
  'trigger',
  'cron',
];

export async function runWorkflowSpecialistAgent({ request, docsArtifact }) {
  const text = [
    request.intent,
    request.requestText,
    ...request.operations.map((operation) => operation.type),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const requiresWorkflow = WORKFLOW_KEYWORDS.some((keyword) => text.includes(keyword));

  if (!requiresWorkflow) {
    return agentArtifact({
      agent: 'workflow_specialist_agent',
      status: 'not_required',
      docsConsulted: docsArtifact?.docsConsulted ?? [],
      finding: 'The request can be handled as CRM record operations in v1.',
    });
  }

  return agentArtifact({
    agent: 'workflow_specialist_agent',
    status: 'out_of_scope_v1',
    docsConsulted: docsArtifact?.docsConsulted ?? [],
    finding:
      'The request appears to require Twenty workflow/webhook editing. CRM Execution Crew v1 does not edit workflows.',
    blockingIssues: [
      issue(
        'out_of_scope_v1',
        'Workflow or webhook editing is out of scope for CRM Execution Crew v1.',
      ),
    ],
    warnings: ['Use the repo-local twenty-workflows capability team for workflow authoring.'],
  });
}


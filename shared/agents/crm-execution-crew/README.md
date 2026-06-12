# CRM Execution Crew

Repo-local agentic crew for safe horizontal execution against Skilland's Twenty
CRM.

## User-facing agent

- `orchestrator/AGENT.md`

The orchestrator is the front door. It receives operational CRM intent, asks the
specialist agents for evidence and plans, and delegates writes only to the
Execution Agent after Safety Reviewer approval.

## Internal agents

- `docs-agent/AGENT.md`
- `metadata-agent/AGENT.md`
- `record-resolver-agent/AGENT.md`
- `api-planner-agent/AGENT.md`
- `workflow-specialist-agent/AGENT.md`
- `safety-reviewer-agent/AGENT.md`
- `execution-agent/AGENT.md`

## Runtime surface

- Harness: `scripts/crm_execution_crew/harness.mjs`
- Command: `yarn crm:execute`
- Logs: `04_outputs/crm_execution_crew/logs/`

## Operating rule

No specialist agent writes to CRM. All side effects go through the Execution
Agent, and the Execution Agent only calls the deterministic kernel executor for
plans approved by the Safety Reviewer.


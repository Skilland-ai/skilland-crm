# Twenty Workflows Capability Install Report

- Date: 2026-06-07
- Repo: `skilland-crm`
- Scope: install reusable capability assets only

## 1. Installed structure

### Knowledge

- `shared/knowledge/twenty-workflows/2026-06-07_sources_inventory.md`
- `shared/knowledge/twenty-workflows/2026-06-07_workflow_domain_model.md`
- `shared/knowledge/twenty-workflows/2026-06-07_api_mcp_capabilities.md`
- `shared/knowledge/twenty-workflows/2026-06-07_workflow_testing_and_debugging.md`
- `shared/knowledge/twenty-workflows/2026-06-07_ui_last_resort.md`
- `shared/knowledge/twenty-workflows/examples/ia_mujeres_workflow_patterns.md`

### Skills

- `shared/skills/twenty-workflows/README.md`
- `shared/skills/twenty-workflows/twenty-workflow-api-research/SKILL.md`
- `shared/skills/twenty-workflows/twenty-workflow-design/SKILL.md`
- `shared/skills/twenty-workflows/twenty-workflow-implementation/SKILL.md`
- `shared/skills/twenty-workflows/twenty-workflow-smoke-test/SKILL.md`
- `shared/skills/twenty-workflows/twenty-workflow-safety-review/SKILL.md`

### Agents

- `shared/agents/twenty-workflows/README.md`
- `shared/agents/twenty-workflows/api-researcher/AGENT.md`
- `shared/agents/twenty-workflows/architect/AGENT.md`
- `shared/agents/twenty-workflows/implementer/AGENT.md`
- `shared/agents/twenty-workflows/qa/AGENT.md`
- `shared/agents/twenty-workflows/safety-reviewer/AGENT.md`

### Orchestration and reports

- `shared/orchestration/twenty-workflows/2026-06-07_capability_team_design.md`
- `shared/orchestration/twenty-workflows/2026-06-07_how_to_use.md`
- `shared/reports/twenty-workflows/2026-06-07_scaffolding_audit.md`
- `shared/reports/twenty-workflows/2026-06-07_capability_install_report.md`

## 2. Sources investigated

### Official sources

- docs on API types, workflow triggers, actions, and runs from `docs.twenty.com`

### Local source code

- workflow entities
- workflow resolvers
- workflow query hooks
- shared workflow schemas
- opportunity/task/taskTarget entities

### Local scripts and reports

- `scripts/ia_mujeres_crm_smoke_test_v1.mjs`
- `scripts/ia_mujeres_crm_test_workflows_v1.mjs`
- `scripts/ia_mujeres_crm_workflows_v1.mjs`
- `04_outputs/ia_mujeres_smoke_test/2026-06-07_workflow_test_report.md`
- `04_outputs/ia_mujeres_workflows/2026-06-04_workflow_capabilities_audit.md`

### Scaffolding reference

- `/home/reboot/Escritorio/Skilland.ai/basic-scaffolding`

## 3. Confirmed API/MCP capabilities

| capability | status | notes |
| --- | --- | --- |
| Create workflow shell | confirmed | `createWorkflow` plus auto-created draft version |
| Author trigger/steps/edges/positions | confirmed | workflow-specific GraphQL mutations and draft-safe update path |
| Activate/deactivate version | confirmed | explicit workflow mutations |
| Run workflow version manually | confirmed | explicit mutation and useful for draft-safe testing |
| Read runs and per-step results | confirmed | query `workflowRuns` and inspect `state.stepInfos` |
| Create metadata fields/views | confirmed | metadata GraphQL and REST paths |
| Record CRUD for Opportunities/Tasks | confirmed | core GraphQL and current MCP connector |
| Workflow-specific MCP management | not confirmed | current MCP connector does not expose workflow authoring/execution tools |

## 4. What is still unclear

- whether task-to-opportunity linking should be done inside the workflow graph or immediately after via API/MCP in the target workspace
- the exact auth combinations supported for every workflow mutation outside the validated user-JWT path
- stage constant choices for future IA Mujeres workflow variants in the live workspace
- whether any future Twenty release will expose workflow authoring in the current MCP connector

## 5. Skills and agents created

### Skills

- `shared/skills/twenty-workflows/twenty-workflow-api-research/SKILL.md`
- `shared/skills/twenty-workflows/twenty-workflow-design/SKILL.md`
- `shared/skills/twenty-workflows/twenty-workflow-implementation/SKILL.md`
- `shared/skills/twenty-workflows/twenty-workflow-smoke-test/SKILL.md`
- `shared/skills/twenty-workflows/twenty-workflow-safety-review/SKILL.md`

### Agent specs

- `shared/agents/twenty-workflows/api-researcher/AGENT.md`
- `shared/agents/twenty-workflows/architect/AGENT.md`
- `shared/agents/twenty-workflows/implementer/AGENT.md`
- `shared/agents/twenty-workflows/qa/AGENT.md`
- `shared/agents/twenty-workflows/safety-reviewer/AGENT.md`

## 6. How to use it to retake Phase 4.1

Recommended next step:

1. read the new knowledge docs
2. read the latest smoke-test report
3. re-validate WF-2 and WF-3 through the research skill
4. keep execution on the isolated `TEST -` deal
5. produce a new runtime report before any production discussion

## 7. What was not touched

Confirmed untouched:

- no active spec files were edited
- no production workflows were activated
- no real workflows were executed from this task
- no emails were sent
- no secrets or tokens were copied into the repo
- no `.env` files were added or versioned

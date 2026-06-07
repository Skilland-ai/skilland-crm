# Twenty Workflows Sources Inventory

| source_type | path_or_url | topic | relevance | notes |
| --- | --- | --- | --- | --- |
| official_docs | https://docs.twenty.com/user-guide/workflows/capabilities/workflow-triggers | Trigger types and trigger semantics | high | Accessed 2026-06-07. Confirms manual, database-event, cron, webhook trigger behavior. |
| official_docs | https://docs.twenty.com/user-guide/workflows/capabilities/workflow-actions | Action catalog and documented limits | high | Accessed 2026-06-07. Useful for comparing UI docs vs code reality. |
| official_docs | https://docs.twenty.com/user-guide/workflows/capabilities/workflow-runs | Run lifecycle and debugging expectations | high | Accessed 2026-06-07. |
| official_docs | https://docs.twenty.com/developers/extend/api | Core API vs Metadata API | high | Accessed 2026-06-07. Primary source for `/graphql` and `/metadata`. |
| official_docs | https://docs.twenty.com/developers/contribute/capabilities/backend-development/custom-objects | Metadata API and schema generation model | medium | Accessed 2026-06-07. |
| local_docs | `packages/twenty-docs/user-guide/workflows/capabilities/workflow-triggers.mdx` | Local mirror of trigger docs | high | Mirrors official docs shipped in repo. |
| local_docs | `packages/twenty-docs/user-guide/workflows/capabilities/workflow-actions.mdx` | Local mirror of action docs | high | Mirrors official docs shipped in repo. |
| local_docs | `packages/twenty-docs/user-guide/workflows/capabilities/workflow-runs.mdx` | Local mirror of run docs | high | Mirrors official docs shipped in repo. |
| local_docs | `packages/twenty-docs/developers/extend/capabilities/apis.mdx` | Local mirror of API docs | high | Good offline fallback. |
| local_code | `packages/twenty-server/src/modules/workflow/common/standard-objects/workflow.workspace-entity.ts` | Workflow root entity | high | Source of truth for workflow-level fields and relations. |
| local_code | `packages/twenty-server/src/modules/workflow/common/standard-objects/workflow-version.workspace-entity.ts` | Workflow version entity | high | Source of truth for trigger and steps storage. |
| local_code | `packages/twenty-server/src/modules/workflow/common/standard-objects/workflow-run.workspace-entity.ts` | Workflow run entity | high | Source of truth for run state and statuses. |
| local_code | `packages/twenty-server/src/modules/workflow/common/standard-objects/workflow-automated-trigger.workspace-entity.ts` | Runtime automated trigger entity | high | Shows that `DATABASE_EVENT` and `CRON` create runtime subscriptions. |
| local_code | `packages/twenty-server/src/modules/workflow/workflow-trigger/workspace-services/workflow-trigger.workspace-service.ts` | Activation, deactivation, run execution | high | Key service for production-safety gating and trigger enablement. |
| local_code | `packages/twenty-server/src/engine/core-modules/workflow/resolvers/workflow-trigger.resolver.ts` | GraphQL workflow trigger mutations | high | Confirms `activateWorkflowVersion`, `deactivateWorkflowVersion`, `runWorkflowVersion`, `stopWorkflowRun`. |
| local_code | `packages/twenty-server/src/engine/core-modules/workflow/resolvers/workflow-version.resolver.ts` | Draft/duplicate/positions mutations | high | Confirms `createDraftFromWorkflowVersion`, `duplicateWorkflow`, `updateWorkflowVersionPositions`. |
| local_code | `packages/twenty-server/src/engine/core-modules/workflow/resolvers/workflow-version-step.resolver.ts` | Step mutations and test helpers | high | Confirms create/update/delete step, submit form, test HTTP, update run step. |
| local_code | `packages/twenty-server/src/engine/core-modules/workflow/resolvers/workflow-version-edge.resolver.ts` | Edge mutations | high | Confirms create/delete edge support. |
| local_code | `packages/twenty-server/src/modules/workflow/common/query-hooks/` | Guardrails and forbidden direct mutations | high | Shows `workflowVersion.createOne` and `workflowRun.createOne/delete*` are blocked. |
| local_code | `packages/twenty-server/src/modules/workflow/workflow-tools/services/workflow-tool.workspace-service.ts` | Internal AI tool surface | high | Confirms repo-local internal tools such as `create_complete_workflow`. |
| local_code | `packages/twenty-shared/src/workflow/schemas/` | Trigger/action schemas | high | Primary source for JSON payload shapes. |
| local_code | `packages/twenty-front/src/generated/graphql.ts` | Client-visible workflow mutation surface | medium | Useful confirmation of currently generated operations. |
| local_code | `packages/twenty-server/src/modules/opportunity/standard-objects/opportunity.workspace-entity.ts` | Opportunity fields and relations | high | Needed for IA Mujeres workflow patterns. |
| local_code | `packages/twenty-server/src/modules/task/standard-objects/task.workspace-entity.ts` | Task fields | high | Needed for task creation patterns. |
| local_code | `packages/twenty-server/src/modules/task/standard-objects/task-target.workspace-entity.ts` | Task-to-record linkage model | high | Important for task relation notes. |
| local_script | `scripts/ia_mujeres_crm_smoke_test_v1.mjs` | Metadata setup and test isolation | high | Shows `testMode`, test campaign, metadata API, and safe test deal creation. |
| local_script | `scripts/ia_mujeres_crm_test_workflows_v1.mjs` | Verified API-first workflow editing/activation | high | Strong evidence that workflow configuration is not inherently UI-only. |
| local_script | `scripts/ia_mujeres_crm_workflows_v1.mjs` | Earlier workflow design assumptions | medium | Useful historical contrast; contains stale UI assumptions to correct. |
| local_report | `04_outputs/ia_mujeres_smoke_test/2026-06-07_workflow_test_report.md` | Runtime proof of WF-2/WF-3 API-first success | high | Confirms creation, activation, triggering, run completion, and cleanup. |
| local_report | `04_outputs/ia_mujeres_workflows/2026-06-04_workflow_capabilities_audit.md` | Earlier capability audit | medium | Important because some conclusions were disproven later. |
| mcp_tool_surface | `tool_search -> mcp__twenty_crm` | Current MCP surface in this environment | medium | Exposes tasks, opportunities, notes, people, companies, timeline activities; no workflow management tools discovered. |

# Twenty Workflows API and MCP Capabilities

## Executive summary

Twenty workflow work in this repo is not UI-first by necessity.

What is true after reviewing current docs, server code, client GraphQL surface, local scripts, and the 2026-06-07 smoke-test evidence:

1. Workflow authoring is largely API-capable.
2. Generic `workflowVersion.createOne` is blocked, but that does not block practical workflow creation.
3. The reliable API-first path is:
   - create a `workflow` shell,
   - use the auto-created draft version,
   - mutate trigger/steps/edges/positions through workflow-specific GraphQL mutations,
   - activate only after safety review and isolation.
4. Current MCP surface in this environment is record-oriented, not workflow-authoring-oriented.
5. Several earlier "UI-only" assumptions in local reports were disproven by the 2026-06-07 test run.

## Current auth reality

There are two distinct surfaces:

- Core/metadata object CRUD can often be done with API-key auth.
- Workflow-specific mutations under `src/engine/core-modules/workflow/resolvers/` are guarded by `WorkspaceAuthGuard + UserAuthGuard + SettingsPermissionGuard(WORKFLOWS)`.

Practical implication:

- Creating fields, views, records, and reading workflow records can be API-key-friendly.
- Creating steps, activating versions, running versions, and other workflow management mutations should be treated as user-authenticated GraphQL operations unless you have verified an alternate auth path in your workspace.

## Capability matrix

| operation | API/MCP possible? | method/tool | confidence | notes |
| --- | --- | --- | --- | --- |
| Read workflows, versions, triggers, steps | Yes | Core GraphQL queries on `workflows`, `workflowVersions` | high | Validated in local scripts and generated client schema. |
| Read workflow runs and step outputs | Yes | Core GraphQL queries on `workflowRuns` | high | Run state lives in `workflowRun.state.stepInfos`. |
| Create workflow shell | Yes | Generic `createWorkflow` mutation on core GraphQL | high | Post-hook auto-creates draft version `v1`. |
| Create workflow version directly | No direct public path | `workflowVersion.createOne` is blocked | high | Use `createWorkflow` shell or `createDraftFromWorkflowVersion` instead. |
| Create draft from existing version | Yes | `createDraftFromWorkflowVersion` mutation | high | Explicit resolver exists. |
| Duplicate a workflow | Yes | `duplicateWorkflow` mutation | high | Explicit resolver exists. |
| Update draft version trigger | Yes | Generic `updateWorkflowVersion` on draft, or internal tool `update_workflow_version_trigger` | high | Query hook blocks status changes and direct step replacement, not trigger updates. |
| Create workflow step | Yes | `createWorkflowVersionStep` mutation | high | Requires user-authenticated workflow mutation path. |
| Update workflow step | Yes | `updateWorkflowVersionStep` mutation | high | Draft-only authoring path. |
| Delete workflow step | Yes | `deleteWorkflowVersionStep` mutation | high | Draft-only authoring path. |
| Duplicate workflow step | Yes | `duplicateWorkflowVersionStep` mutation | high | Explicit resolver exists. |
| Create workflow edge | Yes | `createWorkflowVersionEdge` mutation | high | Explicit resolver exists. |
| Delete workflow edge | Yes | `deleteWorkflowVersionEdge` mutation | high | Explicit resolver exists. |
| Update canvas positions | Yes | `updateWorkflowVersionPositions` mutation | high | Useful for keeping graph readable without UI. |
| Activate workflow version | Yes | `activateWorkflowVersion` mutation | high | Explicit resolver and local runtime evidence exist. |
| Deactivate workflow version | Yes | `deactivateWorkflowVersion` mutation | high | Explicit resolver exists. |
| Run workflow version manually | Yes | `runWorkflowVersion` mutation | high | Can be used for manual/draft testing. |
| Stop an in-flight run | Yes | `stopWorkflowRun` mutation | medium | Resolver exists; not exercised locally in this task. |
| Update a workflow run step in progress | Yes | `updateWorkflowRunStep` mutation | medium | Allowed unless run is already completed/failed. |
| Submit a form step | Yes | `submitFormStep` mutation | medium | Exists even though docs position forms as UI-centric. |
| Test an HTTP step without running the workflow | Yes | `testHttpRequest` mutation | high | Explicit resolver exists. |
| Create a whole workflow in one internal call | Yes, internal only | repo-local server tool `create_complete_workflow` | medium | Internal AI tool surface, not current external workspace GraphQL. |
| Create/update custom fields for workflow isolation | Yes | Metadata GraphQL `createOneField`, REST `/rest/metadata/objects` | high | Validated in `ia_mujeres_crm_smoke_test_v1.mjs`. |
| Create filtered test views | Yes | Metadata GraphQL `createCoreView`, `createCoreViewFilter` | high | Validated in `ia_mujeres_crm_smoke_test_v1.mjs`. |
| Create/update Opportunities | Yes | Core GraphQL or MCP `create_opportunity` / `update_opportunity` | high | Local scripts and MCP surface confirm. |
| Create/update Tasks | Yes | Core GraphQL or MCP `create_task` / `update_task` | high | Local scripts and MCP surface confirm. |
| Link Task to Opportunity outside workflow | Yes | MCP `create_task_target`; data model also supports `taskTarget` | medium | MCP surface confirms linkage operation; in-workflow path still needs runtime validation if done as a record step. |
| Delete workflow runs directly | No | `workflowRun.deleteOne/deleteMany` blocked by query hooks | high | Runs are meant to be system-managed. |
| Create workflow runs directly | No | `workflowRun.createOne/createMany` blocked by query hooks | high | Use `runWorkflowVersion` or trigger execution instead. |
| Manage workflows through current Twenty MCP connector | Partially | `mcp__twenty_crm` | high | Current connector exposes records and links, not workflow authoring/execution. |

## Current MCP tool surface in this environment

Discovered `mcp__twenty_crm` tools cover:

- tasks
- task targets
- opportunities
- notes
- note targets
- people
- companies
- timeline activities

Not discovered:

- create/update workflow
- activate/deactivate workflow version
- run workflow version
- inspect workflow runs

Conclusion:

- "MCP-first" for workflow authoring currently means "prefer any available MCP for records, but use Core GraphQL and Metadata API for workflows themselves."

## What was wrongly assumed UI-only before

### 1. Creating workflows

Earlier local notes claimed workflows had to be created in UI.

Current conclusion:

- `createWorkflow` works as a shell-creation path.
- The draft version is auto-created by a post-query hook.

### 2. Configuring trigger and steps

Earlier local notes treated trigger/step completion as a UI task.

Current conclusion:

- `updateWorkflowVersion` (trigger), `createWorkflowVersionStep`, `updateWorkflowVersionStep`, `createWorkflowVersionEdge`, and `updateWorkflowVersionPositions` provide an API-first authoring path.

### 3. Activation

Earlier local notes treated activation as something to keep manual.

Current conclusion:

- `activateWorkflowVersion` is an explicit GraphQL mutation and was successfully used in the 2026-06-07 test workflow run.

## Known hard boundaries and important caveats

1. `workflowVersion.createOne` is intentionally blocked.
   - This is not a UI requirement.
   - It is a model constraint.
   - Workaround: create workflow shell or draft from existing version.

2. Workflow-specific mutations are user-authenticated in code.
   - Do not assume an API key alone will cover the entire workflow-authoring path.

3. Run deletion is intentionally blocked.
   - Design your QA/reporting around querying runs, not deleting them.

4. Directly replacing `workflowVersion.steps` through generic update is forbidden.
   - Use the specialized step and edge mutations.

5. Current MCP coverage is insufficient for full workflow lifecycle management.
   - Keep GraphQL scripts ready.

## Recommended API-first operating order

1. Metadata API:
   - ensure isolation fields and views
2. Core GraphQL:
   - create workflow shell
   - locate draft version
   - configure trigger
   - create/update steps
   - create/update edges and positions
3. Safety review:
   - verify first-step isolation and no email actions
4. Controlled execution:
   - `runWorkflowVersion` for manual/draft tests
   - activate only isolated test workflows when automatic trigger behavior must be validated
5. Query runs and affected records:
   - inspect `workflowRuns`
   - inspect `tasks`, `opportunities`, and optionally `taskTargets`

## Bottom line

API/MCP-first is viable here.

The main limitation is not "UI-only workflows"; it is:

- auth nuance,
- intentional guardrails around generic mutations,
- and a workflow-gap in the current MCP connector surface.

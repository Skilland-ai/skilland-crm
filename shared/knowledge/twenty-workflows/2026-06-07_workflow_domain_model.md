# Twenty Workflows Domain Model

## Executive summary

Twenty stores workflow authoring state in standard workspace objects, then derives runtime trigger subscriptions and workflow runs from that authored graph.

The practical model is:

1. `workflow` is the container.
2. `workflowVersion` stores one concrete graph: `trigger` + `steps`.
3. `workflowAutomatedTrigger` stores the runtime subscription for active `DATABASE_EVENT` or `CRON` workflows.
4. `workflowRun` stores one execution and its per-step state.

## Core entities

| entity | purpose | key fields | source_of_truth |
| --- | --- | --- | --- |
| `workflow` | User-facing workflow container | `name`, `lastPublishedVersionId`, `statuses`, `versions`, `runs`, `automatedTriggers` | `packages/twenty-server/src/modules/workflow/common/standard-objects/workflow.workspace-entity.ts` |
| `workflowVersion` | One editable/publishable workflow graph | `workflowId`, `name`, `status`, `trigger`, `steps` | `packages/twenty-server/src/modules/workflow/common/standard-objects/workflow-version.workspace-entity.ts` |
| `workflowAutomatedTrigger` | Runtime trigger registration for active automated workflows | `workflowId`, `type`, `settings` | `packages/twenty-server/src/modules/workflow/common/standard-objects/workflow-automated-trigger.workspace-entity.ts` |
| `workflowRun` | One execution record | `workflowId`, `workflowVersionId`, `status`, `startedAt`, `endedAt`, `state` | `packages/twenty-server/src/modules/workflow/common/standard-objects/workflow-run.workspace-entity.ts` |

## Version statuses vs workflow statuses

### `workflowVersion.status`

- `DRAFT`
- `ACTIVE`
- `DEACTIVATED`
- `ARCHIVED`

This is the real publish state used by activation logic.

### `workflow.statuses`

The top-level workflow object also carries a `statuses` array. Query hooks forbid setting it manually. Treat it as derived state, not as the authoring control plane.

## Trigger model

`workflowVersion.trigger` is a discriminated union defined in `packages/twenty-shared/src/workflow/schemas/workflow-trigger-schema.ts`.

Supported concrete trigger types:

- `DATABASE_EVENT`
- `MANUAL`
- `CRON`
- `WEBHOOK`

### Database event trigger

Stored as:

- `type: 'DATABASE_EVENT'`
- `settings.eventName`: `objectName.action`

Supported action suffixes in schema:

- `created`
- `updated`
- `deleted`
- `upserted`

Important nuance:

- The UI phrase "Record is updated or created" maps to `upserted` at schema level.

### Manual trigger

Manual triggers store `availability` in `trigger.settings.availability`:

- `GLOBAL`
- `SINGLE_RECORD`
- `BULK_RECORDS`

On activation, Twenty creates a command-menu item instead of a `workflowAutomatedTrigger` row.

### Cron and webhook triggers

- `CRON` stores schedule or custom pattern in trigger settings.
- `WEBHOOK` stores HTTP method, expected body for POST, and optional auth mode.

## Step model

`workflowVersion.steps` is an array of `WorkflowAction` values.

Primary action enum:

- `CODE`
- `LOGIC_FUNCTION`
- `SEND_EMAIL`
- `DRAFT_EMAIL`
- `CREATE_RECORD`
- `UPDATE_RECORD`
- `DELETE_RECORD`
- `UPSERT_RECORD`
- `FIND_RECORDS`
- `FORM`
- `FILTER`
- `IF_ELSE`
- `HTTP_REQUEST`
- `AI_AGENT`
- `ITERATOR`
- `EMPTY`
- `DELAY`

Common step shape in practice:

- `id`
- `name`
- `type`
- `valid`
- `settings`
- `nextStepIds`
- `position`

### Conditions and branches

- `FILTER` uses `stepFilterGroups` + `stepFilters` and acts as a gate.
- `IF_ELSE` uses the same filter primitives plus explicit `branches`.
- `ITERATOR` can connect to loop bodies using connection options handled by the edge service.

## Run model

`workflowRun.state` is the execution payload that matters most for debugging.

Stored parts:

- `state.flow.trigger`
- `state.flow.steps`
- `state.stepInfos`
- `state.workflowRunError`

`state.stepInfos` is a per-step map. Each entry tracks:

- `status`
- `result`
- `error`
- optional `history`

Code-level run statuses are richer than the docs summary:

- `NOT_STARTED`
- `ENQUEUED`
- `RUNNING`
- `COMPLETED`
- `FAILED`
- `STOPPING`
- `STOPPED`

## Activation lifecycle

Activation logic lives in `workflow-trigger.workspace-service.ts`.

When a version is activated, Twenty:

1. loads the target version,
2. validates it can be activated,
3. builds CODE step sources if needed,
4. archives any previously published version,
5. marks the new version `ACTIVE`,
6. updates `workflow.lastPublishedVersionId`,
7. enables runtime trigger infrastructure:
   - command menu item for `MANUAL`,
   - `workflowAutomatedTrigger` row for `DATABASE_EVENT`,
   - `workflowAutomatedTrigger` row for `CRON`,
   - webhook runtime stays tied to the stored trigger config.

## CRUD guardrails in the model

The model is intentionally not fully open to generic CRUD:

- `workflowVersion.createOne` is blocked.
- `workflowRun.createOne` is blocked.
- `workflowRun.deleteOne` and `workflowRun.deleteMany` are blocked.
- `workflowVersion.updateOne` allows draft-safe edits but forbids direct `steps` replacement and manual status changes.

This means the operational API is:

- generic `createWorkflow` to get a shell + auto-created draft `v1`,
- specialized step/edge/draft/activate/run mutations for real workflow authoring.

## Opportunity and Task relationship model

Relevant standard objects:

| object | relevant fields | source |
| --- | --- | --- |
| `opportunity` | `name`, `stage`, `companyId`, `pointOfContactId`, `taskTargets`, `noteTargets` | `packages/twenty-server/src/modules/opportunity/standard-objects/opportunity.workspace-entity.ts` |
| `task` | `title`, `bodyV2`, `dueAt`, `status`, `assigneeId`, `taskTargets` | `packages/twenty-server/src/modules/task/standard-objects/task.workspace-entity.ts` |
| `taskTarget` | `taskId`, `targetOpportunityId`, `targetPersonId`, `targetCompanyId` | `packages/twenty-server/src/modules/task/standard-objects/task-target.workspace-entity.ts` |

For the IA Mujeres domain, repo-local scripts and reports also rely on these custom Opportunity fields:

- `campaignName`
- `businessLineName`
- `businessLine`
- `needsManualReview`
- `outreachStatus`
- `testMode`
- `firstEmailSentAt`
- `lastEmailSentAt`
- `lastReplyAt`
- `followUpDueAt`
- `meetingStatus`
- `meetingDate`

## Practical authoring rule

If you are designing or debugging a workflow, reason from this stack in order:

1. `workflow`
2. current `workflowVersion`
3. `trigger`
4. ordered `steps`
5. runtime `workflowRun.state.stepInfos`
6. target record objects such as `opportunity`, `task`, and `taskTarget`

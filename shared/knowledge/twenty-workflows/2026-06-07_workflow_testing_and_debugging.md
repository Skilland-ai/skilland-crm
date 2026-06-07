# Twenty Workflows Testing and Debugging

## Safety envelope

Default testing rules:

1. Work on `TEST -` records and `TEST -` workflows only.
2. Isolate by at least:
   - `campaignName`
   - `businessLineName` or `businessLine`
   - `testMode = true`
3. Do not include `SEND_EMAIL` or `DRAFT_EMAIL` in smoke-test workflows unless the task explicitly requires it and the user confirms.
4. Prefer draft/manual execution before any activation.
5. Activate only when the workflow's first gate already isolates test records.

## How to create a workflow test

Use the repo's existing pattern from `scripts/ia_mujeres_crm_smoke_test_v1.mjs`.

### 1. Prepare isolation fields and test records

- Ensure custom field `testMode` exists on `Opportunity` via Metadata API.
- Ensure test `BusinessLine` exists if the workflow relies on business-line filtering.
- Create or reuse:
  - test company
  - test person
  - test opportunity

Recommended test values:

- workflow names: `TEST - ...`
- record names: `TEST - ...`
- `campaignName = TEST - IA Mujeres 2026`
- `businessLineName = TEST - SkilLand IA Mujeres`
- `testMode = true`

### 2. Prepare a filtered test view

Use Metadata API to create a view filtered by:

- `campaignName`
- `testMode`

This is optional for the API path, but useful for fast visual validation later.

### 3. Create or reuse a draft workflow

Preferred paths:

- new workflow shell: `createWorkflow`
- existing version as starting point: `createDraftFromWorkflowVersion`

Avoid:

- direct `workflowVersion.createOne`

### 4. Build the draft graph

Use API operations, not canvas-first editing:

- update trigger
- create steps
- update steps with final settings
- create edges
- update positions

## How to verify the trigger

### Manual trigger

Use `runWorkflowVersion` with a controlled payload.

Why this is useful:

- it works without activation,
- it exercises the draft version,
- it keeps blast radius small.

### Database-event trigger

This requires runtime activation to fire automatically.

Safe path:

1. activate only an isolated `TEST -` workflow,
2. mutate only the isolated test opportunity,
3. read the resulting run and created records,
4. deactivate if the workflow should not stay live.

Example trigger stimulus:

- `updateOpportunity(..., { outreachStatus: 'first_email_sent' })`
- `updateOpportunity(..., { outreachStatus: 'replied' })`

### Cron trigger

Do not activate a cron workflow unless:

- the schedule is test-safe,
- the query is test-filtered,
- and the user explicitly wants runtime validation.

Prefer validating the trigger shape and downstream steps first in draft/manual mode.

### Webhook trigger

Do not activate blindly.

Validate:

- expected body schema,
- downstream filters,
- absence of email actions,
- and record isolation.

## How to verify the condition

Use `FILTER` or `IF_ELSE` as the first executable step after the trigger.

Recommended first-step guards:

- `campaignName`
- `testMode`
- `businessLineName` or `businessLine`
- status field such as `outreachStatus`

Inspect run evidence in `workflowRun.state.stepInfos`:

- trigger step should show the incoming payload
- filter/if-else step should show success or failure
- downstream steps should only run when the guard passed

## How to verify the action

### Record creation

For `CREATE_RECORD`:

- query the target object after execution,
- search by test title prefix or unique name,
- verify fields, not just existence.

### Record update

For `UPDATE_RECORD`:

- re-read the opportunity/task after execution,
- confirm intended fields changed,
- confirm unrelated fields did not change.

### HTTP request

Use `testHttpRequest` before relying on a live run.

### Form

If the workflow contains a form:

- use `runWorkflowVersion`,
- inspect the waiting run,
- use `submitFormStep` to continue,
- then inspect downstream step results.

## How to detect an invalid workflow

Primary signals:

1. `activateWorkflowVersion` throws.
2. The run fails and `workflowRun.state.workflowRunError` is populated.
3. A step stays invalid or malformed after update.
4. CODE-step build fails on activation.

What to inspect:

- missing trigger
- malformed step settings
- wrong object names
- missing unique identifiers for upserts
- bad variable paths
- invalid stage values

## How to read runs and logs

There is no need to start with UI.

Read these first:

- `workflowRuns` query results
- `workflowRun.status`
- `workflowRun.startedAt`, `endedAt`
- `workflowRun.state.stepInfos`
- `workflowRun.state.workflowRunError`

What to look for in `stepInfos`:

- step order actually taken
- per-step `status`
- `result`
- `error`
- optional `history`

If a run must be interrupted:

- use `stopWorkflowRun`

## How to check whether the task was created correctly

Minimum check:

- task exists
- title/body matches expected test pattern
- status and due date are correct

Preferred extended check:

- query task
- query related `taskTargets` or use MCP `list_task_targets`
- confirm it links to the intended opportunity/person/company

Important note:

- linking tasks from inside a workflow is supportable in the data model, but should be re-validated in the target workspace before relying on it in production automation.

## How to reset the test deal

Reset by Core GraphQL update on the test opportunity.

Typical fields to reset:

- `outreachStatus`
- `firstEmailSentAt`
- `lastEmailSentAt`
- `lastReplyAt`
- `followUpDueAt`
- `meetingStatus`
- `meetingDate`

Keep:

- `campaignName`
- `businessLineName`
- `businessLine`
- `testMode`

## How to clean test tasks

Preferred cleanup pattern:

1. search tasks by `TEST -` prefix or exact known title pattern,
2. remove any task-target links if needed,
3. delete or archive the test task through the same API surface used in the workspace,
4. verify zero matching tasks remain.

Current environment note:

- MCP exposes create/update/list task operations and task-target link operations.
- Workflow testing scripts in this repo already demonstrated successful task cleanup.

## How to isolate by `testMode`, `campaignName`, and `businessLine`

Use all three where possible.

Recommended isolation stack:

1. `campaignName = TEST - IA Mujeres 2026`
2. `testMode = true`
3. `businessLineName = TEST - SkilLand IA Mujeres` or matching `businessLine`

Why all three:

- `campaignName` isolates campaign scope
- `testMode` separates test from real records even inside the same campaign
- `businessLine` prevents cross-line contamination

## How to avoid effects on production

- Keep send-email actions out of smoke tests.
- Never activate an automated workflow without a first-step isolation gate.
- Never test on real deals.
- Do not reuse production workflow names for experimental drafts.
- Prefer dedicated `TEST -` workflow copies over editing live active versions.
- Produce a written run report after each test pass so state is auditable.

## Recommended debug order

1. Read current version and trigger.
2. Validate the first filter.
3. Trigger only one test record.
4. Query the latest workflow run.
5. Inspect `stepInfos`.
6. Query created/updated records.
7. Reset test records.
8. Cleanup test tasks.
9. Record findings.

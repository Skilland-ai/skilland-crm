# IA Mujeres Workflow Patterns

## Shared safety baseline

Apply this baseline to every IA Mujeres workflow before thinking about activation:

- first gate on `campaignName`
- second gate on `testMode` for smoke tests
- optional third gate on `businessLineName` or `businessLine`
- no email-sending step in these patterns
- `TEST -` records only during validation

Preferred first executable step:

- `FILTER` for simple pass/stop gating
- `IF_ELSE` only when you need explicit true/false branches

## WF-1 - Manual review

### Trigger

- `DATABASE_EVENT`
- `eventName: opportunity.updated`

### Condition

- `campaignName == target campaign`
- `needsManualReview == true`
- optional `testMode == true` during smoke tests

### Actions

1. `CREATE_RECORD` task:
   - title: `Review manually: {{trigger.properties.after.name}}`
   - status: `TODO`
2. `UPDATE_RECORD` on the same opportunity:
   - keep or set `outreachStatus = manual_review`
3. Do not add any send-email action.

### Fields

- `campaignName`
- `needsManualReview`
- `outreachStatus`
- optional `testMode`

### API/MCP implementation notes

- Task creation is straightforward by workflow step.
- If task-to-opportunity linking is required, validate whether the workflow step can author the relation cleanly in your workspace; otherwise create the link through API/MCP after task creation.

### Safety filter

- no stage movement
- no outbound email
- trigger only on isolated campaign/test records

### Test procedure

1. Set test opportunity `needsManualReview = true`.
2. Update the record to trigger the workflow.
3. Query latest `workflowRun`.
4. Verify filter success and task creation.
5. Verify `outreachStatus` remains `manual_review`.

### Rollback/reset

- delete test task
- restore `outreachStatus`
- leave `campaignName`, `businessLineName`, and `testMode` intact

## WF-2 - Primer email enviado

### Trigger

- `DATABASE_EVENT`
- `eventName: opportunity.updated`

### Condition

- `campaignName == target campaign`
- `outreachStatus == first_email_sent`
- optional `testMode == true`

### Actions

1. `UPDATE_RECORD`:
   - move `stage` only if the destination stage value already exists in this workspace
2. `CREATE_RECORD` task:
   - title: `Follow up: {{trigger.properties.after.name}}`
   - status: `TODO`
   - optional `dueAt` if the date is already known or computed upstream
3. Optional timestamp updates:
   - `firstEmailSentAt`
   - `lastEmailSentAt`
   - `followUpDueAt`

### Fields

- `outreachStatus`
- `stage`
- `firstEmailSentAt`
- `lastEmailSentAt`
- `followUpDueAt`
- `campaignName`
- optional `testMode`

### API/MCP implementation notes

- The workflow can react to status change even if the external sender stamps the timestamp fields.
- If you need date math such as `+3 days`, validate a CODE or LOGIC_FUNCTION step before relying on it.
- If timestamp stamping already happens outside the workflow, keep this workflow focused on task/stage updates.

### Safety filter

- no email step
- only isolated campaign/test records
- verify stage constant before writing it

### Test procedure

1. Reset test deal to `pending_first_email`.
2. Update to `first_email_sent`.
3. Query `workflowRuns` and confirm filter/action success.
4. Query created tasks.
5. Verify stage/timestamps changed only as intended.

### Rollback/reset

- set `outreachStatus` back to `pending_first_email`
- null test timestamps if they were changed
- remove test follow-up tasks

## WF-3 - Respuesta recibida

### Trigger

- `DATABASE_EVENT`
- `eventName: opportunity.updated`

### Condition

- `campaignName == target campaign`
- `outreachStatus == replied`
- optional `testMode == true`

### Actions

1. `CREATE_RECORD` task:
   - title: `Reply and propose meeting: {{trigger.properties.after.name}}`
2. `UPDATE_RECORD`:
   - `lastReplyAt`
   - optional stage move if validated in workspace

### Fields

- `outreachStatus`
- `lastReplyAt`
- `stage`
- `campaignName`
- optional `testMode`

### API/MCP implementation notes

- If your inbound email integration already stamps `lastReplyAt`, treat the workflow as a reaction-only automation.
- If not, validate the timestamp-write path before relying on it.

### Safety filter

- no automatic email response
- only isolated campaign/test records

### Test procedure

1. Set test deal to `first_email_sent`.
2. Update to `replied`.
3. Query latest run and confirm the filter/action path.
4. Verify task creation and `lastReplyAt`.

### Rollback/reset

- remove reply task
- reset `lastReplyAt`
- return `outreachStatus` to test baseline

## WF-4 - Follow-up pendiente

### Trigger

- `CRON`
- run on a safe schedule in UTC

### Condition

Find opportunities where:

- `campaignName == target campaign`
- `followUpDueAt <= now`
- `outreachStatus == follow_up_pending` or equivalent
- optional `testMode == true`

### Actions

1. `FIND_RECORDS` opportunities matching the due-window filter
2. `ITERATOR` over matching records
3. `CREATE_RECORD` task:
   - title: `Pending follow-up: {{iterator.currentItem.name}}`
4. Optional `UPDATE_RECORD`:
   - mark a follow-up flag or status if your model needs it

### Fields

- `followUpDueAt`
- `outreachStatus`
- `campaignName`
- optional `testMode`

### API/MCP implementation notes

- Keep the schedule inactive until the query is proven safe.
- If date filtering is awkward in the workflow filter language, use a scheduled workflow plus CODE step or move the due-date computation upstream.

### Safety filter

- required campaign/test filtering
- never send email from this workflow
- test schedule should not collide with real operating hours unless intended

### Test procedure

1. Set a test opportunity `followUpDueAt` into the past.
2. Activate only the isolated test workflow.
3. Wait for the cron fire or use a temporary near-future schedule.
4. Query runs and created tasks.

### Rollback/reset

- remove test tasks
- move `followUpDueAt` forward or null it
- deactivate the test cron workflow

## WF-5 - Reunion agendada

### Trigger

- `DATABASE_EVENT`
- `eventName: opportunity.updated`

### Condition

Either:

- `meetingStatus == scheduled`

or:

- `meetingDate` changed from null to value

Always combine with:

- `campaignName == target campaign`
- optional `testMode == true`

### Actions

1. `CREATE_RECORD` task:
   - title: `Prepare meeting: {{trigger.properties.after.name}}`
2. `UPDATE_RECORD`:
   - update stage if validated
   - persist `meetingDate` only if the external source did not already do so

### Fields

- `meetingStatus`
- `meetingDate`
- `stage`
- `campaignName`
- optional `testMode`

### API/MCP implementation notes

- Prefer consuming a meeting-status change created by the source integration instead of letting the workflow infer it.
- Validate stage constants per workspace before enabling.

### Safety filter

- no outbound email
- campaign/test isolation mandatory

### Test procedure

1. Update test opportunity `meetingStatus` or `meetingDate`.
2. Query latest run.
3. Verify task creation and stage/date changes.

### Rollback/reset

- delete preparation task
- reset `meetingStatus` and `meetingDate`
- restore baseline stage if changed

## Recommended implementation posture for IA Mujeres

For current work:

- keep these as patterns, not active workflows
- prefer `FILTER` first-step isolation
- prefer test-only workflow copies for runtime validation
- treat task-link validation and date-math automation as explicit sub-checks, not silent assumptions

# CRM Manual Update Crew

Repo-local agent team for manual, supervised CRM updates in Skilland CRM.

## User-facing agent

- `crm-secretary-lead/AGENT.md`

The user should talk only to `crm-secretary-lead`. It is the front door agent:
it understands the review request, delegates to internal workers, runs the
local harness when needed, asks for confirmation, and reports results.

## Internal workers

- `context-retriever/AGENT.md`
- `deal-interviewer/AGENT.md`
- `change-planner/AGENT.md`
- `crm-executor/AGENT.md`
- `auditor-qa/AGENT.md`

These workers are not meant to be invoked directly by the user. They exist so a
future agent can subdelegate with stable role boundaries.

## Runtime surface

- Harness: `scripts/crm_manual_update_crew/harness.mjs`
- User command: `yarn crm:review`
- Logs: `04_outputs/crm_manual_update_crew/logs/`

## Orchestration

1. User talks to `crm-secretary-lead`.
2. Lead uses context retrieval to discover real CRM metadata and records.
3. Lead interviews the user deal by deal.
4. Lead plans explicit CRM changes.
5. Auditor validates safety and asks for confirmation.
6. Executor writes through the harness/API only after confirmation.


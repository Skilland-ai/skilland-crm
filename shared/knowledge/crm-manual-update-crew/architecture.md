# CRM Manual Update Crew Architecture

## User-facing model

The user talks only to `crm-secretary-lead`. That agent orchestrates the rest of
the crew and the runtime harness.

## Internal workers

- context retriever: metadata and CRM context
- deal interviewer: conversation deal by deal
- change planner: parse and validate operations
- CRM executor: apply confirmed changes
- auditor QA: safety and logs

## Runtime

- `yarn crm:review`
- `scripts/crm_manual_update_crew/harness.mjs`

The harness is deterministic and safe by default. It can be used manually from
the terminal or launched by the lead agent.

## APIs

- `/graphql` for record reads and update mutations
- `/rest` for notes, tasks, and target records
- `/rest/metadata/objects` for field discovery

No direct database writes are allowed for this tool.


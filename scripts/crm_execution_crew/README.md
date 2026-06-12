# CRM Execution Crew

CRM Execution Crew is the horizontal execution layer for Skilland's Twenty CRM.
It is intentionally split in two parts:

- **Agentic crew:** explicit agents that gather docs evidence, check workflow
  scope, read metadata, resolve records, plan operations, review safety, and
  delegate execution.
- **Deterministic kernel:** contracts, planner, reviewer, executor, logger, and
  resolvers that validate and execute only approved operations.

No agent except the Execution Agent is allowed to cause side effects. The
Execution Agent only calls the deterministic executor after Safety Reviewer
approval.

## CLI

```bash
yarn crm:execute --request-file=scripts/crm_execution_crew/examples/update-opportunity-note.request.json
yarn crm:execute --request-file=... --dry-run
yarn crm:execute --request-file=... --apply
yarn crm:execute --request-file=... --apply --yes
yarn crm:execute --request-file=... --agentic
yarn crm:execute --request-file=... --deterministic
```

Dry-run is the default. Apply requires `--apply`; if the request has
`constraints.requireHumanConfirmation=true`, apply also requires `--yes` or an
interactive confirmation after the plan has passed validation.

## How Other Crews Call It

Other workflows should write a `CrmActionRequest` JSON and invoke:

```bash
yarn crm:execute --request-file=<path>
```

The result is printed to stdout and a full audit log is written to:

```text
04_outputs/crm_execution_crew/logs/session_<timestamp>.json
```

## Agentic Crew

- `crm_orchestrator_agent`: front door and coordinator.
- `twenty_docs_agent`: searches local docs under `packages/twenty-docs/`.
- `workflow_specialist_agent`: blocks workflow/webhook editing in v1.
- `metadata_schema_agent`: reads `/rest/metadata/objects` and validates fields.
- `record_resolver_agent`: resolves opportunities, people, companies, and tasks.
- `api_operation_planner_agent`: builds the normalized operation plan.
- `safety_reviewer_agent`: approves or blocks the plan.
- `execution_agent`: only side-effect boundary.

The corresponding repo-local specs live in `shared/agents/crm-execution-crew/`.

## Skills

Runtime skills live in `scripts/crm_execution_crew/skills/`; repo-local skill
specs live in `shared/skills/crm-execution-crew/`.

- `twenty-docs-search`
- `twenty-metadata`
- `twenty-record-search`
- `crm-plan-validation`
- `crm-execution`

Skills are tools. They do not decide the global strategy.

## Input Contract

`CrmActionRequest` includes:

- `requester`
- `mode`
- `intent`
- `scope`
- `constraints`
- `operations`

Supported operation types in v1:

- `create_opportunity`
- `update_opportunity`
- `create_note`
- `create_task`
- `close_task`
- `delete_record` and `metadata_change` only as auditable blocked operations

## Output Contract

The log stores:

- original request
- effective mode
- outputs from every agent
- operation plan
- safety review
- execution result
- warnings and blocking issues

Secrets such as API keys, tokens, and authorization headers are redacted.

## Safety Rules

- Dry-run by default.
- No writes without `--apply`.
- No apply without Safety Reviewer approval.
- No deletes in v1.
- No metadata mutations in v1.
- Ambiguous lookups block execution.
- Unknown fields and invalid select options block execution.
- `maxRecords` is enforced.
- No direct database writes.
- Existing `yarn crm:review` remains unchanged.

`create_opportunity` requires `data.name`. Use `lookup.companyId`,
`lookup.companyDomain`, `lookup.personId`, or `lookup.personEmail` to attach
existing company/person records. This v1.1 does not create companies or people.

## V1 Scope

Covered:

- resolve opportunities, people, companies, and tasks when safe
- create opportunities
- update opportunities
- create notes and tasks
- close tasks
- link notes/tasks to opportunity/person/company targets
- batch small/medium requests with max record limits
- dry-run/apply audit logging

Out of scope:

- record deletes
- metadata mutations
- workflow or webhook editing
- batch upserts GraphQL
- custom object/field lifecycle management
- LLM subagent runtime execution

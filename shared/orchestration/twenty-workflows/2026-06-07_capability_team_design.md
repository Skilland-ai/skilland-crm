# Twenty Workflows Capability Team Design

## Goal

Give future agents a repeatable way to work on Twenty workflows without improvising against the UI.

## Team proposal

| role | problem it solves | primary outputs |
| --- | --- | --- |
| `twenty-workflow-api-researcher` | Prevents false UI-only assumptions and stale docs-driven guesses | capability matrix, auth notes, source-backed rulings |
| `twenty-workflow-architect` | Converts business automation intent into an API-authorable graph | trigger/step design, field map, test plan |
| `twenty-workflow-safety-reviewer` | Blocks unsafe activation and broad trigger blast radius | allow/revise/block recommendation |
| `twenty-workflow-implementer` | Builds or updates draft/test workflows by API | workflow shell, draft graph, exact IDs and mutations |
| `twenty-workflow-qa` | Produces runtime evidence and cleanup | smoke-test report, run evidence, reset confirmation |

## Why this split works

### Research is separate from implementation

Twenty workflows have enough auth nuance, guardrails, and historical false assumptions that "implement first, discover later" is expensive.

### Safety is separate from design

The design agent should optimize for correct behavior. The safety reviewer should optimize for blast-radius control and rollback.

### QA is separate from implementation

The implementer can easily over-trust authored config. QA reads runs and side effects as independent evidence.

## Shared knowledge base

Every role depends on `shared/knowledge/twenty-workflows/`.

Minimum required files:

- `2026-06-07_sources_inventory.md`
- `2026-06-07_workflow_domain_model.md`
- `2026-06-07_api_mcp_capabilities.md`
- `2026-06-07_workflow_testing_and_debugging.md`
- `2026-06-07_ui_last_resort.md`
- `examples/ia_mujeres_workflow_patterns.md`

## Shared skills

- `twenty-workflow-api-research`
- `twenty-workflow-design`
- `twenty-workflow-implementation`
- `twenty-workflow-smoke-test`
- `twenty-workflow-safety-review`

## Orchestration flow

### 1. Research gate

Run:

- `twenty-workflow-api-researcher`

Exit condition:

- exact API path is known
- auth is known
- UI-last-resort status is known

### 2. Design gate

Run:

- `twenty-workflow-architect`

Exit condition:

- trigger, steps, fields, rollback, and test plan are specified

### 3. Safety gate

Run:

- `twenty-workflow-safety-reviewer`

Exit condition:

- explicit allow / revise / block recommendation

### 4. Implementation gate

Run only after safety pass:

- `twenty-workflow-implementer`

Exit condition:

- draft or test workflow is authored
- readback confirms state

### 5. Runtime validation gate

Run:

- `twenty-workflow-qa`

Exit condition:

- workflow run evidence exists
- affected records were verified
- cleanup/reset is complete

## How to invoke from Codex or Claude Code

### Minimal manual invocation pattern

1. Read the relevant knowledge files.
2. Pick the matching skill in `shared/skills/twenty-workflows/`.
3. If using subagents, delegate to the matching draft agent spec in `shared/agents/twenty-workflows/`.
4. Keep all conclusions in repo-local markdown reports.

### Minimal single-agent fallback

If subagents are unavailable, emulate the same order manually:

1. research
2. design
3. safety review
4. implementation
5. QA

## How this team avoids improvisation

- Every role has mandatory knowledge files.
- The first role is explicitly a research gate.
- The safety reviewer is allowed to block activation.
- The implementation role is not allowed to invent missing API paths.
- The QA role must verify side effects through run data and record reads.

## How this team forces API/MCP-first

1. `2026-06-07_ui_last_resort.md` starts from "not proven UI-only".
2. Skills instruct agents to use GraphQL, Metadata API, scripts, and MCP record tools first.
3. The research role must disprove or confirm UI necessity before anyone relies on it.
4. The implementation role is centered on draft-safe mutation paths, not editor clicks.

## Inputs and outputs by stage

| stage | inputs | outputs |
| --- | --- | --- |
| research | business need, object names, suspected constraints | capability memo |
| design | capability memo, business rule | workflow blueprint |
| safety | workflow blueprint | safety verdict |
| implementation | approved blueprint | authored draft/test workflow |
| QA | authored workflow + test data | test report |

## Minimum viable usage

If the task is small, do not collapse to one generic role. At minimum use:

- researcher
- architect
- safety reviewer

That is enough to stop the most common failure mode: editing workflows from assumptions.

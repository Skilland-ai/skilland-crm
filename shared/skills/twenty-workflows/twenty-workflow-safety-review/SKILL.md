---
name: twenty-workflow-safety-review
description: Review a Twenty workflow or workflow plan for blast radius, auth assumptions, isolation gaps, side effects, and unsafe activation paths. Use before implementing or activating any workflow that could touch real Opportunities, Tasks, messages, or custom fields, and whenever a workflow seems convenient but not yet production-safe.
---

# Twenty Workflow Safety Review

## Purpose

Act as the gatekeeper before implementation or activation.

## Use when

- a workflow is about to be implemented
- a draft is about to be activated
- a design mentions emails, stage moves, cron, or broad database triggers
- isolation or rollback is weak

## Inputs

- workflow design or current draft graph
- target fields and objects
- test and production scope
- activation intent

## Outputs

- risk list
- allow / revise / block recommendation
- required mitigations
- rollback expectations

## Read first

1. `shared/knowledge/twenty-workflows/2026-06-07_api_mcp_capabilities.md`
2. `shared/knowledge/twenty-workflows/2026-06-07_workflow_testing_and_debugging.md`
3. `shared/knowledge/twenty-workflows/2026-06-07_ui_last_resort.md`

## Workflow

1. Check the trigger blast radius.
2. Inspect the first executable gate.
3. Check for unapproved side effects:
   - email
   - broad stage moves
   - cron or webhook exposure
4. Check auth assumptions and whether the implementation path is actually available.
5. Confirm rollback/reset is realistic.
6. Only approve activation when all blockers are closed.

## API/MCP-first rules

- Reject any plan that defaults to UI without proof.
- Prefer reversible GraphQL and metadata operations over manual editor work.
- Require a documented workaround whenever MCP coverage is missing.

## Safety restrictions

- never approve production activation without explicit confirmation
- never approve a workflow lacking campaign/test isolation when it uses `DATABASE_EVENT`
- never approve send-email actions in a smoke-test workflow

## Acceptance checklist

- trigger scope reviewed
- first-step safety gate reviewed
- side effects inventoried
- rollback/reset reviewed
- final recommendation clearly stated

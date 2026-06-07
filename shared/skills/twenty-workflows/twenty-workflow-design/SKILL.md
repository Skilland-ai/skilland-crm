---
name: twenty-workflow-design
description: Design Twenty workflows from business rules into safe trigger-step graphs with explicit field dependencies, filters, run strategy, and rollback. Use whenever a workflow needs to be specified before implementation, especially for CRM automations on Opportunities, Tasks, notes, or custom fields, and whenever the team must force API/MCP-first thinking instead of defaulting to UI.
---

# Twenty Workflow Design

## Purpose

Turn a business automation request into a workflow design that is safe, testable, and API-authorable.

## Use when

- the user wants a new workflow pattern
- an existing workflow needs redesign
- a smoke test needs a draft implementation plan
- field mapping, trigger choice, or idempotency logic is still fuzzy

## Inputs

- business rule
- target object and field names
- required outcomes
- isolation constraints
- test strategy expectations

## Outputs

- trigger selection
- condition strategy
- ordered step graph
- data dependencies
- safety filter
- test procedure
- rollback/reset notes

## Read first

1. `shared/knowledge/twenty-workflows/2026-06-07_workflow_domain_model.md`
2. `shared/knowledge/twenty-workflows/2026-06-07_api_mcp_capabilities.md`
3. `shared/knowledge/twenty-workflows/2026-06-07_workflow_testing_and_debugging.md`
4. `shared/knowledge/twenty-workflows/examples/ia_mujeres_workflow_patterns.md`

## Workflow

1. Pick the minimal trigger that matches the business event.
2. Put isolation and eligibility checks in the first executable step.
3. Separate record mutation from external side effects.
4. Prefer deterministic steps over CODE unless date math or transformation truly needs it.
5. Design rollback and reset before calling the workflow complete.

## API/MCP-first rules

- Design for `createWorkflow` plus trigger/step/edge mutations.
- Favor `FILTER`, `IF_ELSE`, record CRUD, and `runWorkflowVersion` over UI interactions.
- Do not rely on UI-only edits such as "someone will complete the branch in the canvas later" unless that gap is proven.

## Safety restrictions

- no send-email actions by default
- no activation in the design phase
- no production record assumptions
- stage writes only if the target value is known to exist in the workspace

## Acceptance checklist

- trigger is explicitly justified
- first-step safety gate is defined
- required fields are listed by name
- actions map cleanly to available API capabilities
- rollback/reset is included

---
name: twenty-workflow-implementation
description: Implement Twenty workflows through GraphQL, Metadata API, scripts, and repo-local workflow tools. Use when a workflow has already passed design and safety review and now needs a draft version, trigger, steps, edges, positions, or test records created without falling back to the UI.
---

# Twenty Workflow Implementation

## Purpose

Execute the API-first authoring path for Twenty workflows.

## Use when

- a workflow shell or draft version must be created
- steps or edges must be authored programmatically
- a test workflow must be assembled
- an existing draft must be updated safely

## Inputs

- approved workflow design
- object and field names
- trigger payload shape
- exact step definitions
- safety constraints

## Outputs

- created or updated workflow shell
- configured draft version
- created/updated steps and edges
- activation-ready state only if explicitly requested

## Read first

1. `shared/knowledge/twenty-workflows/2026-06-07_api_mcp_capabilities.md`
2. `shared/knowledge/twenty-workflows/2026-06-07_workflow_testing_and_debugging.md`
3. `shared/knowledge/twenty-workflows/2026-06-07_ui_last_resort.md`

## Workflow

1. Create a workflow shell or clone a version.
2. Locate the current draft version.
3. Set or update the trigger.
4. Create steps with stable IDs.
5. Update each step with final settings.
6. Create edges and positions.
7. Validate through readback queries before any activation.

## API/MCP-first rules

- Preferred authoring path:
  - `createWorkflow`
  - `createDraftFromWorkflowVersion` when cloning
  - `updateWorkflowVersion` or workflow trigger tool
  - `createWorkflowVersionStep`
  - `updateWorkflowVersionStep`
  - `createWorkflowVersionEdge`
  - `updateWorkflowVersionPositions`
- Do not use generic `workflowVersion.createOne`.
- Do not replace `workflowVersion.steps` wholesale.
- Use current MCP tools for record prep and relation checks when useful, but expect GraphQL for workflow authoring itself.

## Safety restrictions

- no production activation without explicit user approval
- no live email steps in implementation tests
- no edits to active specs
- no writes to real non-test records during smoke-implementation work

## Acceptance checklist

- draft version exists and is readable
- trigger shape matches the intended event
- step graph is fully authored by API
- no stale "finish in UI later" dependency remains unless documented as last resort
- activation, if requested, happens only after safety review

---
name: twenty-workflow-smoke-test
description: Run isolated smoke tests for Twenty workflows using test records, test workflows, workflow runs, and cleanup scripts. Use whenever a workflow needs execution proof, run inspection, task verification, reset logic, or blast-radius validation before anyone touches a real workflow or real campaign data.
---

# Twenty Workflow Smoke Test

## Purpose

Validate workflow behavior on isolated test data and produce a report.

## Use when

- a draft workflow needs runtime proof
- a trigger/condition/action chain must be validated
- a regression check is needed after workflow edits
- a workflow run must be inspected and cleaned up

## Inputs

- workflow ID/version ID if they already exist
- test campaign and business-line values
- expected trigger event
- expected record side effects

## Outputs

- pass/fail test notes
- workflow run evidence
- created record evidence
- cleanup/reset confirmation
- explicit unknowns

## Read first

1. `shared/knowledge/twenty-workflows/2026-06-07_workflow_testing_and_debugging.md`
2. `shared/knowledge/twenty-workflows/examples/ia_mujeres_workflow_patterns.md`
3. `04_outputs/ia_mujeres_smoke_test/2026-06-07_workflow_test_report.md`

## Workflow

1. Prepare or reuse isolated test records.
2. Confirm first-step safety gate exists.
3. Prefer `runWorkflowVersion` for manual/draft tests.
4. If database-event behavior must be proven, activate only an isolated `TEST -` workflow.
5. Query `workflowRuns` and affected records.
6. Reset records and remove test artifacts.
7. Write a report.

## API/MCP-first rules

- Use Metadata API for `testMode` and views.
- Use Core GraphQL or MCP for test records and task inspection.
- Use run queries, not UI panels, as the primary debug source.

## Safety restrictions

- test records only
- no production workflows
- no send-email steps unless separately approved
- cleanup is part of the task, not optional

## Acceptance checklist

- test inputs were isolated
- run evidence was captured
- record effects were verified
- reset and cleanup were performed or explicitly documented as pending
- remaining unknowns are listed

---
name: crm-manual-review-orchestration
description: Orchestrate a manual CRM deal review through one user-facing secretary agent that delegates retrieval, interviewing, planning, QA, execution, and logging.
---

# CRM Manual Review Orchestration

## Purpose

Run the CRM Manual Update Crew as a single conversational experience.

## Use when

- the user wants to review deals in Skilland CRM
- the user wants deal updates applied safely from terminal
- the user expects a secretary-like workflow instead of direct UI editing

## Workflow

1. Clarify the review group only if it cannot be inferred.
2. Retrieve real CRM metadata and deal context.
3. Review one deal at a time.
4. Translate user input into proposed operations.
5. Show summary and ask for confirmation.
6. Execute only in apply mode and only after confirmation.
7. Save a local session log.

## Safety

- dry-run by default
- no writes without explicit confirmation
- no direct DB writes
- no deletes
- ask when entity matching is ambiguous


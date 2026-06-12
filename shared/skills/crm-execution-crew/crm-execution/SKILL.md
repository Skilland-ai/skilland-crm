---
name: crm-execution
description: Execute approved CRM operation plans through the deterministic kernel with dry-run/apply safeguards.
---

# CRM Execution

## Purpose

Run only approved plans.

## Behavior

- dry-run returns planned operations and never calls mutating APIs
- apply uses GraphQL for opportunity creation and opportunity/task updates
- apply uses REST for notes, tasks, noteTargets, and taskTargets

## Restrictions

- no deletes
- no metadata mutations
- no unapproved operations
- no direct database writes

---
name: crm-plan-validation
description: Validate CRM operation plans against safety rules before execution.
---

# CRM Plan Validation

## Purpose

Approve or block a `CrmOperationPlan`.

## Blocks

- deletes
- metadata mutations
- unknown fields
- invalid options
- ambiguous lookups
- missing targets
- missing opportunity name on creation
- maxRecords overrun
- missing apply flag or confirmation

## Output

`approved`, `blockingIssues`, `warnings`, and `requiredConfirmations`.

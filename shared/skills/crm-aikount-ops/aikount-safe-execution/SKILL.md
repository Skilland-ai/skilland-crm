---
name: aikount-safe-execution
description: Review and gate AIKount execution plans with dry-run/apply safeguards, confirmation requirements, and scope checks. Use before any live AIKount mutation, especially for quote or invoice creation, update, acceptance, conversion, issue, share, or send flows.
---

# AIKount Safe Execution

## Rules

- Dry-run is the default.
- Apply requires explicit confirmation.
- Block when target documents or contacts are ambiguous.
- Block when the plan exceeds allowed scope.
- Block invoice send when the invoice is not issued.

## Restrictions

- No deletes in v1.
- No CRM write-backs.
- No silent fallback to stale docs when OpenAPI disagrees.

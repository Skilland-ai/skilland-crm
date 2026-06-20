---
name: crm-aikount-context-readonly
description: Read Twenty CRM in strict read-only mode for CRM AIKount Ops. Use when AIKount planning needs a concrete deal snapshot with opportunity, company, point of contact, amount, stage, and address context, and whenever the user explicitly does not want CRM write-backs or schema changes.
---

# CRM AIKount Context Readonly

## Rules

- Resolve the deal from URL, id, or text search.
- Read only the fields needed for AIKount planning.
- Prefer opportunity, company, point of contact, amount, stage, and address.
- If multiple deals match, ask the user to choose or block.

## Restrictions

- No CRM writes.
- No notes, tasks, field creation, or metadata changes.

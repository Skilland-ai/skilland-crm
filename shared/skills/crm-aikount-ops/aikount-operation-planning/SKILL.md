---
name: aikount-operation-planning
description: Convert CRM context plus interview answers into exact AIKount REST operations and stable local identifiers. Use when the user has chosen a quote or invoice action and the system needs a dry-run plan with exact payloads, follow-up sequencing, local registry keys, and idempotent create behavior.
---

# AIKount Operation Planning

## Outputs

- exact AIKount operation list
- request payloads
- follow-up sequencing
- local `documentKey`
- local mapping metadata

## Rules

- Use `external_source = "skilland-crm"` for created documents.
- Use stable local `documentKey` values.
- Prefer local registry mappings before manual ids.
- Keep create, update, convert, issue, share, and send steps explicit.

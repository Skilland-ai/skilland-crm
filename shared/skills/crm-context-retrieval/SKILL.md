---
name: crm-context-retrieval
description: Retrieve Twenty CRM metadata, opportunities, notes, tasks, contacts, companies, business lines, stages, and supported custom fields for safe manual review.
---

# CRM Context Retrieval

## APIs

- Use `/graphql` for CRM records.
- Use `/rest/metadata/objects` for object and field metadata.
- Use `/rest` for activity creation only when execution is confirmed.

## Required context per deal

- opportunity id, name, stage, amount, owner, updatedAt
- company and point of contact
- business line relation or `businessLineName`
- latest notes through `noteTargets`
- open tasks through `taskTargets`
- relevant existing custom fields only when present

## Rules

- Do not query fields that are not present in metadata.
- Prefer metadata stage options over hardcoded labels.
- Return ambiguity instead of guessing.


---
name: crm-change-planning
description: Convert CRM review answers into explicit updateOpportunity, createNote, createTask, and updateTask operations with validation against real metadata.
---

# CRM Change Planning

## Operation planning

- Stage changes must match a real stage option.
- Amounts become `{ amountMicros, currencyCode }`.
- Task closures must match exactly one open task or ask the user.
- Next-step updates use an existing next-step field if present; otherwise add
  the next step to a note/task.

## Output

Return a list of explicit operations:

- `update_deal`
- `create_note`
- `create_task`
- `close_task`

Each operation must include a human-readable summary and exact payload.


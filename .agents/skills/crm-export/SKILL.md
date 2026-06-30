---
name: crm-export
description: Generate the read-only CRM export Markdown for ChatGPT in 04_outputs/crm_manual_update_session, always excluding IA Mujeres, by running the repo export script.
---

Use this skill when the user wants a current CRM export for external review or handoff.

## Rules

- Keep the flow read-only.
- Do not run GraphQL mutations.
- Do not create or update notes, tasks, stages, values, or any CRM records.
- Do not reveal secrets or API keys.
- Always exclude IA Mujeres.

Exclude a deal when there is any clear IA Mujeres signal, including:

- `businessLine` or `businessLineName` containing `IA Mujeres` or `SkilLand IA Mujeres`
- deal name containing `IA Mujeres`
- `campaignName` containing `IA Mujeres`
- `iaMujeresFunnelStage` with any value
- notes, tasks, tags, or custom fields indicating the dedicated IA Mujeres funnel

## Execution

1. Run `node scripts/crm_manual_update_crew/export-para-chatgpt.mjs`.
2. Reuse the existing export script instead of reimplementing the workflow.
3. Report:
   - executed command
   - generated Markdown path
   - total deals read
   - total deals exported
   - total IA Mujeres deals excluded
   - confirmation that nothing was written to CRM

`yarn crm:export` is an equivalent repo alias when Yarn is initialized.

## Expected output file

`04_outputs/crm_manual_update_session/crm_export_para_chatgpt_<timestamp>.md`

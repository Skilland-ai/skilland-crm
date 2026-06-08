---
name: crm-safe-execution-audit
description: Audit and execute confirmed CRM manual-update operations safely, with dry-run support and local logging.
---

# CRM Safe Execution Audit

## Pre-write checklist

- mode is visible: dry-run or apply
- operation list is shown to the user
- confirmation is explicit
- no delete operation exists
- all target IDs are known
- ambiguous matches are resolved

## Execution rules

- Dry-run never calls mutating APIs.
- Apply mode writes only the confirmed operations.
- Record result IDs and failures.
- Save a session log in `04_outputs/crm_manual_update_crew/logs/`.


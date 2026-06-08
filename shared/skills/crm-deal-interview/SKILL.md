---
name: crm-deal-interview
description: Conduct a concise deal-by-deal interview for manual CRM updates, accepting natural language and quick commands.
---

# CRM Deal Interview

## Prompt style

Show the current deal context and ask: `Que ha cambiado con este deal?`

## Supported commands

- `skip`
- `nota: ...`
- `mover a ...`
- `importe 16000`
- `crear tarea ...`
- `cerrar tarea ...`
- `siguiente paso: ...`
- `resumen`
- `confirmar`
- `cancelar`

## Rules

- Keep the user moving.
- Ask follow-up questions only for ambiguity or risk.
- Treat free-form updates as user-provided note material, not invented facts.


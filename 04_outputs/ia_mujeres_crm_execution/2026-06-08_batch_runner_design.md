# Batch Runner Design — IA Mujeres

## Decision

Conviene una combinacion:

- Script/runner para ejecucion determinista.
- Skill repo-local para guiar agentes y operadores.
- Workflows CRM solo para tareas internas y cambios de estado, no para envio de emails.

## Runner actual

`scripts/ia_mujeres_experiment_00_gws_lab.mjs`

Safeguards:

- Dry-run por defecto.
- Destinatarios de test en whitelist cerrada.
- From/To fijos en Experimento 0.
- Envio bloqueado sin `--confirm-internal-send`.
- No acepta contactos externos.
- Firma obligatoria desde Gmail `sendAs`.
- Evento local por cada accion.
- Cleanup de draft no enviado con `--delete-draft`.

## Runner de tanda futura

Nombre propuesto:

```bash
scripts/ia_mujeres_batch_runner.mjs
```

Comandos:

```bash
node scripts/ia_mujeres_batch_runner.mjs --prepare-next-batch --limit=5
node scripts/ia_mujeres_batch_runner.mjs --create-drafts --batch-id=<id>
node scripts/ia_mujeres_batch_runner.mjs --verify-drafts --batch-id=<id>
node scripts/ia_mujeres_batch_runner.mjs --send-approved --batch-id=<id> --confirm-send
node scripts/ia_mujeres_batch_runner.mjs --analyze-replies
node scripts/ia_mujeres_batch_runner.mjs --write-next-actions
```

Entradas:

- Campaign: `IA Mujeres 2026`.
- Business line: `SkilLand IA Mujeres`.
- Vista/consulta: pending first email, high confidence, no manual review.
- Limite de tanda: 5.
- Plantilla: Email 1 aprobado.
- Asset: presentacion corta.
- IDs CRM por deal/person/company.

Salidas:

- `batch_<id>_plan.json`
- `batch_<id>_drafts.json`
- `batch_<id>_review.md`
- `events.ndjson`
- `NEXT_ACTIONS.md`

## Evitar envios accidentales

- Ningun envio directo al crear drafts.
- `--send-approved` exige batch aprobado y flag de confirmacion.
- Bloquear si falta `crm_deal_id`.
- Bloquear si destinatario no coincide con email CRM.
- Bloquear si `needsManualReview=true`.
- Bloquear si `duplicatePossible=true`.
- Bloquear si falta adjunto o firma.
- No enviar mas de 5 por tanda salvo override explicito.

## CRM mapping

Antes de primera tanda real, crear o aprobar estos campos en Opportunity:

- `gmailDraftId` TEXT
- `gmailMessageId` TEXT
- `gmailThreadId` TEXT
- `lastEmailEventAt` DATE_TIME
- `lastEmailEventType` TEXT

Alternativa menos invasiva: mantener `events.ndjson` y crear notas/tareas en CRM. Para escala real, los campos de Gmail ID son mejores.

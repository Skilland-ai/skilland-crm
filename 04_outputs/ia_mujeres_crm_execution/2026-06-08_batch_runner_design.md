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
- Eventos persistidos para recepcion, reply y bounce checks.
- Cleanup de draft no enviado con `--delete-draft`.

Estado: Experimento 0 aprobado. El runner de laboratorio no acepta destinatarios externos y no debe reutilizarse como runner de tanda real.

## Runner de tanda

Implementado parcialmente:

```bash
scripts/ia_mujeres_batch_runner.mjs
```

Comando activo:

```bash
node scripts/ia_mujeres_batch_runner.mjs --prepare-next-batch --limit=5
```

Comandos bloqueados intencionadamente hasta cerrar mapeo Gmail ID y autorizacion humana:

```bash
node scripts/ia_mujeres_batch_runner.mjs --create-drafts --batch-id=<id>
node scripts/ia_mujeres_batch_runner.mjs --send-approved --batch-id=<id> --confirm-send
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
- `batch_<id>_review.md`

Dry-run ejecutado:

- Batch ID: `2026-06-07T23-57-37-918Z`.
- Opportunities CRM vistas: `145`.
- Opportunities IA Mujeres vistas: `100`.
- Elegibles: `22`.
- Seleccionadas para revision: `5`.
- Excluidas: `78`.
- Plan: `04_outputs/ia_mujeres_crm_execution/batch_2026-06-07T23-57-37-918Z_plan.json`.
- Revision: `04_outputs/ia_mujeres_crm_execution/batch_2026-06-07T23-57-37-918Z_review.md`.

## Evitar envios accidentales

- El runner actual solo prepara batch plan.
- No crea drafts.
- No envia emails.
- `--limit` esta capado a 5.
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

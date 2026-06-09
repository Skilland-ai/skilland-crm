# IA Mujeres — Bounce Correction Report

Fecha: 2026-06-08

## Resumen

Se corrigieron dos emails que habían sido contados inicialmente como enviados buenos, pero que Gmail devolvió como no entregados.

Resultado corregido:

- Emails comerciales enviados técnicamente: 30.
- Emails comerciales sin bounce detectado: 28.
- Bounces detectados: 2.
- CRM IA Mujeres: `EMAIL_1_SENT = 28`, `WRONG_CONTACT_MANUAL_REVIEW = 2`, `NOT_SENT = 70`.

## Bounces confirmados

| Deal | Email | Gmail bounce message | Thread | Motivo |
|---|---|---|---|---|
| Ayuntamiento de La Aldea de San Nicolas — IA Mujeres 2026 | `oac@aytolaaldea.com` | `19ea769149e712e3` | `19ea768968241bc3` | `554 5.2.2 mailbox full` |
| Ayuntamiento de Antigua — IA Mujeres 2026 | `services.sociales@ayto-antigua.es` | `19ea774d5ea24c5f` | `19ea76ebb322c648` | `550 5.4.1 Recipient address rejected` |

## Cambios aplicados

Se añadieron dos eventos `bounce_detected` en:

- `04_outputs/ia_mujeres_crm_execution/events.ndjson`

Se ejecutó:

```bash
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-bounces --apply
```

Resultado:

- `matched = 2`
- `unmatched = 0`

## Estado CRM aplicado

Para ambos deals:

- `iaMujeresFunnelStage = WRONG_CONTACT_MANUAL_REVIEW`
- `outreachStatus = bounce_detected`
- `lastEmailEventType = bounce_detected`
- nota `[IA Mujeres] Bounce detectado`
- tarea nueva `[IA Mujeres] Revisar bounce / contacto incorrecto`, asignada a Raúl Artiles
- tarea anterior `[IA Mujeres] Revisar respuesta / preparar Follow-up 1` cerrada como `DONE`

## Tareas después de la corrección

- Tareas IA Mujeres totales: 64, incluyendo 2 duplicados accidentales cerrados durante la prueba de idempotencia.
- Tareas IA Mujeres abiertas: 30.
- Revisar draft Email 1: 30 `DONE`.
- Revisar respuesta / preparar Follow-up 1: 28 `TODO`, 2 `DONE`.
- Revisar bounce / contacto incorrecto: 2 `TODO`, 2 duplicadas `DONE`.

Después de detectar el riesgo, `sync-bounces` quedó parcheado para reutilizar tareas existentes y marcar `alreadyRecorded` cuando el evento ya está aplicado, sin crear nota/tarea nueva.

## Reportes regenerados

- `04_outputs/ia_mujeres_crm_execution/weekly_report_2026-06-08.md`
- `04_outputs/ia_mujeres_crm_execution/weekly_report_2026-06-08.html`
- `04_outputs/ia_mujeres_crm_execution/2026-06-08_crm_audit.json`

El weekly report ahora diferencia explícitamente `Emails comerciales enviados` de `Emails comerciales sin bounce detectado`.

## Scanner preventivo añadido

Se añadió:

- `scripts/ia_mujeres_scan_gmail_bounces.mjs`

Y el harness `sync-signals` ahora ejecuta primero el scanner de Gmail, después `sync-replies`, después `sync-bounces` y finalmente `reconcile-tasks`.

Uso recomendado:

```bash
GWS_GERENCIA_CONFIG_DIR=/home/reboot/.config/gws node scripts/ia_mujeres_operator_harness.mjs --action=sync-signals --apply
```

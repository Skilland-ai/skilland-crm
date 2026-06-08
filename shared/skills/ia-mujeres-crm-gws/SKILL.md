---
name: ia-mujeres-crm-gws
description: Operar la campaña IA Mujeres desde skilland-crm con Twenty CRM como centro comercial y Google Workspace como canal controlado. Audita CRM, prepara tandas, registra drafts/envíos, sincroniza replies/bounces, crea notas/tareas y genera reportes sin tocar contactos reales sin autorización.
---

# IA Mujeres CRM/GWS

## Uso

Usa esta skill cuando haya que ejecutar o supervisar la operación CRM/GWS de IA Mujeres:

- vista y estados Twenty CRM;
- preparación de tanda diaria;
- payloads o drafts seguros;
- registro de eventos Gmail en Opportunity;
- notas y tareas CRM;
- comprobación de recepción, respuestas y bounces;
- reporte semanal.

## Reglas

- No rediseñar el funnel ni el copy de Funnel Academy.
- No enviar contactos externos sin autorización humana explícita.
- No crear drafts externos sin tanda aprobada.
- Mantener Twenty CRM como centro de mando.
- Registrar `gmailDraftId`, `gmailMessageId` y `gmailThreadId` en Opportunity cuando existan.
- Crear nota y tarea en CRM para draft, envío, reply y bounce.
- Asignar tareas IA Mujeres a Raúl Artiles (`raul@reboot.academy`).
- Al avanzar de paso, cerrar la tarea anterior antes de crear la siguiente.
- No usar aperturas como KPI principal.
- No reescribir links aprobados para tracking salvo nueva aprobación.
- No versionar secretos.

## Comandos principales

Usa primero el harness operativo. Solo baja a runners específicos para depurar o ejecutar una fase aislada.

```bash
node scripts/ia_mujeres_operator_harness.mjs --action=status
node scripts/ia_mujeres_operator_harness.mjs --action=prepare-next-batch --limit=5
node scripts/ia_mujeres_operator_harness.mjs --action=launch-approved-batch --batch-id=<id> --apply --confirm-create-external-drafts --confirm-send-approved-drafts
node scripts/ia_mujeres_operator_harness.mjs --action=sync-signals --apply
node scripts/ia_mujeres_operator_harness.mjs --action=reconcile-tasks --apply
node scripts/ia_mujeres_operator_harness.mjs --action=weekly-report
node scripts/ia_mujeres_operator_harness.mjs --action=email-weekly-report --apply --confirm-send-weekly-report
```

Referencia completa: `shared/skills/ia-mujeres-crm-gws/references/operator_harness.md`.

## Runners específicos

```bash
node scripts/ia_mujeres_daily_operator.mjs --limit=5 --weekly
node scripts/ia_mujeres_batch_runner.mjs --mode=audit
node scripts/ia_mujeres_batch_runner.mjs --mode=select-batch --limit=5
node scripts/ia_mujeres_batch_runner.mjs --mode=prepare-drafts --batch-id=<id>
node scripts/ia_mujeres_batch_runner.mjs --mode=mark-draft-created --batch-id=<id> --draft-map=<json> --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=mark-email-sent --batch-id=<id> --sent-map=<json> --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-replies --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-bounces --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=prepare-followups --limit=5
node scripts/ia_mujeres_batch_runner.mjs --mode=reconcile-tasks --apply
node scripts/ia_mujeres_weekly_report.mjs --week=<yyyy-mm-dd>
```

## Experimento 0 interno

```bash
node scripts/ia_mujeres_experiment_00_gws_lab.mjs --create-draft
node scripts/ia_mujeres_experiment_00_gws_lab.mjs --verify-draft --draft-id=<draft_id>
node scripts/ia_mujeres_experiment_00_gws_lab.mjs --check-reception --check-replies --check-bounce --thread-id=<thread_id>
```

## Outputs clave

- `04_outputs/ia_mujeres_crm_execution/2026-06-08_crm_audit.json`
- `04_outputs/ia_mujeres_crm_execution/2026-06-08_crm_setup_apply_report.json`
- `04_outputs/ia_mujeres_crm_execution/batch_<id>_plan.json`
- `04_outputs/ia_mujeres_crm_execution/batch_<id>_review.md`
- `04_outputs/ia_mujeres_crm_execution/batch_<id>_draft_payloads.json`
- `04_outputs/ia_mujeres_crm_execution/batch_<id>_draft_review.md`
- `04_outputs/ia_mujeres_crm_execution/weekly_report_<yyyy-mm-dd>.md`
- `04_outputs/ia_mujeres_crm_execution/weekly_report_<yyyy-mm-dd>.html`

## Secuencia recomendada

1. Ejecutar `operator_harness --action=status`.
2. Revisar `IA Mujeres — Funnel` en Twenty.
3. Preparar siguiente tanda con `operator_harness --action=prepare-next-batch --limit=5`.
4. Revisar batch Markdown.
5. Corregir datos CRM si hay nombres, emails o entidades dudosas.
6. Crear/enviar solo con aprobación humana explícita y harness.
7. Sincronizar replies/bounces.
8. Reconciliar tareas.
9. Generar reporte semanal.

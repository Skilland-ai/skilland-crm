# Operator Harness And Subagent Report — IA Mujeres

Fecha: 2026-06-08

## Implementado

- Harness operativo central:
  `scripts/ia_mujeres_operator_harness.mjs`
- Subagent repo-local:
  `shared/agents/ia-mujeres-crm-operator/AGENT.md`
- Referencia de harness para la skill:
  `shared/skills/ia-mujeres-crm-gws/references/operator_harness.md`
- Skill actualizada:
  `shared/skills/ia-mujeres-crm-gws/SKILL.md`

## Objetivo

Reducir dispersión operacional. El harness es la puerta de entrada para:

- auditar estado;
- preparar tanda;
- crear drafts;
- enviar batch aprobado;
- sincronizar replies/bounces;
- reconciliar tareas;
- generar/enviar reporte semanal;
- reconsultar laboratorio interno.

## Safeguards

- No se crean drafts sin `--apply --confirm-create-external-drafts`.
- No se envían emails externos sin `--apply --confirm-send-approved-drafts`.
- No se envía reporte semanal sin `--apply --confirm-send-weekly-report`.
- Las acciones no mutantes rechazan `--apply`.
- El harness no reimplementa lógica de Gmail/CRM; delega en runners especializados.

## Comandos principales

```bash
node scripts/ia_mujeres_operator_harness.mjs --action=status
node scripts/ia_mujeres_operator_harness.mjs --action=prepare-next-batch --limit=5
node scripts/ia_mujeres_operator_harness.mjs --action=create-drafts --batch-id=<id> --apply --confirm-create-external-drafts
node scripts/ia_mujeres_operator_harness.mjs --action=send-batch --batch-id=<id> --apply --confirm-send-approved-drafts
node scripts/ia_mujeres_operator_harness.mjs --action=launch-approved-batch --batch-id=<id> --apply --confirm-create-external-drafts --confirm-send-approved-drafts
node scripts/ia_mujeres_operator_harness.mjs --action=sync-signals --apply
node scripts/ia_mujeres_operator_harness.mjs --action=reconcile-tasks --apply
node scripts/ia_mujeres_operator_harness.mjs --action=weekly-report
node scripts/ia_mujeres_operator_harness.mjs --action=email-weekly-report --apply --confirm-send-weekly-report
```

## Estado

Listo para uso operativo. Pendiente solo de decidir si el siguiente paso recurrente debe ejecutarse siempre vía harness o si se mantienen comandos especializados para depuración puntual.

## Validación

Comandos ejecutados:

```bash
node --check scripts/ia_mujeres_operator_harness.mjs
node scripts/ia_mujeres_operator_harness.mjs --help
node scripts/ia_mujeres_operator_harness.mjs --action=status
node scripts/ia_mujeres_operator_harness.mjs --action=weekly-report
```

Resultados:

- Sintaxis OK.
- `status`: OK, 2 pasos, sin mutación.
- `weekly-report`: OK, 1 paso, sin mutación.

Reportes de harness generados:

- `operator_harness_2026-06-08T08-48-18.506Z_status.json`
- `operator_harness_2026-06-08T08-48-26.553Z_weekly-report.json`

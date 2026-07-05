# 003 · IA Mujeres CRM Workflows

- Status: planned
- Date: 2026-06-04

## Hecho

- Auditadas capacidades de workflows de Twenty CRM (triggers, step types, API vs UI).
- Identificados 0 campos pendientes de crear.
- Diseñados 3 workflows para el funnel IA Mujeres.
- Documentado flujo de estados outreachStatus y activación segura.

## Outputs

- `04_outputs/ia_mujeres_workflows/2026-06-04_workflow_capabilities_audit.md`
- `04_outputs/ia_mujeres_workflows/2026-06-04_ia_mujeres_workflow_design.md`
- `04_outputs/ia_mujeres_workflows/2026-06-04_workflow_implementation_result.md`

## Decisiones

- Workflows creados como DRAFT — nunca se activan por script.
- Condición `campaignName == "IA Mujeres 2026"` en primer step IF_ELSE de cada workflow.
- Campos DATE_TIME para tracking completo del funnel.
- Activación manual en UI tras smoke test validado.

## Próximos pasos

- Revisar workflows en UI y completar steps si es necesario.
- Ejecutar Fase 4.1: `node scripts/ia_mujeres_crm_smoke_test_v1.mjs --apply`
- Activar workflows tras validación.
- Iniciar Fase 5 — Google Workspace CLI.

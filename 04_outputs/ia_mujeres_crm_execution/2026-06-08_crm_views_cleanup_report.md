# CRM Views Cleanup Report — IA Mujeres

Fecha: 2026-06-08

## Corrección posterior solicitada

Estado: aplicado el 2026-06-08.

El usuario indicó que las vistas creadas daban error y pidió borrar todas las vistas comerciales salvo:

- `All Opportunities`
- `By Stage (table)`
- `By Stage`

Se ejecutó un reset limpio:

- Script: `scripts/ia_mujeres_reset_crm_views.mjs --apply`
- Reporte JSON: `04_outputs/ia_mujeres_crm_execution/2026-06-08_crm_views_reset_report.json`
- Limpieza de grupos duplicados: `04_outputs/ia_mujeres_crm_execution/2026-06-08_crm_view_group_cleanup_report.json`

Resultado actual verificado por audit:

| Vista | Tipo | ID | Estado |
|---|---|---|---|
| All Opportunities | TABLE | `e692277f-39b5-495d-acff-3ba319d1fd55` | Conservada |
| By Stage (table) | TABLE | `caa64a59-593c-43eb-a483-cfd2cd597b36` | Conservada |
| By Stage | KANBAN | `c8bbf733-9889-4078-9ed2-8bdd359b0b66` | Conservada |
| IA Mujeres — Funnel | KANBAN | `01034b47-6ae2-4e66-9e95-db8b76e942b7` | Nueva vista única |

`Opportunity Record Page Fields` se conserva porque es un `FIELDS_WIDGET` interno de ficha, no una vista comercial de lista/kanban.

La nueva vista `IA Mujeres — Funnel` tiene:

- filtro único corregido: `campaignName CONTAINS IA Mujeres 2026`;
- agrupación: `iaMujeresFunnelStage`;
- campos visibles: 10;
- grupos/etapas visibles: 18;
- opportunities IA Mujeres esperadas por audit: 100.

## Corrección de operando de filtro

El frontend de Twenty no acepta `IS` para campos `TEXT`; por eso la consola mostraba:

`Unknown operand IS for TEXT filter`

Se corrigió sin recrear la vista:

- Filtro roto eliminado: `campaignName IS "IA Mujeres 2026"`.
- Filtro actual: `campaignName CONTAINS IA Mujeres 2026`.
- Filter ID actual: `98f54d72-6988-4193-b2f8-f9f8b1b7abad`.
- Reporte JSON: `04_outputs/ia_mujeres_crm_execution/2026-06-08_crm_view_filter_operand_fix_report.json`.
- Reporte de valor plano: `04_outputs/ia_mujeres_crm_execution/2026-06-08_crm_view_filter_value_fix_report.json`.

Validación añadida al audit:

- `badTextFilters: []`.
- `viewFilterValidation[0].valid = true`.

## Resultado

Estado anterior: aplicado de forma no destructiva, supersedido por la corrección posterior.

No se eliminó ninguna vista. Se reutilizaron vistas existentes cuando era seguro, se renombraron dos vistas IA Mujeres y se añadieron vistas de trabajo claras.

## Vistas encontradas antes

| Vista | Tipo | ID | Acción |
|---|---|---|---|
| All Opportunities | TABLE | `e692277f-39b5-495d-acff-3ba319d1fd55` | Conservada |
| Opportunity Record Page Fields | FIELDS_WIDGET | `88ac6fbc-3267-4c0f-98f4-b8600706534b` | Conservada |
| IA Mujeres Funnel | KANBAN | `24053c56-6bd9-47e7-afe0-461dd8084b88` | Renombrada y reconfigurada |
| By Stage (table) | TABLE | `caa64a59-593c-43eb-a483-cfd2cd597b36` | Conservada |
| By Stage | KANBAN | `c8bbf733-9889-4078-9ed2-8bdd359b0b66` | Conservada |
| IA Mujeres — Todos | TABLE | `c4f2b5a5-e454-4411-8144-5abb0b88c62a` | Renombrada |
| TEST — IA Mujeres Smoke Test | TABLE | `c50c6c82-1085-436e-a6fd-0f345bea4f7b` | Conservada |

## Vistas actualizadas

| Vista actual | ID | Cambio |
|---|---|---|
| IA Mujeres — Funnel | `24053c56-6bd9-47e7-afe0-461dd8084b88` | Kanban principal agrupado por `iaMujeresFunnelStage` |
| IA Mujeres — Lista | `c4f2b5a5-e454-4411-8144-5abb0b88c62a` | Tabla general IA Mujeres |

## Vistas creadas

| Vista | Tipo | ID | Uso |
|---|---|---|---|
| IA Mujeres — Revisión | TABLE | `eb642132-7874-430d-b6c6-44681597b6e4` | Deals con `needsManualReview=true` |
| IA Mujeres — Follow-up pendiente | TABLE | `fa65ad73-6701-4101-8468-b1926354bb68` | Deals con follow-up pendiente |
| IA Mujeres — Respuestas / Reuniones | TABLE | `8108a403-2348-42d6-adde-f4c57aad1cbe` | Deals con respuesta recibida |
| IA Mujeres — Nurturing | TABLE | `e72c84fc-f630-4162-a627-83a5b3da4dcb` | Deals en nurturing |

## Filtros

La vista principal filtra IA Mujeres mediante campaña/línea de negocio y agrupa por `iaMujeresFunnelStage`. Las vistas auxiliares añaden un filtro de estado o revisión manual.

## Limitaciones de Twenty detectadas

- No conviene borrar vistas existentes sin revisar uso humano real.
- La agrupación útil para IA Mujeres requiere campo custom `SELECT`; no es adecuado agrupar por texto libre.
- Las vistas auxiliares pueden necesitar ajuste manual fino en UI si Raúl prefiere menos pestañas.
- La vista `TEST — IA Mujeres Smoke Test` se conserva para no destruir evidencias de prueba.

## Reversión

Reversión recomendada si hiciera falta:

1. Renombrar `IA Mujeres — Funnel` a su nombre anterior.
2. Ocultar o eliminar manualmente las cuatro vistas auxiliares creadas.
3. No borrar campos hasta confirmar que no hay eventos productivos.

No se recomienda eliminar los campos creados una vez se registren emails reales.

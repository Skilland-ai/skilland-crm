# IA Mujeres CRM Import Report

- Date: 2026-06-04
- Mode: dry-run
- Business Line: SkilLand IA Mujeres
- Campaign/Funnel field: IA Mujeres 2026

## 1. Auditoria previa del CRM

- Existing companies: 113
- Existing people: 229
- Existing opportunities: 43
- Exact organization name matches: 0
- Domain matches: 1
- Exact people email matches: 0

## 2. Decision de arquitectura

- Stable business line object used: `SkilLand IA Mujeres`.
- Campaign isolation implemented with custom field `campaignName = IA Mujeres 2026` on Companies, People and Opportunities.
- Opportunity isolation uses both the native Business Line relation and a mirrored custom text field `businessLineName` for view/filter portability.
- Separate pipeline object was not available in the audited schema; isolation is enforced through filtered opportunity views instead of a dedicated pipeline.

## 3. Plan de importacion

- Organizations in source: 95
- Contacts in source: 166
- Planned deals: 100
- Deal rule: one deal per organization by default, split by area only for cabildos with multiple clear areas in contact data.

## 4. Campos creados o reutilizados

- Fields created: 49
- Fields reused: 0

## 5. Business Line

- Status: planned_create

## 6. Resultado de importacion

- Companies created: 0
- Companies updated/reused: 0
- People created: 0
- People updated/reused: 0
- Opportunities created: 0
- Opportunities updated/reused: 0

## 7. QA post-import

- Dry-run only: no live QA counters available.

## 8. Vistas

- Views created: 0
- Views reused: 0
- Views pending manual: 6

## 9. Conflictos y pendientes

- No blocking conflicts detected.

## 10. Recomendacion para Fase 4

- Proceed to workflow/funnel design only after validating the manual-review queue and deciding the first outbound batch on the new opportunity views.
- If multi-line reuse becomes common on Companies or People, promote `businessLineName` from text to a richer relation or multi-select in a later schema pass.

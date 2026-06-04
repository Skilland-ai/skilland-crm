# IA Mujeres CRM Import Report

- Date: 2026-06-04
- Mode: apply
- Business Line: SkilLand IA Mujeres
- Campaign/Funnel field: IA Mujeres 2026

## 1. Auditoria previa del CRM

- Existing companies: 207
- Existing people: 229
- Existing opportunities: 43
- Exact organization name matches: 95
- Domain matches: 77
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

- Fields created: 0
- Fields reused: 51

## 5. Business Line

- Status: reused (6a71b3ff-34c3-4af5-9b9a-e5f3a370fec8)

## 6. Resultado de importacion

- Companies created: 0
- Companies updated/reused: 95
- People created: 166
- People updated/reused: 0
- Opportunities created: 100
- Opportunities updated/reused: 0

## 7. QA post-import

- Companies tagged for campaign: 95
- People tagged for campaign: 166
- Opportunities tagged for campaign: 100
- Opportunities still pending first email: 100
- Opportunities with native Business Line relation set: 100

## 8. Vistas

- Views created: 6
- Views reused: 0
- Views pending manual: 0

## 9. Conflictos y pendientes

- No blocking conflicts detected.

## 10. Recomendacion para Fase 4

- Proceed to workflow/funnel design only after validating the manual-review queue and deciding the first outbound batch on the new opportunity views.
- If multi-line reuse becomes common on Companies or People, promote `businessLineName` from text to a richer relation or multi-select in a later schema pass.

# 004 · IA Mujeres CRM Smoke Test

- Status: planned
- Date: 2026-06-04

## Hecho

- Creados registros de prueba con prefijo `TEST —` completamente aislados.
- Campo `testMode = true` en deal de prueba.
- Simuladas transiciones de estado (pending_first_email → first_email_sent → replied).
- Verificado que workflows en DRAFT no disparan sobre datos reales.
- Email test pendiente de confirmación de cuentas (Fase 5).

## Outputs

- `04_outputs/ia_mujeres_smoke_test/2026-06-04_smoke_test_report.md`

## Decisiones

- Todos los registros de prueba usan prefijo `TEST —` y campo `testMode = true`.
- Los workflows permanecen en DRAFT hasta validación manual en UI.
- El email test no se envía hasta que el usuario confirme cuentas emisora/receptora.

## Próximos pasos

- Completar steps IF_ELSE en UI para los 3 workflows de IA Mujeres.
- Confirmar cuentas de email e iniciar Fase 5 — Google Workspace CLI.
- Activar WF-1 tras validación.

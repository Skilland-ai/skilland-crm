# 004 · IA Mujeres CRM Smoke Test

- Status: completed
- Date: 2026-06-07

## Hecho

- Creados registros de prueba con prefijo `TEST —` completamente aislados.
- Campo `testMode = true` en deal de prueba.
- Simuladas transiciones de estado (pending_first_email → first_email_sent → replied).
- Verificados WF-2 y WF-3 activos por API sobre el deal de prueba.
- Creado draft, enviado email de prueba y registrada respuesta manual desde `sales@reboot.academy`.
- Confirmado disparo de WF-2 y WF-3 con creación de tareas TEST.
- Ejecutado cleanup completo: reset del deal y borrado de tareas TEST.

## Outputs

- `04_outputs/ia_mujeres_smoke_test/2026-06-04_smoke_test_report.md`
- `04_outputs/ia_mujeres_smoke_test/2026-06-07_workflow_test_report.md`

## Output del reporte

| Prueba | Resultado | Notas |
|---|---|---|
| WF-2 creado y activado por API | ✅ ok | Script `ia_mujeres_crm_test_workflows_v1.mjs` |
| WF-3 creado y activado por API | ✅ ok | Workflow id `0e5e26bf` |
| Draft email creado (gerencia→sales) | ✅ ok | Gmail draft API |
| Email enviado | ✅ ok | `19ea2f16832465cd` |
| CRM actualizado post-envio (first_email_sent) | ✅ ok | Verificado en pasos 1-3 del smoke test |
| WF-2 disparo (filter:SUCCESS, tarea creada) | ✅ ok | Tarea `3d44292b-c27f-4369-8ba0-4ec7d7634c02` |
| Respuesta enviada desde `sales@reboot.academy` | ✅ ok | Manual |
| CRM actualizado post-respuesta (replied) | ✅ ok | `outreachStatus=replied`, `lastReplyAt=2026-06-07T16:49:49.873Z` |
| WF-3 disparo (tarea creada) | ✅ ok | Run `COMPLETED`, `filter:SUCCESS`; tarea `02c1a201-29f6-4aad-9327-2c10687151af` |
| Deal reseteado a `pending_first_email` | ✅ ok | `firstEmailSentAt=null`, `lastEmailSentAt=null`, `lastReplyAt=null` |
| Tareas TEST eliminadas | ✅ ok | Verificado con búsquedas `Responder` y `[TEST] Follow-up` = 0 |

## Decisiones

- Todos los registros de prueba usan prefijo `TEST —` y campo `testMode = true`.
- Los filtros de workflows sobre campos TEXT deben usar `CONTAINS`, no `IS`.
- El cleanup del smoke test debe dejar el deal en `pending_first_email` y sin tareas residuales.

## Próximos pasos

- Activar WF-1 cuando se quiera extender la automatización al primer toque de la secuencia.
- Mantener el patrón de smoke test con prefijo `TEST —` para futuras regresiones.

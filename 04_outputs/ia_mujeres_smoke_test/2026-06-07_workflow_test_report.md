# IA Mujeres Workflow Test Report

- Date: 2026-06-07
- Scope: WF-2 + WF-3 smoke test
- Deal TEST: `91206aa3-d290-4501-9c15-3b8064908fdd`

## Resultados

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
| Tareas TEST eliminadas | ✅ ok | Borradas WF-2 `3d44292b-c27f-4369-8ba0-4ec7d7634c02` y WF-3 `02c1a201-29f6-4aad-9327-2c10687151af`; verificado con búsquedas `Responder` y `[TEST] Follow-up` |

## Evidencia breve

- WF-3 en runs recientes: `TEST — WF-3 Respuesta recibida | COMPLETED | filter: SUCCESS`
- Limpieza validada: `list_tasks(searchTerm="Responder") -> 0` y `list_tasks(searchTerm="[TEST] Follow-up") -> 0`

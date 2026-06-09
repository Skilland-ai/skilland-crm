# CRM/GWS Execution Architecture — IA Mujeres

## Estado

El handoff de Funnel Academy esta disponible localmente y se ha usado como fuente de verdad:

- `/home/reboot/Escritorio/funnel-and-offer-academy/04_outputs/ia-mujeres-funnel/06_outputs_ready_for_execution/2026-06-07_crm_gws_execution_handoff.md`
- `/home/reboot/Escritorio/funnel-and-offer-academy/04_outputs/ia-mujeres-funnel/06_outputs_ready_for_execution/2026-06-07_sequence_ready_for_human_review.md`
- `/home/reboot/Escritorio/funnel-and-offer-academy/04_outputs/ia-mujeres-funnel/04_email_sequence/2026-06-09_email_01_v3.md`
- follow-ups, reglas de personalizacion, retargeting y `NEXT_ACTIONS.md`.

No se redisenan funnel ni copy. Este repo convierte el handoff en operacion CRM/GWS segura. La sincronizacion vigente de Email 1 queda documentada en `04_outputs/ia_mujeres_crm_execution/2026-06-09_email_01_v3_crm_sync.md`.

## Sincronizacion Email 1 v3

Estado vigente para proximas tandas:

| Campo | Valor |
|---|---|
| Referencia Funnel Academy | `2026-06-09_email_01_v3` |
| Template operativo | `email_01` sincronizado con Email 1 v3 |
| Asunto | `Una preocupación que quería compartir con usted` |
| Variables minimas | `[nombre]`, `[entidad]`, `[territorio]`, `[derivacion_si_corresponde]` |
| Adjunto Email 1 | `shared/templates/ia-mujeres/assets/Mujeres, IA y el Futuro del Trabajo · Dossier — SkilLand v2.pdf` |
| Firma | No hardcodear; validar insercion Gmail/GWS |

Reglas operativas:

- Contacto nominal fiable: `[derivacion_si_corresponde]` vacio.
- Buzon generico, email de area o interlocutor dudoso: insertar la derivacion definida en el handoff v3.
- Si faltan entidad o territorio, revisar antes de generar/enviar.
- Email 1 no debe usar el asset anterior de resumen comercial, white paper, dossier largo, link de LinkedIn en Romina, mencion economica de cierre ni link frio de calendario.
- El PDF v2 esta copiado en `shared/templates/ia-mujeres/assets/`; validar Gmail tras reautenticar GWS.

## Arquitectura decidida

Componentes:

- Twenty CRM: fuente de deals, contactos, companias, estado comercial y tareas humanas.
- GWS/Gmail: creacion de drafts, envio, lectura de metadata, recepcion, replies y bounces.
- Runner local: `scripts/ia_mujeres_experiment_00_gws_lab.mjs`.
- Runner de tanda dry-run: `scripts/ia_mujeres_batch_runner.mjs`.
- Reporte semanal local: `scripts/ia_mujeres_weekly_report.mjs`.
- Skill repo-local: `shared/skills/ia-mujeres-crm-gws/SKILL.md`.
- Eventos locales: `04_outputs/ia_mujeres_crm_execution/events.ndjson`.
- Reportes markdown/json/html en `04_outputs/ia_mujeres_crm_execution/`.

## Decisiones tecnicas

| Pregunta | Decision |
|---|---|
| Como comprobar envio | Gmail `drafts.send` devuelve `message_id`, `thread_id` y labels `SENT`. El runner no envia sin `--confirm-internal-send`. |
| Como comprobar recepcion | Buscar en la cuenta destino `sales@reboot.academy` con Gmail query `from:gerencia@skilland.ai subject:"..."`. |
| Como comprobar apertura | No usar pixel ni KPI de apertura. Senal debil: label `UNREAD` en cuenta receptora, solo para laboratorio interno. |
| Como comprobar click | No viable sin reescribir links o meter redirect/tracking. Se mantienen links aprobados, sin tracking de click. |
| Como detectar respuesta | Polling del hilo en cuenta emisora por `thread_id`; si hay mensaje no emitido por `gerencia@skilland.ai`, crear evento `reply_detected`. |
| Como detectar bounce | Busquedas heuristicas en Gmail: `mailer-daemon`, `postmaster`, `Delivery Status Notification`, `Undelivered`. |
| Guardar `message_id/thread_id` | Ahora en `events.ndjson`; para produccion se recomienda crear campos CRM `gmailDraftId`, `gmailMessageId`, `gmailThreadId`, `lastEmailEventAt`. |
| Mapear hilo con CRM | El runner debe recibir `crm_deal_id/person_id/company_id` al operar tandas reales y escribir esos IDs en cada evento. |
| Automatizable ahora | Seleccion dry-run, render de emails, creacion de drafts, validaciones, eventos locales, checks de Gmail. |
| Manual ahora | Revision de draft, envio externo, respuesta comercial, decision de reunion, aprobacion de tanda. |

## Trade-offs

- `events.ndjson` antes que campos CRM nuevos: menos invasivo para Experimento 0; suficiente para trazabilidad interna.
- Gmail API directa para drafts con adjunto: el CLI `gws --json` falla por `E2BIG` con PDF y `--upload` manda `application/octet-stream`; el runner usa `gws auth export --unmasked` solo en memoria y Gmail REST `message.raw`.
- Firma: no hardcodear firma en templates ni cuerpos. El runner lee la firma configurada de `gerencia@skilland.ai` desde Gmail `sendAs` y la inyecta en el MIME; queda pendiente reautenticar GWS porque las credenciales locales devuelven `invalid_rapt`.
- Aperturas/clicks: no se instrumentan ahora porque alterarian entregabilidad/copy y no son KPI principal.

## Operacion propuesta

1. CRM selecciona candidatos aptos.
2. Runner prepara tanda en dry-run.
3. Runner crea drafts, nunca envia por defecto.
4. Revision humana valida cuerpo Email 1 v3, derivacion si aplica, adjunto v2, firma Gmail/GWS y personalizacion.
5. Tras autorizacion explicita, envio controlado.
6. Runner registra `email_sent` y actualiza/propone actualizar CRM.
7. Runner monitoriza replies/bounces por hilo.
8. Workflows CRM crean tareas humanas cuando `outreachStatus` cambia.

## Estado actual

- Experimento 0: draft creado, verificado, enviado internamente, recibido, con reply detectado y sin bounce.
- No hay contacto externo tocado.
- No hay workflow productivo nuevo activado.
- No hay campos CRM nuevos creados para Gmail IDs.
- Hay dry-run de primera tanda generado para revision, sin drafts externos.
- Hay reporte semanal local generado en Markdown y HTML.

## Resultado Experimento 0

- Draft ID: `r5280655799861921319`.
- Sent message ID: `19ea47ccd6e6e58a`.
- Sender thread ID: `19ea476680e7031b`.
- Received message ID en `sales@reboot.academy`: `19ea47cddaba7128`.
- Reply detectado en el hilo emisor.
- Bounce check: `0` resultados.

Conclusion: el laboratorio valida GWS operativo. El siguiente bloqueo antes de contactos externos es CRM mapping y runner de tanda, no la entrega basica de Gmail.

## Resultado batch dry-run

- Runner: `scripts/ia_mujeres_batch_runner.mjs`.
- Modo: dry-run, sin drafts y sin envios.
- CRM opportunities vistas: `145`.
- IA Mujeres vistas: `100`.
- Elegibles: `22`.
- Seleccionadas para revision: `5`.
- Outputs:
  - `04_outputs/ia_mujeres_crm_execution/batch_2026-06-07T23-57-37-918Z_plan.json`
  - `04_outputs/ia_mujeres_crm_execution/batch_2026-06-07T23-57-37-918Z_review.md`

Este resultado no autoriza envio externo. Solo demuestra que la seleccion de tanda puede automatizarse de forma controlada.

## Resultado reporte semanal

- Runner: `scripts/ia_mujeres_weekly_report.mjs`.
- Modo: generacion local, sin email y sin mutar CRM.
- Outputs:
  - `04_outputs/ia_mujeres_crm_execution/weekly_report_2026-06-08.md`
  - `04_outputs/ia_mujeres_crm_execution/weekly_report_2026-06-08.html`

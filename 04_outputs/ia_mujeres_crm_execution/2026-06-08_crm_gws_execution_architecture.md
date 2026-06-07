# CRM/GWS Execution Architecture — IA Mujeres

## Estado

El handoff de Funnel Academy esta disponible localmente y se ha usado como fuente de verdad:

- `/home/reboot/Escritorio/funnel-and-offer-academy/04_outputs/ia-mujeres-funnel/06_outputs_ready_for_execution/2026-06-07_crm_gws_execution_handoff.md`
- `/home/reboot/Escritorio/funnel-and-offer-academy/04_outputs/ia-mujeres-funnel/06_outputs_ready_for_execution/2026-06-07_sequence_ready_for_human_review.md`
- `/home/reboot/Escritorio/funnel-and-offer-academy/04_outputs/ia-mujeres-funnel/04_email_sequence/2026-06-07_email_01_v2.md`
- follow-ups, reglas de personalizacion, retargeting y `NEXT_ACTIONS.md`.

No se redisenan funnel ni copy. Este repo convierte el handoff en operacion CRM/GWS segura.

## Arquitectura decidida

Componentes:

- Twenty CRM: fuente de deals, contactos, companias, estado comercial y tareas humanas.
- GWS/Gmail: creacion de drafts, envio, lectura de metadata, recepcion, replies y bounces.
- Runner local: `scripts/ia_mujeres_experiment_00_gws_lab.mjs`.
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
| Como detectar respuesta | Polling del hilo en cuenta emisora por `thread_id`; si hay mensaje no emitido por `gerencia@skilland.ai`, crear evento `reply_received`. |
| Como detectar bounce | Busquedas heuristicas en Gmail: `mailer-daemon`, `postmaster`, `Delivery Status Notification`, `Undelivered`. |
| Guardar `message_id/thread_id` | Ahora en `events.ndjson`; para produccion se recomienda crear campos CRM `gmailDraftId`, `gmailMessageId`, `gmailThreadId`, `lastEmailEventAt`. |
| Mapear hilo con CRM | El runner debe recibir `crm_deal_id/person_id/company_id` al operar tandas reales y escribir esos IDs en cada evento. |
| Automatizable ahora | Seleccion dry-run, render de emails, creacion de drafts, validaciones, eventos locales, checks de Gmail. |
| Manual ahora | Revision de draft, envio externo, respuesta comercial, decision de reunion, aprobacion de tanda. |

## Trade-offs

- `events.ndjson` antes que campos CRM nuevos: menos invasivo para Experimento 0; suficiente para trazabilidad interna.
- Gmail API directa para drafts con adjunto: el CLI `gws --json` falla por `E2BIG` con PDF y `--upload` manda `application/octet-stream`; el runner usa `gws auth export --unmasked` solo en memoria y Gmail REST `message.raw`.
- Firma: Gmail API no anade automaticamente la firma visual del cliente web. El runner lee `gmail.users.settings.sendAs.list` e inyecta la firma configurada de `gerencia@skilland.ai`.
- Aperturas/clicks: no se instrumentan ahora porque alterarian entregabilidad/copy y no son KPI principal.

## Operacion propuesta

1. CRM selecciona candidatos aptos.
2. Runner prepara tanda en dry-run.
3. Runner crea drafts, nunca envia por defecto.
4. Revision humana valida cuerpo, links, adjunto, firma y personalizacion.
5. Tras autorizacion explicita, envio controlado.
6. Runner registra `email_sent` y actualiza/propone actualizar CRM.
7. Runner monitoriza replies/bounces por hilo.
8. Workflows CRM crean tareas humanas cuando `outreachStatus` cambia.

## Estado actual

- Experimento 0: draft creado y verificado, no enviado.
- No hay contacto externo tocado.
- No hay workflow productivo nuevo activado.
- No hay campos CRM nuevos creados para Gmail IDs.

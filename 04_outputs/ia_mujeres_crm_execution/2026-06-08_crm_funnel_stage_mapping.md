# CRM Funnel Stage Mapping — IA Mujeres

Fecha: 2026-06-08

## Decisión

Twenty conserva el stage comercial nativo de Opportunity para el pipeline general y usa un campo específico de campaña para gobernar el tramo outreach IA Mujeres:

- Stage nativo Twenty: `stage`.
- Stage operativo IA Mujeres: `iaMujeresFunnelStage`.
- Estado auxiliar existente: `outreachStatus`.
- Fechas auxiliares existentes: `firstEmailSentAt`, `lastEmailSentAt`, `lastReplyAt`, `followUpDueAt`.

Motivo: IA Mujeres necesita estados previos a reunión que no encajan limpiamente en el pipeline comercial general. Separar `iaMujeresFunnelStage` evita contaminar el funnel general y permite kanban propio.

## Campo creado

- Campo: `iaMujeresFunnelStage`
- Tipo: `SELECT`
- Field ID: `d5fa21f5-b38b-4817-9d8e-a493c3dc3c60`
- Inicialización aplicada: 100 opportunities IA Mujeres con `NOT_SENT`.

## Mapeo operativo

| Stage comercial deseado | Campo real | Valor real | Tipo | Evento que lo activa | Tarea creada | Siguiente paso |
|---|---|---|---|---|---|---|
| Sin enviar | `iaMujeresFunnelStage` | `NOT_SENT` | custom select | Setup CRM o nueva opportunity IA Mujeres | Ninguna | Seleccionar tanda |
| Draft creado | `iaMujeresFunnelStage` | `DRAFT_CREATED` | custom select | `mark-draft-created --apply` | Revisar draft Email 1 | Revisión humana |
| Email 1 enviado | `iaMujeresFunnelStage` | `EMAIL_1_SENT` | custom select | `mark-email-sent --apply` tras envío aprobado | Revisar respuesta / preparar Follow-up 1 | Esperar respuesta o vencimiento |
| Email 1 recibido / señal débil | `iaMujeresFunnelStage` | `EMAIL_1_RECEIVED_SIGNAL` | custom select | Futuro sync de señal de recepción | Ninguna automática por ahora | Mantener seguimiento |
| Email 1 abierto | Evento débil, no stage principal | `lastEmailEventType=open_detected` si existe | evento | Solo si se implanta tracking fiable | Ninguna | No usar como KPI principal |
| Sin respuesta | `iaMujeresFunnelStage` | `NO_REPLY` | custom select | Vence ventana sin reply | Revisar follow-up | Preparar Follow-up 1 |
| Follow-up 1 pendiente | `iaMujeresFunnelStage` | `FOLLOW_UP_1_PENDING` | custom select | `prepare-followups` detecta vencimiento | Autorizar Follow-up 1 | Preparar draft |
| Follow-up 1 draft creado | `iaMujeresFunnelStage` | `FOLLOW_UP_1_DRAFTED` | custom select | Futuro `mark-draft-created` con template follow-up 1 | Revisar draft | Envío autorizado |
| Follow-up 1 enviado | `iaMujeresFunnelStage` | `FOLLOW_UP_1_SENT` | custom select | Futuro `mark-email-sent` con template follow-up 1 | Revisar respuesta | Esperar ventana 2 |
| Follow-up 2 pendiente | `iaMujeresFunnelStage` | `FOLLOW_UP_2_PENDING` | custom select | Vence ventana 2 sin reply | Autorizar Follow-up 2 | Preparar white paper |
| Follow-up 2 draft creado | `iaMujeresFunnelStage` | `FOLLOW_UP_2_DRAFTED` | custom select | Futuro draft follow-up 2 | Revisar adjunto largo | Envío autorizado |
| Follow-up 2 enviado | `iaMujeresFunnelStage` | `FOLLOW_UP_2_SENT` | custom select | Futuro envío follow-up 2 | Revisar señales | Nurturing si no responde |
| Nurturing | `iaMujeresFunnelStage` | `NURTURING` | custom select | Sin respuesta tras follow-up 2 | Ninguna inmediata | Revisar en ciclos |
| Respuesta recibida | `iaMujeresFunnelStage` | `REPLY_RECEIVED` | custom select | `sync-replies --apply` | Responder y valorar reunión | Gestión manual |
| Reunión propuesta | `iaMujeresFunnelStage` | `MEETING_PROPOSED` | custom select | Edición humana o futuro sync calendar | Preparar propuesta de reunión | Cerrar fecha |
| Reunión agendada | `iaMujeresFunnelStage` | `MEETING_SCHEDULED` | custom select | Confirmación humana/calendar | Preparar reunión | Ejecutar reunión |
| Reunión realizada | `iaMujeresFunnelStage` + `stage` | `MEETING_DONE` + pipeline general | mixto | Reunión completada | Diagnóstico / siguiente acción | Pasar a comercial general |
| Diagnóstico | `stage` | stage comercial general | nativo | Decisión comercial post-reunión | Tarea humana | Propuesta |
| Propuesta en preparación | `stage` | stage comercial general | nativo | Dirección comercial | Tarea humana | Presentar propuesta |
| Propuesta presentada | `stage` | stage comercial general | nativo | Dirección comercial | Seguimiento | Firma |
| Pendiente de firma | `stage` | stage comercial general | nativo | Dirección comercial | Seguimiento cierre | Ganado/perdido |
| Ganado — por arrancar | `stage` | stage comercial general | nativo | Firma/OK verbal | Onboarding | Ejecución |
| En ejecución | `stage` | stage comercial general | nativo | Arranque proyecto | Gestión delivery | Cierre |
| Cerrado ganado | `stage` | stage comercial general | nativo | Cierre comercial | Ninguna | Entrega/retención |
| Cerrado perdido | `stage` | stage comercial general | nativo | Decisión comercial | Nota de motivo | Aprendizaje |
| No interesado | `iaMujeresFunnelStage` | `NOT_INTERESTED` | custom select | Respuesta negativa humana | Ninguna o nurturing opcional | Cerrar contacto |
| Contacto incorrecto / revisión manual | `iaMujeresFunnelStage` | `WRONG_CONTACT_MANUAL_REVIEW` | custom select | Bounce o contacto inválido | Revisar contacto | Corregir persona/email |

## Estado actual tras aplicación

- Opportunities totales vistas: 145.
- IA Mujeres: 100.
- `iaMujeresFunnelStage=NOT_SENT`: 100.
- `stage=POSSIBLE_OPPORTUNITY`: 100.
- `outreachStatus=pending_first_email`: 100.
- Con `gmailThreadId`: 0.

## Limitación consciente

Los estados post-reunión deben converger al pipeline comercial general. No se han creado stages nativos nuevos porque podría afectar otras líneas comerciales.

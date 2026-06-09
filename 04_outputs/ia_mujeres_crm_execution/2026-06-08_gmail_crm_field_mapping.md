# Gmail CRM Field Mapping — IA Mujeres

Fecha: 2026-06-08

## Decisión

Los identificadores Gmail viven en Opportunity como campos de acceso rápido y se duplican en notas/eventos para histórico.

Modelo elegido:

- Opportunity: estado operativo actual y último hilo activo.
- Notes/Tasks: trazabilidad humana dentro del deal.
- `events.ndjson`: log técnico local auditable.
- Futuro EmailEvent/custom object: solo si el volumen o reporting exige histórico relacional completo.

Motivo: Raúl necesita abrir un deal y ver el hilo asociado sin buscar en outputs Markdown. Al mismo tiempo, las notas y eventos evitan perder histórico cuando haya follow-ups.

## Campos creados en Opportunity

| Campo | Tipo | Field ID | Uso |
|---|---|---|---|
| `gmailDraftId` | TEXT | `379bca26-416b-43de-a917-b4930aa0a1e5` | Draft activo pendiente de revisión |
| `gmailMessageId` | TEXT | `3c987a5b-c66f-4456-aeb8-f298d0accf57` | Último message ID enviado relevante |
| `gmailThreadId` | TEXT | `262b80f8-a4b9-4834-8a33-1c880dec9e12` | Hilo Gmail canónico para mapear replies |
| `lastEmailEventAt` | DATE_TIME | `bd1d768c-7ded-4a48-8971-a8fc56606548` | Fecha del último evento email |
| `lastEmailEventType` | TEXT | `8f61ad0d-bc3e-435d-b1b6-e98d4b6543cd` | Tipo del último evento email |
| `activeBatchId` | TEXT | `5c72cef0-7a6b-4432-b3f0-e31ec2262f78` | Tanda activa asociada |
| `lastEmailTemplate` | TEXT | `65ce3c38-b191-4c3e-985e-bf4915fb6b28` | Template usado en último evento |
| `lastEmailSubject` | TEXT | `079d6251-26fb-4389-8629-b7f5ffe2b3d5` | Asunto visible |

## Campos existentes usados

- `firstEmailSentAt`
- `lastEmailSentAt`
- `lastReplyAt`
- `followUpDueAt`
- `outreachStatus`
- `needsManualReview`
- `duplicatePossible`
- `genericEmail`

## Identidad de template vigente

Para proximos envios de Email 1, `lastEmailTemplate` puede seguir registrando `email_01`, pero no debe interpretarse como Email 1 anterior. La referencia vigente es `2026-06-09_email_01_v3`, documentada en `04_outputs/ia_mujeres_crm_execution/2026-06-09_email_01_v3_crm_sync.md`.

Valores esperados en la siguiente tanda real:

- `lastEmailTemplate`: `email_01`.
- `lastEmailSubject`: `Una preocupación que quería compartir con usted`.
- Variables minimas antes de generar/enviar: `[nombre]`, `[entidad]`, `[territorio]`, `[derivacion_si_corresponde]`.
- Buzon generico o interlocutor dudoso: derivacion insertada en el cuerpo.
- Adjunto Email 1: `Mujeres, IA y el Futuro del Trabajo · Dossier — SkilLand v2.pdf`.
- Firma: validada por Gmail/GWS; no hardcodeada en template ni cuerpo.

## Mapeo por evento

| Evento | Campos actualizados | Nota | Tarea |
|---|---|---|---|
| Draft creado | `gmailDraftId`, `iaMujeresFunnelStage=DRAFT_CREATED`, `outreachStatus=draft_created`, `lastEmailEventAt`, `lastEmailEventType=draft_created`, `activeBatchId`, `lastEmailTemplate`, `lastEmailSubject` | `[IA Mujeres] Draft Email 1 creado` | Revisar draft Email 1 |
| Email enviado | `gmailMessageId`, `gmailThreadId`, `iaMujeresFunnelStage=EMAIL_1_SENT`, `outreachStatus=sent_first_email`, `firstEmailSentAt`, `lastEmailSentAt`, `followUpDueAt`, `lastEmailEventAt`, `lastEmailEventType=email_sent` | `[IA Mujeres] Email 1 enviado` | Revisar respuesta / preparar Follow-up 1 |
| Reply detectado | `iaMujeresFunnelStage=REPLY_RECEIVED`, `outreachStatus=replied`, `lastReplyAt`, `lastEmailEventAt`, `lastEmailEventType=reply_detected` | `[IA Mujeres] Respuesta detectada` | Responder y valorar reunión |
| Bounce detectado | `iaMujeresFunnelStage=WRONG_CONTACT_MANUAL_REVIEW`, `outreachStatus=bounce_detected`, `lastEmailEventAt`, `lastEmailEventType=bounce_detected` | `[IA Mujeres] Bounce detectado` | Revisar contacto incorrecto |

## Mapeo reply -> deal

Orden de resolución:

1. `gmailThreadId` en Opportunity.
2. `gmailMessageId` si el evento lo conserva.
3. Fallback manual por recipient/email, subject y ventana temporal.

El runner `sync-replies` y `sync-bounces` ya usa `gmailThreadId` como clave canónica. Mientras no existan hilos externos productivos en CRM, los eventos quedan como `unmatched` y no se aplican cambios.

## Histórico de follow-ups

Los campos de Opportunity guardan el último estado operativo. El histórico completo queda en:

- notas del deal;
- tareas creadas/cerradas;
- `events.ndjson`;
- reportes `batch_<id>_*_report.json`.

Si la campaña escala, conviene crear un objeto `EmailEvent` o tabla auxiliar para no sobrecargar Opportunity con múltiples IDs.

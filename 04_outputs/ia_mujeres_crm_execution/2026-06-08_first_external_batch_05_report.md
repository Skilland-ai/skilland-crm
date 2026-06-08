# First External Batch 05 Report — IA Mujeres

Fecha: 2026-06-08

## Estado

Estado: enviados y registrados en CRM.

Batch ID: `2026-06-08T08-03-50-600Z`

Envío ejecutado: `2026-06-08T08:11:28.343Z`

CRM actualizado: 5 deals pasaron a `EMAIL_1_SENT` / `sent_first_email`.

## Selección

| # | Deal | Destinatario | Estado CRM |
|---:|---|---|---|
| 1 | Ayuntamiento de Galdar — IA Mujeres 2026 | `atmendoza@galdar.es` | `EMAIL_1_SENT` |
| 2 | Ayuntamiento de Barlovento — IA Mujeres 2026 | `ss.ss@barlovento.es` | `EMAIL_1_SENT` |
| 3 | Ayuntamiento de Granadilla de Abona — IA Mujeres 2026 | `emendoza@granadilladeabona.org` | `EMAIL_1_SENT` |
| 4 | Ayuntamiento de San Miguel de Abona — IA Mujeres 2026 | `servicios.generales@sanmigueldeabona.org` | `EMAIL_1_SENT` |
| 5 | Ayuntamiento de Puerto del Rosario — IA Mujeres 2026 | `t.gutierrez@puertodelrosario.org` | `EMAIL_1_SENT` |

## Gmail Drafts

| Destinatario | Draft ID | Thread ID |
|---|---|---|
| `atmendoza@galdar.es` | `r3444904680628023707` | `19ea6455961a1a53` |
| `ss.ss@barlovento.es` | `r7553919080678429269` | `19ea6455ea163fa5` |
| `emendoza@granadilladeabona.org` | `r-8277980781421050893` | `19ea6456723fb740` |
| `servicios.generales@sanmigueldeabona.org` | `r1105600918608146237` | `19ea6456f82574b0` |
| `t.gutierrez@puertodelrosario.org` | `r1386405897613727194` | `19ea645725029d69` |

## Envíos Gmail

| Destinatario | Message ID | Thread ID | Sent at |
|---|---|---|---|
| `atmendoza@galdar.es` | `19ea6496ef4a7701` | `19ea6455961a1a53` | `2026-06-08T08:11:30.333Z` |
| `ss.ss@barlovento.es` | `19ea649759d7ba48` | `19ea6455ea163fa5` | `2026-06-08T08:11:31.534Z` |
| `emendoza@granadilladeabona.org` | `19ea6497aeac3bff` | `19ea6456723fb740` | `2026-06-08T08:11:33.490Z` |
| `servicios.generales@sanmigueldeabona.org` | `19ea6498249d4a78` | `19ea6456f82574b0` | `2026-06-08T08:11:35.177Z` |
| `t.gutierrez@puertodelrosario.org` | `19ea64986b5c19c7` | `19ea645725029d69` | `2026-06-08T08:11:36.614Z` |

## Registro CRM

- Deals actualizados: 5.
- Estado IA Mujeres: `EMAIL_1_SENT`.
- Outreach status: `sent_first_email`.
- `firstEmailSentAt`, `lastEmailSentAt`, `followUpDueAt`, `gmailMessageId`, `gmailThreadId`, `activeBatchId`, `lastEmailTemplate` y `lastEmailSubject`: registrados.
- Notas creadas: 5, con título `[IA Mujeres] Email 1 enviado`.
- Tareas creadas: 5, con título `[IA Mujeres] Revisar respuesta / preparar Follow-up 1`.
- Vencimiento follow-up: `2026-06-18`.

## Validación

- From: `gerencia@skilland.ai`: OK.
- Asunto: `Una preocupación que quería compartir con usted`: OK.
- Links aprobados: OK.
- Firma Gmail: OK.
- Adjunto corto: OK.
- Nombre esperado del adjunto: OK.
- UTF-8/tildes: OK.
- Dossier largo: no adjuntado.
- Envío real: ejecutado con confirmación humana explícita.

## Auditoría posterior

- Total opportunities: 145.
- IA Mujeres: 100.
- `NOT_SENT`: 95.
- `EMAIL_1_SENT`: 5.
- `withGmailThreadId`: 5.
- Vista `IA Mujeres — Funnel`: filtro válido `campaignName CONTAINS IA Mujeres 2026`.

## Primera comprobación de señales

Ejecutada inmediatamente después del envío.

- Replies mapeadas a estos deals: 0.
- Replies no mapeadas detectadas por búsqueda Gmail: 1. No se asocia al funnel.
- Bounces mapeados: 0.
- Bounces no mapeados: 0.
- No se han aplicado cambios CRM por replies/bounces en esta comprobación.

## Archivos

- Plan: `batch_2026-06-08T08-03-50-600Z_plan.json`
- Review: `batch_2026-06-08T08-03-50-600Z_review.md`
- Payloads: `batch_2026-06-08T08-03-50-600Z_draft_payloads.json`
- Draft map: `batch_2026-06-08T08-03-50-600Z_draft_map.json`
- Gmail draft report: `batch_2026-06-08T08-03-50-600Z_external_drafts_report.json`
- CRM draft report: `batch_2026-06-08T08-03-50-600Z_mark_draft_created_report.json`
- Gmail send report: `batch_2026-06-08T08-03-50-600Z_send_report.json`
- Sent map: `batch_2026-06-08T08-03-50-600Z_sent_map.json`
- CRM sent report: `batch_2026-06-08T08-03-50-600Z_mark_email_sent_report.json`
- Reply sync report: `2026-06-08_reply_detected_sync_report.json`
- Bounce sync report: `2026-06-08_bounce_detected_sync_report.json`

## Siguiente control

Monitorizar replies y bounces con:

```bash
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-replies --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-bounces --apply
```

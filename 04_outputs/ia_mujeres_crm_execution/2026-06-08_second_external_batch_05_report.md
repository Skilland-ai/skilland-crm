# Second External Batch 05 Report — IA Mujeres

Fecha: 2026-06-08

## Estado

Estado: drafts creados, enviados y registrados en CRM.

Batch ID: `2026-06-08T08-16-30-000Z`

Envío ejecutado: `2026-06-08T08:17:15.678Z`

CRM actualizado: 5 deals pasaron a `EMAIL_1_SENT` / `sent_first_email`.

## Reply no mapeada

La reply no asociada detectada en la comprobación anterior no pertenece a la tanda comercial.

- Thread ID: `19ea476680e7031b`.
- Origen: Experimento 0 interno.
- Destinatario del experimento: `sales@reboot.academy`.
- Event ID: `cd990b24-45a7-4af4-92b2-36004145f5b1`.
- `crm_deal_id`: `null`.

Conclusión: el runner actuó correctamente al dejarla como `unmatched`. No se debe mover ningún deal de IA Mujeres a `REPLY_RECEIVED` por esa señal.

## Selección

| # | Deal | Destinatario | Estado CRM final |
|---:|---|---|---|
| 1 | Ayuntamiento de Valleseco — IA Mujeres 2026 | `elsa.montero@valleseco.es` | `EMAIL_1_SENT` |
| 2 | Ayuntamiento de Teguise — IA Mujeres 2026 | `angonzalezcc@teguise.es` | `EMAIL_1_SENT` |
| 3 | Ayuntamiento de Tijarafe — IA Mujeres 2026 | `tijarafe@tijarafe.org` | `EMAIL_1_SENT` |
| 4 | Ayuntamiento de Tacoronte — IA Mujeres 2026 | `jacarsal@aytotacoronte.org` | `EMAIL_1_SENT` |
| 5 | Ayuntamiento de Santa Ursula — IA Mujeres 2026 | `egonzalez@aytosantaursula.com` | `EMAIL_1_SENT` |

## Gmail Drafts

| Destinatario | Draft ID | Thread ID inicial |
|---|---|---|
| `elsa.montero@valleseco.es` | `r6066447827962960617` | `19ea64e4d4984c14` |
| `angonzalezcc@teguise.es` | `r-3360756822327576048` | `19ea64e511a49fba` |
| `tijarafe@tijarafe.org` | `r8720426719930322068` | `19ea64e57ad8775f` |
| `jacarsal@aytotacoronte.org` | `r8670457442347801285` | `19ea64e5bb665093` |
| `egonzalez@aytosantaursula.com` | `r5184531723170331491` | `19ea64e6051e8f89` |

## Envíos Gmail

| Destinatario | Message ID | Thread ID | Sent at |
|---|---|---|---|
| `elsa.montero@valleseco.es` | `19ea64eb904957f9` | `19ea64e4d4984c14` | `2026-06-08T08:17:17.714Z` |
| `angonzalezcc@teguise.es` | `19ea64ebcbd60915` | `19ea64e511a49fba` | `2026-06-08T08:17:18.982Z` |
| `tijarafe@tijarafe.org` | `19ea64ec4ff00d8c` | `19ea64e57ad8775f` | `2026-06-08T08:17:20.883Z` |
| `jacarsal@aytotacoronte.org` | `19ea64ecdc801be8` | `19ea64e5bb665093` | `2026-06-08T08:17:23.300Z` |
| `egonzalez@aytosantaursula.com` | `19ea64ed5a7c14c9` | `19ea64e6051e8f89` | `2026-06-08T08:17:24.837Z` |

## Validación

- From: `gerencia@skilland.ai`: OK en los 5.
- To: OK en los 5.
- Asunto: `Una preocupación que quería compartir con usted`: OK en los 5.
- Links aprobados: OK en los 5.
- Firma Gmail: OK en los 5.
- Adjunto corto: OK en los 5.
- Nombre esperado del adjunto: OK en los 5.
- UTF-8/tildes: OK en los 5.
- Dossier largo: no adjuntado.
- Envío real: ejecutado con permiso humano explícito.

## Registro CRM

- Deals actualizados: 5.
- Estado IA Mujeres: `EMAIL_1_SENT`.
- Outreach status: `sent_first_email`.
- `firstEmailSentAt`, `lastEmailSentAt`, `followUpDueAt`, `gmailMessageId`, `gmailThreadId`, `activeBatchId`, `lastEmailTemplate` y `lastEmailSubject`: registrados.
- Notas creadas: 5, con título `[IA Mujeres] Email 1 enviado`.
- Tareas creadas: 5, con título `[IA Mujeres] Revisar respuesta / preparar Follow-up 1`.
- Vencimiento follow-up: `2026-06-18`.

## Auditoría posterior

- Total opportunities: 145.
- IA Mujeres: 100.
- `NOT_SENT`: 90.
- `EMAIL_1_SENT`: 10.
- `withGmailThreadId`: 10.
- Vista `IA Mujeres — Funnel`: filtro válido `campaignName CONTAINS IA Mujeres 2026`.

## Primera comprobación de señales

Ejecutada inmediatamente después del envío.

- Replies mapeadas a estos deals: 0.
- Replies no mapeadas detectadas por búsqueda Gmail: 1, correspondiente al laboratorio interno.
- Bounces mapeados: 0.
- Bounces no mapeados: 0.
- No se han aplicado cambios CRM por replies/bounces en esta comprobación.

## Archivos

- Plan: `batch_2026-06-08T08-16-30-000Z_plan.json`
- Review: `batch_2026-06-08T08-16-30-000Z_review.md`
- Payloads: `batch_2026-06-08T08-16-30-000Z_draft_payloads.json`
- Draft review: `batch_2026-06-08T08-16-30-000Z_draft_review.md`
- Draft map: `batch_2026-06-08T08-16-30-000Z_draft_map.json`
- Gmail draft report: `batch_2026-06-08T08-16-30-000Z_external_drafts_report.json`
- CRM draft report: `batch_2026-06-08T08-16-30-000Z_mark_draft_created_report.json`
- Gmail send report: `batch_2026-06-08T08-16-30-000Z_send_report.json`
- Sent map: `batch_2026-06-08T08-16-30-000Z_sent_map.json`
- CRM sent report: `batch_2026-06-08T08-16-30-000Z_mark_email_sent_report.json`
- Reply sync report: `2026-06-08_reply_detected_sync_report.json`
- Bounce sync report: `2026-06-08_bounce_detected_sync_report.json`

## Siguiente control

Monitorizar replies y bounces con:

```bash
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-replies --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-bounces --apply
```

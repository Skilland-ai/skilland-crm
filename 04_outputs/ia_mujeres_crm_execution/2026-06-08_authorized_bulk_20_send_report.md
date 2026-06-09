# IA Mujeres — Authorized Bulk 20 Send Report

Fecha: 2026-06-08

## Estado

Enviado y registrado.

El usuario autorizó una tanda real de 20 contactos, excluyendo cualquier oportunidad de Santa Cruz y cualquier oportunidad de Cabildo de Tenerife. Se generó el plan y se ejecutaron 4 sublotes de 5 desde `gerencia@skilland.ai`.

Se crearon 20 drafts Gmail reales, se enviaron los 20 emails y se registraron los 20 eventos de envío en CRM con `gmailMessageId`, `gmailThreadId`, notas y tareas de follow-up.

## Resultado final

- Emails enviados: 20.
- Emails sin bounce detectado en esta ronda: 18.
- Bounces detectados en esta ronda: 2.
- Sublotes ejecutados: 4/4.
- CRM actualizado: 20/20.
- Estado final CRM IA Mujeres tras corrección: 28 en `EMAIL_1_SENT`, 2 en `WRONG_CONTACT_MANUAL_REVIEW`, 70 en `NOT_SENT`.
- `gmailThreadId` en CRM: 30 oportunidades.
- Tareas IA Mujeres abiertas tras corrección: 30.
- Tareas IA Mujeres históricas tras corrección: 64, incluyendo 2 duplicados cerrados durante la prueba de idempotencia.
- Reconciliación de tareas final: 0 cambios pendientes.
- Santa Cruz y Cabildo de Tenerife: no tocados.

## Incidencias operativas

La primera reautenticación quedó en `/home/reboot/.config/gws`, no en `/home/reboot/.config/gws_gerencia`. Se verificó por API que el perfil real de Gmail era `gerencia@skilland.ai` y se actualizó el runner para aceptar `GWS_GERENCIA_CONFIG_DIR=/home/reboot/.config/gws` sin relajar el safeguard de remitente.

Durante el sublote 2, Twenty devolvió rate limit:

```json
{
  "statusCode": 429,
  "messages": ["Limit reached (100 tokens per 60000 ms)"]
}
```

Los 5 emails del sublote 2 ya estaban enviados en Gmail cuando apareció el `429`. Se endureció `mark-email-sent` para ser idempotente y con retry automático, y se completó el registro CRM sin reenviar correos ni duplicar tareas existentes.

Después de la ejecución se confirmaron dos respuestas de no entrega que no habían sido sincronizadas inicialmente:

- `oac@aytolaaldea.com`: `554 5.2.2 mailbox full`.
- `services.sociales@ayto-antigua.es`: `550 5.4.1 Recipient address rejected`.

Ambos casos quedaron corregidos en CRM como `WRONG_CONTACT_MANUAL_REVIEW` mediante `sync-bounces --apply`.

## Sublotes preparados

- `2026-06-08T13-11-59-449Z_bulk20-01`
- `2026-06-08T13-11-59-449Z_bulk20-02`
- `2026-06-08T13-11-59-449Z_bulk20-03`
- `2026-06-08T13-11-59-449Z_bulk20-04`

Archivos principales:

- `04_outputs/ia_mujeres_crm_execution/2026-06-08_authorized_bulk_20_plan.json`
- `04_outputs/ia_mujeres_crm_execution/2026-06-08_authorized_bulk_20_plan.md`
- `04_outputs/ia_mujeres_crm_execution/batch_2026-06-08T13-11-59-449Z_bulk20-01_draft_payloads.json`
- `04_outputs/ia_mujeres_crm_execution/batch_2026-06-08T13-11-59-449Z_bulk20-02_draft_payloads.json`
- `04_outputs/ia_mujeres_crm_execution/batch_2026-06-08T13-11-59-449Z_bulk20-03_draft_payloads.json`
- `04_outputs/ia_mujeres_crm_execution/batch_2026-06-08T13-11-59-449Z_bulk20-04_draft_payloads.json`
- `04_outputs/ia_mujeres_crm_execution/batch_2026-06-08T13-11-59-449Z_bulk20-01_send_report.json`
- `04_outputs/ia_mujeres_crm_execution/batch_2026-06-08T13-11-59-449Z_bulk20-02_send_report.json`
- `04_outputs/ia_mujeres_crm_execution/batch_2026-06-08T13-11-59-449Z_bulk20-03_send_report.json`
- `04_outputs/ia_mujeres_crm_execution/batch_2026-06-08T13-11-59-449Z_bulk20-04_send_report.json`

## Selección preparada

| # | Deal | Email | Avisos |
|---:|---|---|---|
| 1 | Ayuntamiento de Agaete — IA Mujeres 2026 | `mcrosario@agaete.es` | limpio |
| 2 | Ayuntamiento de Mogan — IA Mujeres 2026 | `molivam@mogan.es` | limpio |
| 3 | Ayuntamiento de La Aldea de San Nicolas — IA Mujeres 2026 | `oac@aytolaaldea.com` | limpio |
| 4 | Ayuntamiento de El Pinar de El Hierro — IA Mujeres 2026 | `elpinardeelhierro@aytoelpinar.org` | limpio |
| 5 | Ayuntamiento de Guimar — IA Mujeres 2026 | `pdperez@guimar.es` | limpio |
| 6 | Ayuntamiento de Telde — IA Mujeres 2026 | `mariaeugeniamelian@telde.es` | limpio |
| 7 | Ayuntamiento de Arucas — IA Mujeres 2026 | `oarmas@arucas.org` | limpio |
| 8 | Ayuntamiento de la Villa de Santa Brigida — IA Mujeres 2026 | `adrian.garcia@santabrigida.es` | limpio |
| 9 | Ayuntamiento de la Villa de Firgas — IA Mujeres 2026 | `raquelmartel@firgas.es` | limpio |
| 10 | Ayuntamiento de Teror — IA Mujeres 2026 | `ireneortega@teror.es` | limpio |
| 11 | Ayuntamiento de Valverde — IA Mujeres 2026 | `cmbrosed@aytovalverde.org` | limpio |
| 12 | Ayuntamiento de Candelaria — IA Mujeres 2026 | `mujer2@candelaria.es` | email genérico autorizado |
| 13 | Ayuntamiento de Aguimes — IA Mujeres 2026 | `centro.igualdad@aguimes.es` | email genérico autorizado |
| 14 | Ayuntamiento de Las Palmas de Gran Canaria — IA Mujeres 2026 | `igualdad@laspalmasgc.es` | email genérico autorizado |
| 15 | Ayuntamiento de la Villa de Tegueste — IA Mujeres 2026 | `igualdad@tegueste.org` | email genérico autorizado |
| 16 | Ayuntamiento de La Oliva — IA Mujeres 2026 | `serviciossociales@laoliva.es` | email genérico autorizado |
| 17 | Ayuntamiento de Guia de Isora — IA Mujeres 2026 | `serviciossociales@guiadeisora.org` | email genérico autorizado |
| 18 | Ayuntamiento de Antigua — IA Mujeres 2026 | `services.sociales@ayto-antigua.es` | email genérico autorizado |
| 19 | Ayuntamiento de Betancuria — IA Mujeres 2026 | `ssociales@aytobetancuria.org` | email genérico autorizado |
| 20 | Ayuntamiento de El Tanque — IA Mujeres 2026 | `serviciossociales@eltanque.es` | email genérico autorizado |

## Exclusiones duras aplicadas

| Deal | Email | Motivo |
|---|---|---|
| Cabildo de Tenerife — IA Mujeres 2026 — Empleo / Educación / Juventud | `efrainmedina@tenerife.es` | Cabildo de Tenerife |
| Cabildo de Tenerife — IA Mujeres 2026 — Políticas Sociales / Participación Ciudadana | `aguedafr@tenerife.es` | Cabildo de Tenerife |
| Cabildo de Tenerife — IA Mujeres 2026 — Igualdad | `igualdadydiversidad@tenerife.es` | Cabildo de Tenerife |
| Ayuntamiento de Santa Cruz de Tenerife — IA Mujeres 2026 | `unknown` | Santa Cruz |
| Ayuntamiento de Santa Cruz de La Palma — IA Mujeres 2026 | `yessica.perez@santacruzdelapalma.es` | Santa Cruz |

## Validaciones realizadas

- Cero seleccionados con `Santa Cruz`.
- Cero seleccionados con `Cabildo de Tenerife`.
- 20 payloads generados.
- Los payloads preservan UTF-8 y contienen acentos en copy visible.
- Se normalizaron topónimos visibles antes del envío: `Mogán`, `Güímar`, `Agüimes`, `Guía de Isora`, `Santa Brígida`, `San Nicolás`.
- La única coincidencia sin tilde detectada en `tecnologicas` pertenece al slug de una URL externa aprobada, no al texto visible.
- No existen `draft_map.json` ni `send_report.json` para estos sublotes, confirmando que no se crearon drafts reales ni se enviaron emails.

## Comandos ejecutados

Los sublotes se ejecutaron con la config autenticada:

```bash
GWS_GERENCIA_CONFIG_DIR=/home/reboot/.config/gws node scripts/ia_mujeres_operator_harness.mjs --action=launch-approved-batch --batch-id=2026-06-08T13-11-59-449Z_bulk20-01 --apply --confirm-create-external-drafts --confirm-send-approved-drafts
GWS_GERENCIA_CONFIG_DIR=/home/reboot/.config/gws node scripts/ia_mujeres_operator_harness.mjs --action=launch-approved-batch --batch-id=2026-06-08T13-11-59-449Z_bulk20-02 --apply --confirm-create-external-drafts --confirm-send-approved-drafts
GWS_GERENCIA_CONFIG_DIR=/home/reboot/.config/gws node scripts/ia_mujeres_operator_harness.mjs --action=launch-approved-batch --batch-id=2026-06-08T13-11-59-449Z_bulk20-03 --apply --confirm-create-external-drafts --confirm-send-approved-drafts
GWS_GERENCIA_CONFIG_DIR=/home/reboot/.config/gws node scripts/ia_mujeres_operator_harness.mjs --action=launch-approved-batch --batch-id=2026-06-08T13-11-59-449Z_bulk20-04 --apply --confirm-create-external-drafts --confirm-send-approved-drafts
```

## Script nuevo

Se añadió:

- `scripts/ia_mujeres_authorized_bulk_batch.mjs`

Función: generar una tanda autorizada ampliada, dividida en sublotes de 5, aplicando exclusiones duras y sin mutar CRM/Gmail.

# Email 1 v3 Internal Test — IA Mujeres

Fecha: 2026-06-09

## Resultado

Estado: prueba interna completada y enviada.

## CRM

- Deal interno: `a1765c77-6576-4690-86d7-4ad3badb833c`
- Nombre: `Reboot Academy/Canarias — IA Mujeres 2026 — Test Email 1 v3`
- Contacto: `Equipo Ventas Reboot <sales@reboot.academy>`
- Company: `Reboot Academy/Canarias — Test IA Mujeres Email 1 v3`
- Campaña: `IA Mujeres 2026`
- Business line: `SkilLand IA Mujeres`
- Stage: `POSSIBLE_OPPORTUNITY`
- IA Mujeres Funnel Stage: `NOT_SENT`
- IA Mujeres Funnel Stage tras envio: `EMAIL_1_SENT`
- Outreach status tras envio: `sent_first_email`
- Batch: `2026-06-09T10-51-40-758Z_email01v3-internal`
- Gmail draft ID: `r1126230243206989641`
- Gmail message ID enviado: `19eac07f5104a0e2`
- Gmail thread ID: `19eac0797e289364`
- Enviado: `2026-06-09T10:57:43.311Z`
- Follow-up due: `2026-06-19T10:57:43.311Z`

## Payload Validado

- Template: `email_01`
- Version: `2026-06-09_email_01_v3`
- Asunto: `Una preocupación que quería compartir con usted`
- Destinatario: `sales@reboot.academy`
- Adjunto: `shared/templates/ia-mujeres/assets/Mujeres, IA y el Futuro del Trabajo · Dossier — SkilLand v2.pdf`
- Attachment policy: `dossier_blue_v2`
- Derivacion: no incluida, porque es contacto interno nominal.

Validaciones locales:

- Copy v3 presente.
- Sin links antiguos de LinkedIn, prensa o SkilLand.
- Sin placeholders sin resolver.
- PDF v2 local existe: PDF 1.4, 8 paginas, 2.7 MB.

## Gmail/GWS

Se creo y envio el draft interno desde `gerencia@skilland.ai` a `sales@reboot.academy`.

Validaciones del draft Gmail:

- From OK.
- To OK.
- Subject OK.
- Firma presente.
- Adjunto presente.
- Nombre MIME del adjunto coincide con `Mujeres, IA y el Futuro del Trabajo · Dossier — SkilLand v2.pdf`.
- MIME contiene `multipart/mixed`, `multipart/alternative`, `text/plain`, `text/html` y `application/pdf`.

## Comandos Ejecutados

Despues de reautenticar GWS:

```bash
GWS_GERENCIA_CONFIG_DIR=/home/reboot/.config/gws node scripts/ia_mujeres_create_external_drafts.mjs --batch-id=2026-06-09T10-51-40-758Z_email01v3-internal --apply --confirm-create-external-drafts
node scripts/ia_mujeres_batch_runner.mjs --mode=mark-draft-created --batch-id=2026-06-09T10-51-40-758Z_email01v3-internal --draft-map=04_outputs/ia_mujeres_crm_execution/batch_2026-06-09T10-51-40-758Z_email01v3-internal_draft_map.json --apply
GWS_GERENCIA_CONFIG_DIR=/home/reboot/.config/gws node scripts/ia_mujeres_send_approved_drafts.mjs --batch-id=2026-06-09T10-51-40-758Z_email01v3-internal --apply --confirm-send-approved-drafts
node scripts/ia_mujeres_batch_runner.mjs --mode=mark-email-sent --batch-id=2026-06-09T10-51-40-758Z_email01v3-internal --sent-map=04_outputs/ia_mujeres_crm_execution/batch_2026-06-09T10-51-40-758Z_email01v3-internal_sent_map.json --apply
```

## Decision

Email 1 v3 y adjunto v2 quedan implementados y validados en prueba interna. Siguiente paso operativo: revisar visualmente el email recibido en `sales@reboot.academy`; si esta correcto, preparar la siguiente tanda real con el mismo flujo.

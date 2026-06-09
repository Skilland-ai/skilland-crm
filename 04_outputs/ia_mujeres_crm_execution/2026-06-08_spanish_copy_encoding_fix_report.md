# Spanish Copy Encoding Fix Report — IA Mujeres

Fecha: 2026-06-08

> Estado historico: este reporte de correccion UTF-8 queda supersedido para Email 1 por `04_outputs/ia_mujeres_crm_execution/2026-06-09_email_01_v3_crm_sync.md`. Sus referencias al asset anterior y a firma inyectada documentan una validacion pasada; no son instrucciones vigentes.

## Resultado

Estado: aprobado para revisión interna. No se ha enviado ningún email externo.

Se corrigió la base operativa para que Email 1 y follow-ups usen español correcto en UTF-8. Los textos de correo ya conservan tildes, eñes y signos en templates, previews, payloads locales y MIME de Gmail.

## Archivos corregidos o creados

- `shared/templates/ia-mujeres/email_01.html`
- `shared/templates/ia-mujeres/follow_up_01.html`
- `shared/templates/ia-mujeres/follow_up_02_whitepaper.html`
- `shared/templates/ia-mujeres/template_metadata.json`
- `scripts/ia_mujeres_experiment_00_gws_lab.mjs`
- `scripts/ia_mujeres_batch_runner.mjs`
- `04_outputs/ia_mujeres_crm_execution/2026-06-08_experiment_00_email_preview.html`
- `04_outputs/ia_mujeres_crm_execution/2026-06-08_experiment_00_email_preview.txt`
- `04_outputs/ia_mujeres_crm_execution/batch_2026-06-08T00-34-36-009Z_draft_payloads.json`

## Validaciones

- `node --check scripts/ia_mujeres_experiment_00_gws_lab.mjs`: OK.
- `node --check scripts/ia_mujeres_batch_runner.mjs`: OK.
- `node --check scripts/ia_mujeres_weekly_report.mjs`: OK.
- `node --check scripts/ia_mujeres_daily_operator.mjs`: OK.
- Preview HTML/TXT generado con UTF-8: OK.
- Draft interno nuevo creado y verificado en Gmail: OK.

## Draft interno validado después de la corrección

- Draft ID: `r-703272174983903679`
- Message ID: `19ea49ca18113187`
- Thread ID: `19ea49ca18113187`
- From: `gerencia@skilland.ai`
- To: `sales@reboot.academy`
- Asunto: `Una preocupación que quería compartir con usted`
- Adjuntos: presentación corta, no dossier largo.
- Firma: presente mediante firma Gmail `sendAs` inyectada por el runner.
- Links aprobados: 5/5 presentes.
- Estado: draft interno verificado, no enviado.

## MIME/GWS

El runner construye MIME con `Buffer.from(..., 'utf8')` y base64url. La verificación del draft recuperó el mensaje desde Gmail y confirmó:

- `text/plain`
- `text/html`
- `application/pdf`
- nombre MIME del adjunto con acentos
- firma presente
- links con textos acentuados

## Observaciones

Las coincidencias `tecnologicas` que siguen apareciendo están dentro de slugs de URLs aprobadas, no en texto visible del correo. Los nombres propios procedentes del CRM se conservan como dato fuente; no se inventan tildes en apellidos o entidades si el CRM no las contiene.

Los outputs antiguos de dry-run previos a esta corrección quedan supersedidos. Para revisión actual debe usarse el batch `2026-06-08T00-34-36-009Z`.

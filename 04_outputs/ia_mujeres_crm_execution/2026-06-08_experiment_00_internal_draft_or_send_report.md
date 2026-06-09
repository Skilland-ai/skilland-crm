# Experiment 00 Internal Draft/Send Report — IA Mujeres

> Estado historico: este reporte interno del 2026-06-08 queda supersedido para Email 1 por `04_outputs/ia_mujeres_crm_execution/2026-06-09_email_01_v3_crm_sync.md`. Sus referencias al asset anterior y a firma inyectada documentan evidencia pasada; no son instrucciones vigentes.

## Resultado

Estado: **Experimento 0 interno completado**.

Se envio un unico email controlado desde `gerencia@skilland.ai` a `sales@reboot.academy`.
No se tocaron contactos externos ni tandas reales.

## Draft

| Check | Resultado |
|---|---|
| Draft creado | OK |
| Draft ID | `r5280655799861921319` |
| Message ID inicial | `19ea476680e7031b` |
| Thread ID inicial | `19ea476680e7031b` |
| From | OK: `gerencia@skilland.ai` |
| To | OK: `sales@reboot.academy` |
| Subject | OK: `Una preocupación que quería compartir con usted` |
| Links | OK: 5/5 presentes |
| Adjunto | OK: `Mujeres, IA y el futuro del Trabajo - Presentacion corta — SkilLand.pdf` |
| Firma | OK: firma Gmail `sendAs` inyectada por runner |
| Dossier largo | OK: no adjuntado |

## Envio y recepcion

| Check | Resultado |
|---|---|
| Enviado | OK |
| Sent message ID | `19ea47ccd6e6e58a` |
| Sender thread ID | `19ea476680e7031b` |
| Labels envio | `SENT` |
| Recibido en `sales@reboot.academy` | OK |
| Received message ID | `19ea47cddaba7128` |
| Recipient thread ID | `19ea47cddaba7128` |
| Read signal interno | `not_unread`, senal debil |
| Bounce check | OK: `0` resultados |

## Respuesta/thread

| Check | Resultado |
|---|---|
| Reply detectado en hilo emisor | OK |
| Hilo emisor | `19ea476680e7031b` |
| Mensajes detectados en hilo | `3` |
| Reply controlado detectado | `sales@reboot.academy` -> `gerencia@skilland.ai` |
| Primer reply message ID en buzon emisor | `19ea47dea03b5412` |

Nota: el hilo contiene mas de una respuesta interna controlada; no afecta al criterio tecnico. La deteccion por `thread_id` funciona.

## Evidencia local

- Runner: `scripts/ia_mujeres_experiment_00_gws_lab.mjs`
- Eventos: `04_outputs/ia_mujeres_crm_execution/events.ndjson`
- JSON tecnico: `04_outputs/ia_mujeres_crm_execution/2026-06-08_experiment_00_run.json`
- Preview HTML: `04_outputs/ia_mujeres_crm_execution/2026-06-08_experiment_00_email_preview.html`
- Preview texto: `04_outputs/ia_mujeres_crm_execution/2026-06-08_experiment_00_email_preview.txt`

## Apertura, lectura y click

- Apertura: no fiable sin pixel; no se instrumenta.
- Lectura interna: se puede mirar label `UNREAD` en `sales@reboot.academy`, pero es una senal debil.
- Click: no se mide porque requeriria reescribir links o pasar por redirects.

## Decision

**Laboratorio interno aprobado.**

Se puede avanzar al diseno/implementacion de la primera tanda real.
No queda aprobado todavia enviar contactos externos: antes hay que cerrar mapeo CRM `thread_id -> deal`, campos/event ingestion de Gmail IDs, runner de tanda y autorizacion humana explicita de cada tanda.

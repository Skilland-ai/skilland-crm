# Experiment 00 Internal Draft/Send Report — IA Mujeres

## Resultado

Estado: **draft creado y verificado; envio pendiente de revision humana**.

No se envio ningun email. No se tocaron contactos externos.

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

## Evidencia local

- Runner: `scripts/ia_mujeres_experiment_00_gws_lab.mjs`
- Evento: `04_outputs/ia_mujeres_crm_execution/events.ndjson`
- JSON tecnico: `04_outputs/ia_mujeres_crm_execution/2026-06-08_experiment_00_run.json`
- Preview HTML: `04_outputs/ia_mujeres_crm_execution/2026-06-08_experiment_00_email_preview.html`
- Preview texto: `04_outputs/ia_mujeres_crm_execution/2026-06-08_experiment_00_email_preview.txt`

## Envio y recepcion

No enviado todavia. Motivo: todo envio real, aunque sea interno, debe pasar por revision humana del draft.

Para enviar tras revision:

```bash
node scripts/ia_mujeres_experiment_00_gws_lab.mjs \
  --send \
  --draft-id=r5280655799861921319 \
  --confirm-internal-send
```

Despues del envio:

```bash
node scripts/ia_mujeres_experiment_00_gws_lab.mjs \
  --check-reception \
  --check-replies \
  --check-bounce \
  --thread-id=<thread_id_devuelto_por_send>
```

## Apertura, lectura y click

- Apertura: no fiable sin pixel; no se instrumenta.
- Lectura interna: se puede mirar label `UNREAD` en `sales@reboot.academy`, pero es una senal debil.
- Click: no se mide porque requeriria reescribir links o pasar por redirects.

## Decision

**No aprobado todavia para primera tanda real.**

Falta enviar el Experimento 0, confirmar recepcion en `sales@reboot.academy`, responder manualmente desde `sales@reboot.academy`, detectar el reply por hilo y verificar que no hay bounce.

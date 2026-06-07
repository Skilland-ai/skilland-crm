---
name: ia-mujeres-crm-gws
description: Operar la campaña IA Mujeres desde skilland-crm con Twenty CRM y Google Workspace: preparar tandas, crear drafts seguros, registrar eventos, comprobar recepcion/respuestas/bounces y generar reportes sin tocar contactos reales sin autorizacion.
---

# IA Mujeres CRM/GWS

## Uso

Usa esta skill cuando haya que ejecutar o supervisar la operacion CRM/GWS de IA Mujeres:

- laboratorio interno Experimento 0;
- preparacion de tanda diaria;
- creacion de drafts;
- registro de eventos Gmail/CRM;
- comprobacion de recepcion, respuestas y bounces;
- reporte semanal.

## Reglas

- No redisenar el funnel ni el copy de Funnel Academy.
- No enviar contactos externos sin autorizacion humana explicita.
- Crear draft primero, revisar despues, enviar solo con confirmacion.
- Mantener whitelist cerrada en tests: `sales@reboot.academy`, `gerencia@skilland.ai`, `direccion@skilland.ai`.
- No usar aperturas como KPI principal.
- No modificar links aprobados para tracking salvo nueva aprobacion.
- No versionar secretos; las credenciales GWS viven fuera del repo.

## Runner principal

```bash
node scripts/ia_mujeres_experiment_00_gws_lab.mjs
node scripts/ia_mujeres_experiment_00_gws_lab.mjs --create-draft
node scripts/ia_mujeres_experiment_00_gws_lab.mjs --verify-draft --draft-id=<draft_id>
node scripts/ia_mujeres_experiment_00_gws_lab.mjs --send --draft-id=<draft_id> --confirm-internal-send
node scripts/ia_mujeres_experiment_00_gws_lab.mjs --check-reception --check-replies --check-bounce --thread-id=<thread_id>
node scripts/ia_mujeres_experiment_00_gws_lab.mjs --delete-draft --draft-id=<draft_id>
```

## Outputs

- `04_outputs/ia_mujeres_crm_execution/events.ndjson`
- `04_outputs/ia_mujeres_crm_execution/2026-06-08_experiment_00_run.json`
- `04_outputs/ia_mujeres_crm_execution/2026-06-08_experiment_00_email_preview.html`
- `04_outputs/ia_mujeres_crm_execution/2026-06-08_experiment_00_email_preview.txt`

## Secuencia operativa

1. Validar auth GWS de emisor y cuenta control.
2. Validar firma Gmail `sendAs` de `gerencia@skilland.ai`.
3. Renderizar Email 1 aprobado y adjunto corto.
4. Crear draft con Gmail API.
5. Registrar `draft_created`.
6. Esperar revision humana.
7. Enviar solo con flag de confirmacion.
8. Comprobar recepcion en `sales@reboot.academy`.
9. Comprobar replies por `thread_id`.
10. Comprobar bounces por busquedas Gmail.
11. Decidir si se aprueba o bloquea primera tanda real.

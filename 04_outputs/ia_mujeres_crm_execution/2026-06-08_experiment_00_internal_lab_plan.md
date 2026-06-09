# Experiment 00 Internal Lab Plan — IA Mujeres

> Estado historico: este laboratorio interno del 2026-06-08 queda supersedido para Email 1 por `04_outputs/ia_mujeres_crm_execution/2026-06-09_email_01_v3_crm_sync.md`. Sus referencias al asset anterior y a firma inyectada documentan una prueba pasada; no son instrucciones vigentes.

## Objetivo

Validar la operacion completa antes de tocar contactos reales.

## Configuracion

| Campo | Valor |
|---|---|
| From | `gerencia@skilland.ai` |
| To | `sales@reboot.academy` |
| Subject | `Una preocupación que quería compartir con usted` |
| Email | Email 1 aprobado por Funnel Academy, con adaptacion minima de saludo/personalizacion para destinatario interno |
| Adjunto | Presentacion corta, enviada en MIME como `Mujeres, IA y el futuro del Trabajo - Presentacion corta — SkilLand.pdf` |
| Dossier largo | No adjuntar |
| Links | Mantener hipervinculos aprobados |
| Firma | Inyectar firma Gmail `sendAs` de `gerencia@skilland.ai` |

## Criterios de exito

- Draft creado en `gerencia@skilland.ai`.
- From, To y subject correctos.
- Cuerpo HTML y texto generados.
- Cinco links aprobados presentes.
- Un unico PDF adjunto con nombre aprobado.
- Firma presente.
- Evento `draft_created` registrado.
- Tras envio aprobado: mensaje recibido en `sales@reboot.academy`.
- Tras respuesta manual: hilo detecta reply.
- Bounce check sin resultados.

## Limites

- No se comprueba apertura como KPI.
- No se comprueba click porque no se alteran links aprobados.
- No se envia sin revision humana del draft.
- No se actualiza CRM real hasta decidir campos/event ingestion.

## Comandos

```bash
node scripts/ia_mujeres_experiment_00_gws_lab.mjs --create-draft
node scripts/ia_mujeres_experiment_00_gws_lab.mjs --verify-draft --draft-id=<draft_id>
node scripts/ia_mujeres_experiment_00_gws_lab.mjs --send --draft-id=<draft_id> --confirm-internal-send
node scripts/ia_mujeres_experiment_00_gws_lab.mjs --send-internal-reply --thread-id=<thread_id> --confirm-internal-reply
node scripts/ia_mujeres_experiment_00_gws_lab.mjs --check-reception --check-replies --check-bounce --thread-id=<thread_id>
```

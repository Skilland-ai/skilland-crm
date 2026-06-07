# Workflow Decision Report — IA Mujeres

## Auditoria

El repo ya tiene capacidad Twenty Workflows documentada:

- `shared/knowledge/twenty-workflows/2026-06-07_api_mcp_capabilities.md`
- `shared/knowledge/twenty-workflows/2026-06-07_ui_last_resort.md`
- `shared/knowledge/twenty-workflows/examples/ia_mujeres_workflow_patterns.md`

Evidencia previa:

- WF-2 y WF-3 de test fueron creados/activados por API y validados con deal `TEST`.
- El smoke test 2026-06-07 confirmo tareas creadas y cleanup.

## Decision actual

No crear ni activar workflows productivos nuevos en esta fase.

Motivo: el cuello de botella ahora no es Twenty Workflows; es validar GWS real con firma, adjunto, envio, recepcion, replies y bounces.

## Workflows recomendados ahora

| Workflow | Estado | Motivo |
|---|---|---|
| WF-2 test: primer email enviado | Mantener test | Ya probado sobre `TEST — IA Mujeres 2026`; no usar como produccion. |
| WF-3 test: respuesta recibida | Mantener test | Ya probado sobre `TEST — IA Mujeres 2026`; sirve de patron. |
| Produccion: reply -> tarea humana | Posponer hasta Experimento 0 completo | Necesita `thread_id -> deal` fiable. |
| Produccion: email sent -> follow-up task | Posponer hasta primera tanda aprobada | Antes crear campos Gmail ID o contrato de eventos. |

## Workflows descartados ahora

- Envio automatico desde workflow: descartado por seguridad.
- Pixel/open tracking workflow: descartado por fiabilidad baja y no KPI.
- Click tracking por redirect: descartado porque cambiaria links aprobados.

## Workflows pospuestos

| Workflow | Cuando activarlo |
|---|---|
| Draft created -> registrar estado CRM | Cuando exista campo/objeto de email event en CRM. |
| Email sent -> `first_email_sent` + follow-up due | Tras Experimento 0 enviado/recibido y primera tanda aprobada. |
| Reply detected -> task humana | Tras mapear `gmailThreadId` en Opportunity. |
| Bounce detected -> revision manual | Tras prueba de bounce heuristico con eventos. |
| Follow-up 1 due | Tras al menos una tanda real sin incidencias. |
| Follow-up 2/nurturing | Tras validar follow-up 1. |

## API/UI

- Workflows Twenty: API-capable con user auth para mutaciones especificas.
- MCP actual: util para records/tareas/notas, no para authoring completo de workflows.
- UI: no requerida funcionalmente, pero puede usarse como inspeccion visual.

## Recomendacion

Usar runners para GWS y eventos. Usar workflows CRM solo como reacciones a cambios de estado ya validados, nunca como mecanismo de envio.

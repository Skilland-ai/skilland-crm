# Next Actions — IA Mujeres CRM/GWS

## Para Raul

1. Dar por cerrado Experimento 0 interno: enviado, recibido, con reply detectado y sin bounce.
2. Revisar el informe final: `04_outputs/ia_mujeres_crm_execution/2026-06-08_experiment_00_internal_draft_or_send_report.md`.
3. Aprobar si se crean campos CRM para Gmail IDs o si se empieza con ingestion por eventos/notas.
4. Confirmar responsable humano de revision de drafts y responsable de autorizacion de envio.
5. Revisar el dry-run de primera tanda: `04_outputs/ia_mujeres_crm_execution/batch_2026-06-07T23-57-37-918Z_review.md`.
6. Revisar personalizaciones y duplicados antes de autorizar cualquier draft externo.
7. No crear drafts externos hasta cerrar mapeo Gmail ID y decision humana explicita.

## Pendiente tecnico antes de contactos externos

- Decidir si crear campos CRM `gmailDraftId`, `gmailMessageId`, `gmailThreadId`, `lastEmailEventAt`, `lastEmailEventType`.
- Ampliar `scripts/ia_mujeres_batch_runner.mjs` para crear drafts externos solo tras aprobacion.
- Decidir si el batch dry-run generado es apto o debe ajustarse manualmente.
- Ampliar reporte semanal con CRM real cuando exista mapeo Gmail ID.
- Definir quien revisa drafts y quien autoriza envio.

## Comando de comprobacion recurrente del laboratorio

El email interno ya fue enviado; no hay draft pendiente que limpiar. Para reconsultar recepcion/replies/bounces:

```bash
node scripts/ia_mujeres_experiment_00_gws_lab.mjs \
  --check-reception \
  --check-replies \
  --check-bounce \
  --thread-id=19ea476680e7031b
```

No borrar `events.ndjson`: es la evidencia operativa del laboratorio.

# Next Actions — IA Mujeres CRM/GWS

## Para Raul

1. Revisar en Gmail el draft `r5280655799861921319` en `gerencia@skilland.ai`.
2. Validar visualmente cuerpo, firma, links y adjunto.
3. Si el draft esta correcto, enviar Experimento 0 interno:

```bash
node scripts/ia_mujeres_experiment_00_gws_lab.mjs \
  --send \
  --draft-id=r5280655799861921319 \
  --confirm-internal-send
```

4. Tras enviar, ejecutar checks:

```bash
node scripts/ia_mujeres_experiment_00_gws_lab.mjs \
  --check-reception \
  --check-replies \
  --check-bounce \
  --thread-id=<thread_id_devuelto_por_send>
```

5. Responder manualmente desde `sales@reboot.academy` para probar deteccion de reply.
6. Repetir `--check-replies`.
7. Solo si todo pasa, aprobar diseno de primera tanda real de 5.

## Pendiente tecnico antes de contactos externos

- Decidir si crear campos CRM `gmailDraftId`, `gmailMessageId`, `gmailThreadId`, `lastEmailEventAt`, `lastEmailEventType`.
- Implementar `scripts/ia_mujeres_batch_runner.mjs`.
- Implementar seleccion de tanda desde CRM con `limit=5`.
- Implementar reporte semanal base.
- Definir quien revisa drafts y quien autoriza envio.

## Limpieza

Si el draft no se va a usar:

```bash
node scripts/ia_mujeres_experiment_00_gws_lab.mjs \
  --delete-draft \
  --draft-id=r5280655799861921319
```

No borrar el evento local salvo que se quiera reiniciar completamente el laboratorio.

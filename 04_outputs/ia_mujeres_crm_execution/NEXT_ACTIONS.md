# Next Actions — IA Mujeres CRM/GWS

Fecha: 2026-06-08

## Para Raúl

1. Entrar en Twenty y revisar la vista `IA Mujeres — Funnel`.
2. Revisar la primera tanda real enviada: `2026-06-08T08-03-50-600Z`.
3. Revisar la segunda tanda real enviada: `2026-06-08T08-16-30-000Z`.
4. Revisar `04_outputs/ia_mujeres_crm_execution/2026-06-08_first_external_batch_05_report.md`.
5. Revisar `04_outputs/ia_mujeres_crm_execution/2026-06-08_second_external_batch_05_report.md`.
6. Monitorizar replies/bounces.
7. No preparar tercera tanda hasta revisar señales iniciales de estas dos primeras.

## Operación diaria segura

```bash
node scripts/ia_mujeres_daily_operator.mjs --limit=5 --weekly
```

Este comando no muta CRM, no crea drafts Gmail y no envía emails.

## Estado actual

- Dos tandas externas enviadas y registradas en CRM.
- Enviados totales IA Mujeres: 10.
- Validar señales iniciales: bounces, replies, tareas de follow-up y lectura comercial desde la vista `IA Mujeres — Funnel`.
- Corregir en CRM nombres/entidades sin tildes si se quiere máxima calidad en personalización para próximas tandas.
- No lanzar tercera tanda hasta revisar estas dos tandas enviadas.

## Comandos CRM listos

```bash
node scripts/ia_mujeres_batch_runner.mjs --mode=audit
node scripts/ia_mujeres_batch_runner.mjs --mode=select-batch --limit=5
node scripts/ia_mujeres_batch_runner.mjs --mode=prepare-drafts --batch-id=<id>
node scripts/ia_mujeres_batch_runner.mjs --mode=mark-draft-created --batch-id=<id> --draft-map=<json> --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=mark-email-sent --batch-id=<id> --sent-map=<json> --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-replies --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-bounces --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=prepare-followups --limit=5
```

## Comprobación recurrente del laboratorio interno

```bash
node scripts/ia_mujeres_experiment_00_gws_lab.mjs \
  --check-reception \
  --check-replies \
  --check-bounce \
  --thread-id=19ea476680e7031b
```

## Bloqueos vigentes

- `send-approved` sigue bloqueado.
- No hay tracking de aperturas fiable.
- No hay tracking de clicks porque no se reescriben links aprobados.
- Los workflows nativos de Twenty quedan pospuestos hasta validar la primera tanda real.

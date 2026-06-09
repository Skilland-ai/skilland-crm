# Next Actions — IA Mujeres CRM/GWS

Fecha: 2026-06-08

## Para Raúl

1. Entrar en Twenty y revisar la vista `IA Mujeres — Funnel`.
2. Revisar la primera tanda real enviada: `2026-06-08T08-03-50-600Z`.
3. Revisar la segunda tanda real enviada: `2026-06-08T08-16-30-000Z`.
4. Revisar `04_outputs/ia_mujeres_crm_execution/2026-06-08_first_external_batch_05_report.md`.
5. Revisar `04_outputs/ia_mujeres_crm_execution/2026-06-08_second_external_batch_05_report.md`.
6. Monitorizar replies/bounces.
7. Monitorizar señales de la tanda ampliada de 20 enviada el 2026-06-08.

## Operación diaria segura

```bash
node scripts/ia_mujeres_operator_harness.mjs --action=status
node scripts/ia_mujeres_operator_harness.mjs --action=prepare-next-batch --limit=5
```

Estos comandos no mutan CRM, no crean drafts Gmail y no envían emails.

## Harness operativo

```bash
node scripts/ia_mujeres_operator_harness.mjs --action=launch-approved-batch --batch-id=<id> --apply --confirm-create-external-drafts --confirm-send-approved-drafts
GWS_GERENCIA_CONFIG_DIR=/home/reboot/.config/gws node scripts/ia_mujeres_operator_harness.mjs --action=sync-signals --apply
node scripts/ia_mujeres_operator_harness.mjs --action=reconcile-tasks --apply
node scripts/ia_mujeres_operator_harness.mjs --action=weekly-report
node scripts/ia_mujeres_operator_harness.mjs --action=email-weekly-report --apply --confirm-send-weekly-report
```

## Estado actual

- Dos tandas externas enviadas y registradas en CRM.
- Tanda ampliada de 20 enviada y registrada en CRM.
- Emails comerciales enviados técnicamente: 30.
- Emails comerciales sin bounce detectado: 28.
- Bounces detectados: 2.
- Oportunidades IA Mujeres pendientes: 70.
- CRM IA Mujeres: `EMAIL_1_SENT=28`, `WRONG_CONTACT_MANUAL_REVIEW=2`, `NOT_SENT=70`.
- Sublotes enviados: `2026-06-08T13-11-59-449Z_bulk20-01`, `2026-06-08T13-11-59-449Z_bulk20-02`, `2026-06-08T13-11-59-449Z_bulk20-03`, `2026-06-08T13-11-59-449Z_bulk20-04`.
- Santa Cruz y Cabildo de Tenerife quedaron excluidos de esa tanda.
- Tareas IA Mujeres abiertas: 30, todas asignadas a Raúl Artiles.
- Tareas IA Mujeres históricas: 64, incluyendo 2 duplicados de bounce cerrados durante la prueba de idempotencia.
- Tareas de revisión de draft: 30 cerradas.
- Tareas de follow-up 1: 28 abiertas y 2 cerradas por bounce, vencen el 18 de junio de 2026.
- Tareas de bounce/contacto incorrecto: 2 abiertas.
- Validar señales iniciales: bounces, replies, tareas de follow-up y lectura comercial desde la vista `IA Mujeres — Funnel`.
- Corregir en CRM nombres/entidades sin tildes si se quiere máxima calidad en personalización para próximas tandas.
- Para próximos envíos desde gerencia, usar `GWS_GERENCIA_CONFIG_DIR=/home/reboot/.config/gws` si la autenticación válida sigue en esa carpeta.

## Comandos CRM listos

Preferir el harness salvo depuración puntual.

Para sincronización diaria de señales, preferir el harness porque escanea Gmail antes de sincronizar CRM.

```bash
node scripts/ia_mujeres_batch_runner.mjs --mode=audit
node scripts/ia_mujeres_batch_runner.mjs --mode=select-batch --limit=5
node scripts/ia_mujeres_batch_runner.mjs --mode=prepare-drafts --batch-id=<id>
node scripts/ia_mujeres_batch_runner.mjs --mode=mark-draft-created --batch-id=<id> --draft-map=<json> --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=mark-email-sent --batch-id=<id> --sent-map=<json> --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-replies --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-bounces --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=prepare-followups --limit=5
node scripts/ia_mujeres_batch_runner.mjs --mode=reconcile-tasks --apply
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

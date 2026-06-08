# Weekly Report Design — IA Mujeres

## Decision

Conviene reporte semanal HTML por email, pero no dashboard todavia.

Razon: la operacion inicial necesita control y aprendizaje, no una UI permanente.

## Formato recomendado

- `weekly_report_<yyyy-mm-dd>.html`
- `weekly_report_<yyyy-mm-dd>.md`
- Envio opcional por Gmail a Raul/Romina tras revision.

## Fuentes

- Twenty CRM: opportunities `campaignName = IA Mujeres 2026`.
- Eventos GWS: `04_outputs/ia_mujeres_crm_execution/events.ndjson`.
- Gmail: threads conocidos para replies/bounces.
- Tareas CRM: reuniones y pendientes humanos.

## Metricas

- Drafts creados.
- Emails enviados.
- Recibidos confirmados.
- Respuestas recibidas.
- Respuestas positivas.
- Derivaciones.
- Reuniones propuestas.
- Reuniones agendadas.
- Bounces.
- Pendientes de follow-up 1.
- Pendientes de follow-up 2.
- Pasados a nurturing.
- Incidencias de personalizacion/adjunto/firma.

## Secciones del HTML

1. Resumen ejecutivo.
2. Tabla de tandas.
3. Conversaciones abiertas.
4. Reuniones y tareas humanas.
5. Bounces e incidencias.
6. Aprendizajes de copy/entregabilidad.
7. Proximas acciones.

## Implementacion propuesta

Fase actual: base implementada como generador local.

Comando:

```bash
node scripts/ia_mujeres_weekly_report.mjs --week=2026-06-08
```

Outputs generados:

- `04_outputs/ia_mujeres_crm_execution/weekly_report_2026-06-08.md`
- `04_outputs/ia_mujeres_crm_execution/weekly_report_2026-06-08.html`

Safeguards:

- Lee solo `events.ndjson`.
- No envia email.
- No muta CRM.
- `--email-draft` esta bloqueado intencionadamente hasta que se apruebe el circuito de revision.

Fase siguiente:

```bash
node scripts/ia_mujeres_weekly_report.mjs --week=<yyyy-mm-dd>
```

Despues de cerrar mapeo CRM, ampliar el reporte con pendientes, reuniones, nurturing y tareas humanas.

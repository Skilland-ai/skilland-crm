# Weekly Report Design — IA Mujeres

Fecha: 2026-06-08

## Decisión

Mantener reporte semanal local en Markdown y HTML. Preparar envío por email después, no ahora.

El reporte ya lee eventos GWS locales y audit CRM si existe. Así empieza a mostrar estado comercial, no solo laboratorio Gmail.

## Comando

```bash
node scripts/ia_mujeres_weekly_report.mjs --week=2026-06-08
```

## Outputs actuales

- `04_outputs/ia_mujeres_crm_execution/weekly_report_2026-06-08.md`
- `04_outputs/ia_mujeres_crm_execution/weekly_report_2026-06-08.html`

## Métricas incluidas ahora

- Eventos locales.
- Drafts creados.
- Emails enviados.
- Recepciones detectadas.
- Replies detectados.
- Bounces detectados.
- Hilos únicos.
- Destinatarios únicos.
- Opportunities IA Mujeres en CRM.
- Deals con `gmailThreadId`.
- Deals con revisión manual.
- Distribución por `iaMujeresFunnelStage`.

## Métricas objetivo tras primera tanda real

- Enviados por tanda.
- Drafts pendientes de revisión.
- Respuestas recibidas.
- Reuniones propuestas/agendadas.
- Bounces.
- Follow-up 1 pendiente.
- Follow-up 2 pendiente.
- Nurturing.
- Tareas vencidas.
- Incidencias de contacto/copy/adjunto/firma.
- Recomendación de siguiente tanda.

## Email HTML semanal

Conviene enviar HTML por Gmail a dirección interna después de validar:

- destinatarios internos;
- asunto fijo;
- render responsive;
- no inclusión de datos sensibles innecesarios;
- aprobación humana de formato.

El flag `--email-draft` sigue bloqueado intencionadamente.

## Estado de la semana actual

El reporte del 2026-06-08 muestra:

- Eventos locales: 7.
- Experimento 0: OK.
- CRM IA Mujeres: 100 opportunities.
- `NOT_SENT`: 100.
- Con `gmailThreadId`: 0.

## Siguiente paso técnico

Cuando haya primer envío externo autorizado, ejecutar `mark-email-sent --apply` para que el reporte semanal refleje envíos, hilos y follow-ups desde CRM.

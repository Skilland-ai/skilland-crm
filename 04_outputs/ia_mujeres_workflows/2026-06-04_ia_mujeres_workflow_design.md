# IA Mujeres Workflow Design

- Date: 2026-06-04
- Business Line: SkilLand IA Mujeres
- Campaign: IA Mujeres 2026

## Estados del funnel (outreachStatus)

```
pending_first_email
  → first_email_sent
    → follow_up_pending
      → replied
        → meeting_to_schedule
          → meeting_scheduled
            → won / lost / nurturing
```

## Campos de seguimiento en Opportunity

| Campo | Tipo | Se rellena cuando |
|-------|------|-------------------|
| `firstEmailSentAt` | DATE_TIME | outreachStatus → first_email_sent (primera vez) |
| `lastEmailSentAt` | DATE_TIME | cualquier email enviado |
| `lastReplyAt` | DATE_TIME | outreachStatus → replied |
| `followUpDueAt` | DATE_TIME | +3 días tras first_email_sent |
| `meetingStatus` | TEXT | not_scheduled / to_schedule / scheduled / done |
| `meetingDate` | DATE_TIME | cuando se agenda reunión |

## WF-1: IA Mujeres — Deal creado

| Propiedad | Valor |
|-----------|-------|
| Trigger | `opportunity.created` |
| Condición | `campaignName == "IA Mujeres 2026"` |
| Acción 1 | Si `needsManualReview = true`: crear task "Revisar deal nuevo" |
| Acción 2 | Asegurar `outreachStatus = pending_first_email` (si vacío) |
| Estado | **DRAFT** — completar condición `needsManualReview` en UI |
| Seguridad | Solo se activa si campaignName coincide |

## WF-2: IA Mujeres — Primer email enviado

| Propiedad | Valor |
|-----------|-------|
| Trigger | `opportunity.updated` |
| Condición | `campaignName == "IA Mujeres 2026"` AND `outreachStatus == "first_email_sent"` |
| Acción 1 | Mover `stage = ONGOING` |
| Acción 2 | Crear task "Follow-up: [name]" |
| Acción 3 | Registrar `firstEmailSentAt = now` (si vacío) |
| Acción 4 | Registrar `lastEmailSentAt = now` |
| Acción 5 | Calcular `followUpDueAt = +3 días` |
| Estado | **DRAFT** — acciones de fecha y taskTarget pendientes en UI |

## WF-3: IA Mujeres — Respuesta recibida

| Propiedad | Valor |
|-----------|-------|
| Trigger | `opportunity.updated` |
| Condición | `campaignName == "IA Mujeres 2026"` AND `outreachStatus == "replied"` |
| Acción 1 | Mover `stage = MEETING_SCHEDULED` |
| Acción 2 | Crear task "Responder y proponer reunión: [name]" |
| Acción 3 | Registrar `lastReplyAt = now` |
| Estado | **DRAFT** — verificar stage destino y taskTarget en UI |

## Workflows futuros (Fase 5+)

- **WF-4**: Sin respuesta en X días → follow-up (requiere DELAY step + GWS)
- **WF-5**: Reunión agendada → task de preparación
- **WF-6**: Envío desde GWS → webhook → actualizar outreachStatus
- **WF-7**: Email recibido (GWS) → actualizar lastReplyAt, outreachStatus = replied

## Flujo de activación recomendado

1. Completar steps en UI (outputSchema, taskTarget relation)
2. Ejecutar smoke test (Fase 4.1) con datos `TEST —`
3. Verificar que el workflow solo afecta deals de IA Mujeres
4. Activar WF-1 (menor riesgo — solo en creación)
5. Activar WF-2 y WF-3 tras validar smoke test completo

# IA Mujeres Workflow Implementation Result

- Date: 2026-06-04
- Mode: apply

## Campos de seguimiento

- Creados: 6 — firstEmailSentAt, lastEmailSentAt, lastReplyAt, followUpDueAt, meetingStatus, meetingDate
- Reutilizados: 0

## Workflows

**Los 3 workflows NO se pueden crear via API.** La mutación `createWorkflow` devuelve `Method not allowed` — es una restricción de permisos de la API key de Twenty. Los workflows deben crearse **manualmente en UI**.

## Pasos manuales en UI — crear los 3 workflows

### WF-1: IA Mujeres — Deal creado
1. Twenty → Workflows → New Workflow
2. Nombre: `IA Mujeres: Deal creado`
3. Trigger: Database Event → `opportunity.created`
4. Step 1 — IF_ELSE: `campaignName eq "IA Mujeres 2026"`
5. Rama true → CREATE_RECORD: task con título "Revisar deal: [name]" (si needsManualReview=true)

### WF-2: IA Mujeres — Primer email enviado
1. Nombre: `IA Mujeres: Primer email enviado`
2. Trigger: Database Event → `opportunity.updated`
3. Step 1 — IF_ELSE: `campaignName eq "IA Mujeres 2026"` AND `outreachStatus eq "first_email_sent"`
4. Rama true → UPDATE_RECORD: opportunity.stage = ONGOING
5. Siguiente → CREATE_RECORD: task "Follow-up: [name]"

### WF-3: IA Mujeres — Respuesta recibida
1. Nombre: `IA Mujeres: Respuesta recibida`
2. Trigger: Database Event → `opportunity.updated`
3. Step 1 — IF_ELSE: `campaignName eq "IA Mujeres 2026"` AND `outreachStatus eq "replied"`
4. Rama true → UPDATE_RECORD: opportunity.stage = MEETING_SCHEDULED
5. Siguiente → CREATE_RECORD: task "Responder y proponer reunión: [name]"

**NO activar ningún workflow hasta completar smoke test (Fase 4.1 verificada)**

## Riesgos

- DATABASE_EVENT `opportunity.updated` se dispara en CADA update de TODAS las opportunities
- La condición IF_ELSE `campaignName == "IA Mujeres 2026"` es la única barrera de aislamiento
- Steps con `valid: false` no pueden activar el workflow (protección automática de Twenty)

## Próximos pasos

1. Revisar workflows en UI (ya creados)
2. Completar steps si needsUICompletion=true
3. Ejecutar Fase 4.1 — Smoke test: `node scripts/ia_mujeres_crm_smoke_test_v1.mjs --apply`
4. Validar comportamiento en smoke test antes de activar
5. Activar workflows progresivamente (WF-1 primero)
6. Iniciar Fase 5 — Google Workspace CLI

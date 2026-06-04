# Workflow Capabilities Audit — SkilLand IA Mujeres

- Date: 2026-06-04
- Mode: apply

## Workflows existentes

| Nombre | Estado | Trigger | Steps |
|--------|--------|---------|-------|
| Quick Lead | ACTIVE | MANUAL  | 3 |
| Notify on new Deal | DRAFT | DATABASE_EVENT (opportunity.created) | 0 |
| (sin nombre) | DRAFT | ?  | 0 |

## Step types disponibles

- `CODE`
- `LOGIC_FUNCTION`
- `SEND_EMAIL`
- `DRAFT_EMAIL`
- `CREATE_RECORD`
- `UPDATE_RECORD`
- `DELETE_RECORD`
- `UPSERT_RECORD`
- `FIND_RECORDS`
- `FORM`
- `FILTER`
- `IF_ELSE`
- `HTTP_REQUEST`
- `AI_AGENT`
- `ITERATOR`
- `EMPTY`
- `DELAY`

## Triggers disponibles

- **DATABASE_EVENT**: dispara en `opportunity.created`, `opportunity.updated`, `opportunity.deleted`, etc.
- **MANUAL**: disparo explícito desde UI o API (`runWorkflowVersion`)
- **AutomatedTrigger**: cron / webhook configurable por UI

### Limitación crítica
DATABASE_EVENT dispara para TODOS los registros del objeto. La condición de campaña (`campaignName == "IA Mujeres 2026"`) debe ir en el primer step **IF_ELSE** del workflow. Si se activa sin esa condición, se disparará en CADA actualización de TODAS las opportunities.

## Acciones disponibles vía API/MCP

- ❌ Crear workflows (`createWorkflow` existe en schema pero devuelve **Method not allowed** — requiere UI)
- ❌ Crear versiones (`createWorkflowVersion` — mismo bloqueo)
- ✅ Leer workflows y sus steps (`workflows { versions { trigger steps } }`)
- ✅ Activar/desactivar si el workflow ya existe (`activateWorkflowVersion`)
- ✅ Ejecutar manualmente si ya existe (`runWorkflowVersion`)
- ✅ Crear campos custom en Opportunity
- ✅ Crear vistas filtradas
- ✅ Actualizar campos de deals (`updateOpportunity` con `data`)

## Limitación crítica: workflows solo se crean desde UI

Las mutaciones `createWorkflow` y `createWorkflowVersion` están en el schema GraphQL pero devuelven `{"message":"Method not allowed"}`. Los workflows deben crearse manualmente en Twenty UI → sección Workflows.

## Lo que requiere UI

- Validar que el `outputSchema` de cada step es correcto (Twenty lo calcula al abrir en editor)
- Configurar la rama **false** del step IF_ELSE (la API solo conecta la rama true vía nextStepIds)
- Marcar steps como `valid: true` para activar el workflow
- Activar el workflow (nunca se activa por script)

## Campos custom actuales en Opportunity

| Campo | Tipo |
|-------|------|
| `needsManualReview` | BOOLEAN |
| `firstEmailSentAt` | DATE_TIME |
| `sourceUrl` | TEXT |
| `icpSegment` | TEXT |
| `meetingDate` | DATE_TIME |
| `businessLineName` | TEXT |
| `highConfidence` | BOOLEAN |
| `genericEmail` | BOOLEAN |
| `departmentArea` | TEXT |
| `meetingStatus` | TEXT |
| `lastReplyAt` | DATE_TIME |
| `island` | TEXT |
| `duplicatePossible` | BOOLEAN |
| `qualityFlags` | TEXT |
| `lastEmailSentAt` | DATE_TIME |
| `municipality` | TEXT |
| `organizationType` | TEXT |
| `campaignName` | TEXT |
| `businessLine` | RELATION |
| `phoneMain` | TEXT |
| `followUpDueAt` | DATE_TIME |
| `sourceType` | TEXT |
| `outreachStatus` | TEXT |
| `sourceFile` | TEXT |

## Campos de seguimiento faltantes

Ninguno — todos los campos ya existen.

## Riesgos detectados

1. **Workflows sin condición**: DATABASE_EVENT sin IF_ELSE afecta todas las opportunities
2. **outputSchema**: los steps creados por API pueden quedar marcados `valid: false` hasta revisión en UI
3. **Stage names**: los valores de stage deben existir en el SELECT de Opportunity (POSSIBLE_OPPORTUNITY, ONGOING, MEETING_SCHEDULED, etc.)
4. **Task creation**: la relación de task con opportunity (taskTarget) no se configura en el CREATE_RECORD básico — necesita añadirse en UI

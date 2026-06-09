# Batch Runner Design — IA Mujeres

Fecha: 2026-06-08

## Decisión

La operación diaria debe ser una combinación de:

- runner determinista en `scripts/ia_mujeres_batch_runner.mjs`;
- operador seco en `scripts/ia_mujeres_daily_operator.mjs`;
- skill repo-local en `shared/`;
- Twenty CRM como centro visible de estado, notas y tareas.

No se automatiza envío externo en esta fase.

## Modos implementados

| Modo | Mutación | Estado |
|---|---|---|
| `audit` | No | Lee CRM y genera `2026-06-08_crm_audit.json` |
| `setup-crm` | Sí con `--apply` | Ya aplicado para campos/vistas/estado inicial |
| `select-batch` | No | Selecciona hasta 5 deals elegibles |
| `prepare-drafts` | No | Genera payloads locales, no Gmail drafts |
| `mark-draft-created` | Sí con `--apply` | Registra draft, nota y tarea |
| `mark-email-sent` | Sí con `--apply` | Registra envío, hilo, nota y tarea follow-up |
| `sync-replies` | Sí con `--apply` | Mapea replies por `gmailThreadId` |
| `sync-bounces` | Sí con `--apply` | Mapea bounces por `gmailThreadId` |
| `prepare-followups` | No | Lista follow-ups vencidos |
| `send-approved` | Bloqueado | No disponible hasta aprobación de primera tanda real |

## Comandos

```bash
node scripts/ia_mujeres_batch_runner.mjs --mode=audit
node scripts/ia_mujeres_batch_runner.mjs --mode=select-batch --limit=5
node scripts/ia_mujeres_batch_runner.mjs --mode=prepare-drafts --batch-id=<id>
node scripts/ia_mujeres_batch_runner.mjs --mode=mark-draft-created --batch-id=<id> --draft-map=<json> --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=mark-email-sent --batch-id=<id> --sent-map=<json> --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-replies --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-bounces --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=prepare-followups --limit=5
node scripts/ia_mujeres_daily_operator.mjs --limit=5 --weekly
```

## Último dry-run operativo

- Batch ID: `2026-06-08T00-34-36-009Z`
- Opportunities CRM vistas: 145.
- IA Mujeres: 100.
- Elegibles: 22.
- Seleccionadas: 5.
- Payloads locales: 5.
- Follow-ups vencidos: 0.
- Outputs:
  - `batch_2026-06-08T00-34-36-009Z_plan.json`
  - `batch_2026-06-08T00-34-36-009Z_review.md`
  - `batch_2026-06-08T00-34-36-009Z_draft_payloads.json`
  - `batch_2026-06-08T00-34-36-009Z_draft_review.md`

## Entradas necesarias

- CRM Twenty accesible con `TWENTY_API_KEY`.
- Opportunities con `campaignName=IA Mujeres 2026` o `businessLineName=SkilLand IA Mujeres`.
- Contacto principal con email válido.
- Campos de control `needsManualReview`, `duplicatePossible`, `genericEmail`.
- Templates UTF-8 en `shared/templates/ia-mujeres/`; antes de proximos drafts reales, confirmar fuera de `04_outputs/` que `email_01` genera Email 1 v3.

## Handoff Email 1 vigente

Referencia documental dentro de `04_outputs`: `04_outputs/ia_mujeres_crm_execution/2026-06-09_email_01_v3_crm_sync.md`.

| Campo | Valor |
|---|---|
| Version | `2026-06-09_email_01_v3` |
| Asunto | `Una preocupación que quería compartir con usted` |
| Variables minimas | `[nombre]`, `[entidad]`, `[territorio]`, `[derivacion_si_corresponde]` |
| Adjunto Email 1 | `Mujeres, IA y el Futuro del Trabajo · Dossier — SkilLand v2.pdf` |

Reglas para `prepare-drafts` y revision humana:

- Contacto nominal fiable: dejar `[derivacion_si_corresponde]` vacio.
- Buzon generico, email de area o interlocutor dudoso: insertar derivacion.
- Si faltan entidad o territorio, no generar/enviar sin revision.
- No inventar entidad, territorio, cargo, area ni contexto.
- No adjuntar white paper ni dossier largo en Email 1.
- No usar el asset anterior de resumen comercial como adjunto vigente.
- No hardcodear firma; validar insercion Gmail/GWS antes de enviar.

## Salidas

- Plan JSON de tanda.
- Revisión Markdown.
- Payloads locales de draft.
- Reportes de registro CRM cuando se use `--apply`.
- Audit CRM.
- Reporte semanal MD/HTML.

## Salvaguardas

- Límite máximo: 5 por tanda.
- Sin envío externo.
- Sin drafts Gmail externos todavía.
- `send-approved` falla intencionadamente.
- `--apply` solo en modos concretos.
- Deals con revisión manual o duplicado quedan excluidos de tanda automática.
- Buzones genericos o interlocutores dudosos requieren derivacion en el cuerpo y aprobacion humana antes de cualquier envio.
- Todo envío real requiere autorización humana explícita fuera del script.

## Reversión

Los dry-runs solo generan archivos. Para cambios CRM aplicados, revertir manualmente:

- limpiar campos Gmail en Opportunity afectada;
- devolver `iaMujeresFunnelStage` al valor anterior;
- cerrar o borrar notas/tareas creadas por el runner si fueron pruebas;
- no borrar campos globales si ya hay eventos productivos.

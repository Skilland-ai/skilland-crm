# Catálogo de capabilities de Skilland CRM Ops

- Status: `active`
- Owner: `Skilland CRM Ops architecture`
- Canonical for: proyección humana del capability registry local
- Last verified: `2026-07-13`
- Supersedes: `shared/knowledge/skilland-ops/capability-catalog.md`
- Superseded by: `none`

## Propósito y fuente de verdad

Este catálogo explica qué capacidades reconoce la arquitectura local, quién las
posee y cuál es su estado observado. La fuente de verdad para resolución,
policy y automatización es
`shared/contracts/skilland-crm-ops/capability-registry.json`; esta tabla es una
proyección humana y nunca habilita una operación por sí sola.

El registro contiene 38 IDs canónicos y un alias legacy, por lo que los 39 IDs
inventariados en Phase 0 siguen siendo resolubles. La resolución debe intentar
primero un ID canónico exacto y después un único alias exacto. Cero o más de
una coincidencia bloquean la petición.

## Cómo leer los estados

- `lifecycle` describe la vigencia semántica: `active`, `planned`, `blocked`,
  `deprecated`.
- `current runtime` declara lo que los entrypoints current/legacy inspeccionados
  permiten afirmar:
  `read_only`, `dry_run`, `apply_guarded`, `not_implemented` o `denied`.
- `CRM Ops` es `frontDoorReadiness`: disponibilidad real detrás de la front
  door en esta gate. Gate 007 solo promueve `report.crm.export` a `read_only` y
  Gate 008 no promueve ninguna readiness adicional;
  las demás siguen `not_implemented` o `denied`, aunque un script legacy admita
  `--apply`. Esa única capability está allowlisted solo en environment `test`;
  no es production-ready sin retención gobernada del artefacto con PII.
- `exposure` separa capabilities públicas de helpers `internal`. Todos los IDs
  siguen siendo resolubles; solo `public` acepta handoff directo.
- `maturity` mide madurez semántica y no readiness. `test` y `evidence` son
  independientes; `unknown` expresa ausencia de atribución verificable, no un
  resultado negativo inventado.
- `modes`, `effects` y `approval` describen policy target. Se evalúan junto con
  lifecycle, front-door readiness, routing, environment y scope; no habilitan
  por sí solos.
- `approval` no sustituye el enforcement. `owner` y `two_stage` describen la
  política target; `denied` no puede ser elevado por confirmación humana.
- Una lista de `effects` vacía significa que la capability no declara side
  effects. Todo efecto no registrado se bloquea.

`active` no equivale a disponible, `partial` no equivale a completo y
`runtimeReadiness: apply_guarded` no habilita el policy kernel ni registra un
worker. Los entrypoints actuales siguen siendo superficies de compatibilidad.

## Proyección del registro

| Capability ID | Owner | Exposure | Lifecycle | Current runtime | CRM Ops | Maturity | Test | Evidence | Policy modes | Effects | Approval |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crm.metadata.read` | `crm-core` | `internal` | `active` | `read_only` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `read_only` | — | `none` |
| `crm.schema.introspect` | `crm-core` | `internal` | `planned` | `not_implemented` | `not_implemented` | `unknown` | `unknown` | `unknown` | `read_only` | — | `none` |
| `crm.record.search` | `crm-core` | `public` | `active` | `read_only` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `read_only` | — | `none` |
| `crm.record.get` | `crm-core` | `public` | `active` | `read_only` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `read_only` | — | `none` |
| `crm.record.create` | `crm-core` | `public` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run`, `apply` | `crm_write` | `owner` |
| `crm.record.update` | `crm-core` | `public` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run`, `apply` | `crm_write` | `owner` |
| `crm.record.delete` | `crm-core` | `public` | `blocked` | `denied` | `denied` | `experimental` | `unknown` | 1 · 2026-07-13 | `dry_run` | `crm_write`, `destructive` | `denied` |
| `crm.record.restore` | `crm-core` | `public` | `blocked` | `not_implemented` | `denied` | `unknown` | `unknown` | `unknown` | `dry_run` | `crm_write` | `denied` |
| `crm.record.destroy` | `crm-core` | `public` | `blocked` | `not_implemented` | `denied` | `unknown` | `unknown` | `unknown` | `dry_run` | `crm_write`, `destructive` | `denied` |
| `crm.relation.link` | `crm-core` | `public` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run`, `apply` | `crm_write` | `owner` |
| `crm.relation.unlink` | `crm-core` | `public` | `planned` | `not_implemented` | `not_implemented` | `unknown` | `unknown` | `unknown` | `dry_run` | `crm_write` | `owner` |
| `crm.activity.note.create` | `crm-core` | `public` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run`, `apply` | `crm_write` | `owner` |
| `crm.activity.task.create` | `crm-core` | `public` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run`, `apply` | `crm_write` | `owner` |
| `crm.activity.task.update` | `crm-core` | `public` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run`, `apply` | `crm_write` | `owner` |
| `crm.metadata.field.create` | `crm-metadata-admin` | `public` | `blocked` | `apply_guarded` | `denied` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run` | `metadata_write` | `denied` |
| `crm.metadata.view.manage` | `crm-metadata-admin` | `public` | `blocked` | `apply_guarded` | `denied` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run` | `metadata_write` | `denied` |
| `crm.workflow.research` | `twenty-workflows` | `public` | `active` | `read_only` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `read_only` | — | `none` |
| `crm.workflow.design` | `twenty-workflows` | `public` | `active` | `dry_run` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run` | — | `none` |
| `crm.workflow.implement` | `twenty-workflows` | `public` | `blocked` | `apply_guarded` | `denied` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run` | `workflow_change` | `denied` |
| `crm.workflow.test` | `twenty-workflows` | `public` | `active` | `dry_run` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run` | — | `none` |
| `crm.plan.validate` | `crm-core` | `internal` | `active` | `dry_run` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run` | — | `none` |
| `crm.execution.apply` | `crm-core` | `internal` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run`, `apply` | `crm_write` | `owner` |
| `crm.conversation.manual_review` | `crm-conversation` | `public` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `read_only`, `dry_run` | — | `none` |
| `aikount.openapi.live` | `aikount-erp` | `internal` | `active` | `read_only` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `read_only` | — | `none` |
| `aikount.document.interview` | `aikount-erp` | `public` | `active` | `dry_run` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run` | — | `none` |
| `aikount.operation.plan` | `aikount-erp` | `public` | `active` | `dry_run` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run` | — | `none` |
| `aikount.execution.apply` | `aikount-erp` | `internal` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run`, `apply` | `erp_write`, `external_send` | `two_stage` |
| `aikount.file_container.manage` | `aikount-erp` | `public` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `read_only`, `dry_run`, `apply` | `local_write`, `erp_write` | `two_stage` |
| `bridge.crm_aikount.context` | `crm-aikount-bridge` | `internal` | `active` | `read_only` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `read_only` | — | `none` |
| `bridge.crm_aikount.writeback.plan` | `crm-aikount-bridge` | `internal` | `planned` | `not_implemented` | `not_implemented` | `unknown` | `unknown` | `unknown` | `dry_run` | `crm_write` | `two_stage` |
| `campaign.ia_mujeres.status` | `ia-mujeres-campaign` | `public` | `active` | `read_only` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `read_only` | — | `none` |
| `campaign.ia_mujeres.batch.prepare` | `ia-mujeres-campaign` | `public` | `active` | `dry_run` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run` | `local_write` | `none` |
| `campaign.ia_mujeres.drafts.create` | `ia-mujeres-campaign` | `public` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run`, `apply` | `external_draft`, `crm_write` | `two_stage` |
| `campaign.ia_mujeres.batch.send` | `ia-mujeres-campaign` | `public` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run`, `apply` | `external_send`, `crm_write` | `two_stage` |
| `campaign.ia_mujeres.signals.sync` | `ia-mujeres-campaign` | `public` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run`, `apply` | `crm_write` | `two_stage` |
| `campaign.ia_mujeres.tasks.reconcile` | `ia-mujeres-campaign` | `public` | `active` | `apply_guarded` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `dry_run`, `apply` | `crm_write` | `owner` |
| `campaign.ia_mujeres.weekly_report` | `ia-mujeres-campaign` | `public` | `active` | `read_only` | `not_implemented` | `partial` | `unknown` | 1 · 2026-07-13 | `read_only` | `local_write` | `none` |
| `report.crm.export` | `reporting` | `public` | `active` | `read_only` | `read_only` | `partial` | `integration` | 3 · 2026-07-13 | `read_only` | `local_write` | `none` |

La distribución es: 30 capabilities `public` y ocho `internal`; 31
`frontDoorReadiness: not_implemented`, una `read_only` y seis `denied`; 32 con
`semanticMaturity: partial`, cinco `unknown` y una `experimental`. Solo
`report.crm.export` tiene `testLevel: integration`; las otras 37 conservan
`unknown` porque los tests históricos no se atribuyen automáticamente a cada
capability.

Cinco entradas carecen de evidence verificable y se muestran como `unknown`:
`crm.schema.introspect`, `crm.record.restore`, `crm.record.destroy`,
`crm.relation.unlink` y `bridge.crm_aikount.writeback.plan`. Las demás muestran
el número de claims y la fecha; el detalle completo vive en el registry.

## Alias de compatibilidad

| Legacy ID | Canonical ID | Regla |
| --- | --- | --- |
| `crm.export.chatgpt` | `report.crm.export` | Resuelve al canónico; no posee contrato, policy ni executor propios. |

El alias se conserva para compatibilidad con el inventario Phase 0. Un cambio
futuro debe seguir una ventana de deprecación explícita y demostrar que ningún
caller lo usa antes de retirarlo.

## Denegaciones e invariantes

- `crm.record.delete`, `crm.record.restore` y `crm.record.destroy` permanecen
  denegadas aunque el API upstream pueda exponer operaciones equivalentes.
- Las mutations de metadata y la implementación/activación de workflows están
  denegadas en la front door de esta fase, aunque scripts especializados
  legacy con `--apply` expliquen su `runtimeReadiness: apply_guarded`.
- `crm.conversation.manual_review` sigue activa como interaction capability,
  pero su policy target solo permite leer y producir planes; el write path de
  `yarn crm:review` es compatibilidad legacy, no ownership futuro.
- Descubrir un objeto o campo mediante metadata no lo incorpora al allowlist.
- Un efecto externo requiere policy explícita; `two_stage` debe quedar ligado
  al hash y scope exactos del plan.
- Un write-back CRM–AIKount será un segundo plan correlacionado. Nunca se
  interpreta como una transacción distribuida implícita.
- `local_write` se declara como efecto aunque no modifique un sistema externo.

## Evidencia y mantenimiento

Cuando existe evidence, la entrada machine-readable identifica path, fecha y
`claim`; cinco entradas conservan deliberadamente `evidence: []` y
`lastVerifiedAt: null`. La evidencia demuestra únicamente lo que declara su
claim, no readiness target. Cuando cambien contratos, scripts o policy, se
actualiza primero el registry, se valida contra su schema y después se regenera
esta proyección en el mismo change set. Si no se puede verificar una
afirmación, permanece `unknown`.

La evidencia integration de `report.crm.export` es offline: usa el manifest y
registry reales con CRM fake y un filesystem temporal. No afirma que
credenciales, workspace o datos live hayan sido verificados.

### Sources

- `shared/contracts/skilland-crm-ops/capability-registry.json`
- `shared/contracts/skilland-crm-ops/capability-registry.schema.json`
- `03_specs/now/006_skilland_crm_ops_phase0_5_foundation.md`
- runtime y tests locales citados individualmente en `capabilities[].evidence`

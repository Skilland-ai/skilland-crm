# Skilland CRM Ops Phase 0.5 — Implementation Report v1

- Status: completed
- Date: 2026-07-13
- Owner: Skilland CRM Ops architecture
- Scope: Spec 006 Architecture Foundation
- Repo baseline: `4f1a383944c731255b9b86b75d601fb2bbe8f800`
- Runtime changes: none
- Live calls or external mutations: none

## 1. Resultado

La Spec 006 queda implementada como fundación documental y contractual. El
repositorio dispone ahora de una arquitectura local coherente, un manifest de
descubrimiento, un capability registry versionado, contratos Draft 2020-12,
gobierno de conocimiento/specs y un roadmap por gates.

La entrega no implementa el router `Skilland CRM Ops`, no habilita writes
nuevos y no cambia el comportamiento de entrypoints existentes. El manifest
declara la front door como `planned`; las 38 capabilities están
`frontDoorReadiness: not_implemented` o `denied`.

La corrección arquitectónica central es:

```text
Hermes + HomeLab Meta-Harness
  global repo routing, priority and cross-repo risk
        |
        v
skilland-crm repo manifest
        |
        v
Skilland CRM Ops
  local capability routing and domain policy (planned)
        |
        v
PDP/PEP + deterministic workers (future gates)
```

## 2. Alcance ejecutado

### Gobierno raíz y specs

- `AGENTS.md`: identidad upstream/overlay, orden de lectura, límites
  global/local, safety, fallback y reglas de verificación.
- `03_specs/README.md`: lifecycle autoritativo por `Status`, transición y
  excepción física de specs legacy 002–004.
- Spec 005: preservada como historia y marcada `superseded`.
- Spec 006: alcance integrado, contratos, gates, checks y criterios de cierre.

### Conocimiento canónico

Se creó `shared/knowledge/skilland-crm-ops/` con:

- README y mapa de autoridad;
- arquitectura objetivo;
- modelo de safety y approval;
- capability catalog como proyección humana del registry;
- knowledge governance;
- roadmap 006–013;
- ADR-001 a ADR-005.

El path `shared/knowledge/skilland-ops/` conserva un compatibility pointer y
los dos documentos Phase 0 como snapshots `superseded`. Sus avisos preceden a
los claims históricos, por lo que no existe un segundo canon activo.

### Contratos machine-readable

Se creó `shared/contracts/skilland-crm-ops/` con:

- `repo-manifest.schema.json` y `repo-manifest.json`;
- `capability-registry.schema.json` y `capability-registry.json`;
- `operation-envelope.schema.json`;
- seis ejemplos: request de export, plan manual-review, approval plan-bound y
  resultados success, blocked y partial cross-domain.

Los tres schemas usan JSON Schema Draft 2020-12, `$id` estables bajo
`https://schemas.skilland.ai/skilland-crm-ops/v1/` y binding exacto
`schemaVersion: 1.0.0`. Las instancias se validan offline aportando los schemas
locales por su `$id`; no se realizó resolución de red.

## 3. Fuentes revisadas

### Repo local

- auditoría del overhaul CRM:
  `04_outputs/crm_agents_overhaul_audit/2026-07-06_crm_agents_overhaul_audit.md`;
- Spec 005 y documentos Phase 0;
- `package.json`;
- CRM Execution, CRM Manual Review, AIKount e IA Mujeres bajo `scripts/`;
- agentes, skills, conocimiento y orquestaciones de CRM, AIKount, campañas y
  Twenty Workflows;
- contratos y tests current/legacy citados por cada registry evidence claim.

### Doctrina cross-repo fijada

- HomeLab:
  `https://github.com/Skilland-ai/skilland-agentic-homelab/commit/25cb94b2ed5482ca722cd76c8be71487ddba6aff`;
- North Star:
  `https://github.com/RaulAM7/skilland-agentic-north-star/commit/31c59d14b1802081e8e25026cff5d37a843db735`.

Los SHAs fijan la versión doctrinal consultada. No se usa `main` flotante como
evidencia y no se afirma que esos repos sigan sin cambios después de los
commits indicados.

## 4. Decisiones arquitectónicas aceptadas

| ADR | Decisión |
| --- | --- |
| ADR-001 | Hermes/HomeLab es control plane global; CRM Ops es front door local. |
| ADR-002 | Agents interpretan y planifican; PEP y workers deterministas poseen side effects. |
| ADR-003 | CRM Core es metadata-aware y allowlisted, no CRUD universal. |
| ADR-004 | Riesgo multidimensional y approval ligada al hash/scope/expiry del plan. |
| ADR-005 | CRM, AIKount, campañas, workflows, integración y adapters conservan boundaries explícitos. |

Además:

- AIKount permanece colocada en este repo detrás de un port extraíble.
- CRM–AIKount usa planes separados y correlacionados; no promete atomicidad
  distribuida.
- CRM Conversation sigue activa como interaction capability, pero el write
  path de `yarn crm:review` queda identificado como compatibilidad legacy.
- Metadata administration pertenece a `crm-metadata-admin`, no al CRUD de CRM
  Core.
- `crm.record.restore` se modela como `crm_write`, no como efecto destructivo;
  sigue bloqueada por lifecycle/policy.
- Environment siempre debe ser explícito para ejecutar. Un environment
  ambiguo se asume production solo para calcular riesgo y se deniega.

## 5. Capability registry

### Resolución y routing

- 38 IDs canónicos únicos.
- Un único alias: `crm.export.chatgpt -> report.crm.export`.
- 39 IDs Phase 0 resolubles exactamente una vez.
- 30 capabilities `public` y ocho `internal`.

Los helpers internos son:

- `crm.metadata.read`;
- `crm.schema.introspect`;
- `crm.plan.validate`;
- `crm.execution.apply`;
- `aikount.openapi.live`;
- `aikount.execution.apply`;
- `bridge.crm_aikount.context`;
- `bridge.crm_aikount.writeback.plan`.

Que un ID sea resoluble no permite un handoff público directo. En particular,
los executors internos no pueden utilizarse como bypass genérico de las
allowlists.

### Separación current/target

El registry separa ejes que Phase 0 mezclaba:

- `runtimeReadiness`: realidad current/legacy inspeccionada;
- `frontDoorReadiness`: disponibilidad real detrás de CRM Ops en la gate
  vigente;
- `routingExposure`: public/internal/legacy-only;
- `lifecycleStatus` y `semanticMaturity`;
- `testLevel` y evidence;
- policy target: modos, effects, domain span, data classes, reversibility,
  approval, environment y scope.

Esto permite declarar honestamente que scripts especializados de metadata o
workflow admiten `--apply`, mientras su front-door policy permanece `denied`.
Ningún entrypoint legacy actúa como fallback implícito.

### Estado Phase 0.5

- 32 capabilities `frontDoorReadiness: not_implemented`.
- Seis capabilities bloqueadas con `frontDoorReadiness: denied`.
- 32 capabilities con madurez `partial`, cinco `unknown` y una
  `experimental`.
- Las 38 conservan `testLevel: unknown`; el test suite histórico no se atribuye
  automáticamente capability por capability.

Cinco entries no tienen evidence suficiente y mantienen
`evidence: []`/`lastVerifiedAt: null`:

- `crm.schema.introspect`;
- `crm.record.restore`;
- `crm.record.destroy`;
- `crm.relation.unlink`;
- `bridge.crm_aikount.writeback.plan`.

## 6. Safety y contratos

### Invariantes codificados

- Unknown fields y versiones incorrectas fallan cerrados.
- La front door `planned` no puede marcarse implemented ni habilitar production
  writes.
- Un agent no es un valor válido para `sideEffectExecutor`.
- Destructive, metadata mutation y workflow change permanecen denied.
- External drafts/sends cruzan domain/channel; external send, cualquier ERP
  write y CRM write-back cross-domain exigen `two_stage`.
- `two_stage` exige exactamente `business_content_approval` y
  `effect_target_approval`; un envelope aprobado no admite stages rechazadas.
- Safe approval scope nunca habilita destructive, metadata mutation o workflow
  activation.
- Request/plan input aplica un guard estructural recursivo contra nombres de
  claves secret-shaped. El runtime futuro sigue obligado a redactar valores,
  evidence, errors, URLs firmadas y PII.
- Result no puede elevar `dry_run` a `apply`; success, simulated, planned,
  blocked, failed y partial failure tienen coherencia estructural básica.
- Worker version se registra por operation, no como un único valor ambiguo en
  un result cross-domain.

### Plan y aprobación

El planner produce operaciones y precondiciones normalizadas. El PDP calcula
risk y tier; después un finalizer congela `OperationPlan`, `registryVersion`,
`policyVersion` y `planHash`. Approval se liga a ese hash, scope y expiry.

Los limits pueden representar IDs/resources/fields, documentos,
recipient/sender refs opacos, amount/currency, workflow IDs, paths,
overwrite y artifact size. Las preconditions registran source, observación,
vigencia y expected version/hash.

Las versiones current de registry y policy son `1.0.0`, separadas de
`schemaVersion: 1.0.0`. Un result blocked/failed antes de leer policy puede
conservar versiones `null` sin inventar evidencia.

## 7. Verificaciones ejecutadas

| Check | Resultado |
| --- | --- |
| Parse JSON | 11/11 válidos. |
| Schema meta-validation | 3/3 schemas Draft 2020-12 válidos con format checking. |
| Instance validation | Manifest + registry + seis ejemplos: 8/8 válidos. |
| References | Todos los `$ref` internos y contract targets resuelven offline; evidence y canonical knowledge paths existen. |
| Capability parity | 38 canónicas + 1 alias = los mismos 39 IDs Phase 0, sin colisiones. |
| Catalog parity | 38 filas y alias coinciden exactamente con el registry. |
| Adversarial contract checks | 17 casos inválidos rechazados; blocked pre-policy con versiones unknown aceptado. |
| Runtime regression | 31 tests, 31 pass, 0 fail. |
| Whitespace/links/metadata | Sin trailing whitespace; links locales resolubles; metadata canónica completa. |
| Runtime diff | `package.json`, `scripts/`, agents, skills y orchestration sin cambios tracked. |
| External effects | Ninguna llamada live ni mutación externa. |

Los adversarial checks cubrieron, entre otros: fields desconocidos, versión o
schema URI incorrectos, front door planned marcada implemented, agent executor,
metadata approval, blocked capability habilitada, executor públicamente
routable, stable sin evidence/test/date, approval de una sola etapa, stage
rechazada, destructive scope, secret-shaped key anidada, result success con
operation failed y elevación dry-run/apply.

Comando de regresión ejecutado:

```bash
node --test \
  scripts/crm_execution_crew/crm-execution-crew.test.mjs \
  scripts/crm_aikount_ops/crm-aikount-ops.test.mjs \
  scripts/crm_manual_update_crew/parser.test.mjs
```

Resultado: `tests 31`, `pass 31`, `fail 0`.

## 8. Unknowns y trabajo diferido

Phase 0.5 cierra arquitectura y contratos, no runtime. Queda deliberadamente
diferido:

- `RepoHandoffRequest`: `globalControlPlane.handoffContract` sigue `null` hasta
  alinear el primer handoff con HomeLab en Gate 007.
- Router local, alias resolver, structured errors y vertical slice de
  `report.crm.export`: Gate 007.
- Canonical JSON/hash implementation, PDP/PEP, idempotency store y approvals:
  Gate 008.
- Invariantes semánticos entre documentos/colecciones que JSON Schema no puede
  expresar por sí solo: equality plan/approval hash, union de operation/risk
  effects, scope containment, policy drift y correspondencia de partial
  failure IDs. Gate 008 debe implementar validator determinista y tests
  adversariales.
- CRM writes allowlisted: Gate 009; unificación de write paths legacy: Gate
  010.
- CRM–AIKount: Gate 011; external effects/campaign automation: Gate 012;
  deprecación controlada: Gate 013.
- Publicación o resolución remota de los schema `$id`: no realizada. Los IDs
  son estables y se mapearon a archivos locales para esta validación.
- Live metadata, auth, workspace state y APIs externas no se revalidaron porque
  la spec prohíbe llamadas live. Sus claims siguen limitados a evidence fechada
  o `unknown`.
- No existe todavía un generador automático registry -> Markdown; la paridad
  se comprobó de forma determinista en el gate de cierre.

## 9. Desviaciones y endurecimientos surgidos de la auditoría

No hubo desviaciones de alcance ni runtime. La revisión crítica añadió campos
y reglas más estrictos que el primer borrador de la Spec 006:

- `frontDoorReadiness` y `routingExposure` por capability;
- `registryVersion` y `policyVersion` separadas de schema version;
- exposición internal de executors y helpers;
- distinction explícita entre legacy capability y front-door policy;
- scopes/preconditions auditables;
- environment explícito y fallback directo a API/DB denegado;
- output media types coherentes;
- identidades/workspaces sintéticos en ejemplos;
- result/version/mode/worker coherence más fuerte.

Estos hardenings mantienen Phase 0.5 estrictamente documental y reducen el
riesgo de que Gate 007 interprete el registry como permiso global.

## 10. Cierre y siguiente gate

Todos los acceptance criteria de la Spec 006 han pasado. La spec se marca
`completed` con este informe y la siguiente spec autorizable es Gate 007 —
Thin Local Router.

Gate 007 debe mantener writes externos bloqueados y demostrar primero:

```text
HomeLab/Hermes handoff
  -> skilland-crm manifest
  -> local capability/alias resolver
  -> report.crm.export
  -> structured OperationResult + allowlisted local artifact
```

Completar este informe no autoriza comenzar Gate 007 ni ejecutar el vertical
slice live; requiere su propia spec `ready_for_implementation`.

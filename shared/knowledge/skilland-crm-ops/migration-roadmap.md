# Roadmap de migración por gates

- Status: active
- Owner: Skilland CRM Ops architecture
- Canonical for: orden, dependencias y criterios de paso del overhaul `Skilland CRM Ops`
- Last verified: 2026-07-13
- Supersedes: fases 1–6 de shared/knowledge/skilland-ops/target-architecture.md
- Superseded by: none

## 1. Regla de ejecución

El overhaul se implementa como una secuencia de gates 006–013. Cada spec debe
demostrar sus criterios y publicar evidencia antes de iniciar la siguiente. El
número de gate expresa dependencia, no una promesa de fecha.

La migración prioriza primero contratos y observabilidad, luego un vertical
slice sin writes, después policy enforcement y solo entonces mutations
allowlisted. No se construye CRUD genérico como atajo.

## 2. Invariantes del programa

- HomeLab/Hermes sigue siendo control plane global; CRM Ops es front door local.
- Los entrypoints legacy no se rompen antes de demostrar paridad.
- Dry-run es el default durante todo el programa.
- Ningún agente posee side effects.
- Todo worker nuevo pasa por enforcement determinista.
- Metadata descubre y valida; allowlists autorizan.
- La disponibilidad se promociona por capability mediante
  `frontDoorReadiness`; un flag global de front door nunca habilita en bloque
  AIKount, campañas o writes de gates posteriores.
- AIKount conserva frontera de dominio y port extraíble.
- Cross-domain usa planes separados y correlacionados.
- Deletes, metadata mutations y workflow activation permanecen `denied` hasta
  una spec posterior explícita; no se habilitan por acumulación de fases.
- Un gate puede endurecer safety sin esperar al siguiente; no puede rebajarlo
  sin decisión versionada.

## 3. Vista de gates

| Gate | Status | Nombre | Resultado principal | Writes nuevos al cerrar |
| --- | --- | --- | --- | --- |
| 006 | `completed` | Architecture Foundation | canon, manifest, registry, contracts y governance | ninguno |
| 007 | `completed` | Thin Local Router | routing local fail-closed y primer handoff read-only | ninguno externo; un artefacto local acotado |
| 008 | `completed` | Policy and Approval Kernel | PDP/PEP, plan hash, approval e idempotencia | ninguno |
| 009 | `not_started` | Allowlisted CRM Core | primer set CRM tipado y acotado | notes, tasks y Opportunity subsets aprobados |
| 010 | `not_started` | Unify CRM Writes | manual review e IA Mujeres detrás de CRM Core | solo equivalentes a capabilities 009 |
| 011 | `not_started` | CRM–AIKount Integration | bridge correlacionado y boundaries probados | AIKount y CRM write-back como planes separados |
| 012 | `not_started` | Automation and External Effects | Gmail/workflows/campaign effects con gates propios | únicamente subsets aprobados por capability |
| 013 | `not_started` | Controlled Deprecation | aliases, retirada gradual y canon limpio | ninguno adicional por deprecación |

## 4. Gate 006 — Architecture Foundation

### Objetivo

Sustituir la arquitectura Phase 0 por una fundación coherente, machine-readable
y preparada para HomeLab, sin modificar runtime.

### Entregables

- `AGENTS.md` raíz y gobierno de specs/conocimiento;
- arquitectura, safety model, ADRs y este roadmap;
- repo manifest con la front door marcada `planned`;
- capability registry con los IDs Phase 0, aliases y evidencia honesta;
- separación machine-readable entre `runtimeReadiness` legacy,
  `frontDoorReadiness` y `routingExposure`;
- schemas versionados para request, plan, approval y result;
- ejemplos válidos, puntero de compatibilidad e informe de implementación.

### Gate de salida

- JSON y refs validan;
- los 39 IDs anteriores son resolubles una sola vez como canónico o alias;
- no hay dos arquitecturas activas;
- ninguna capability sin evidencia se presenta como estable;
- toda capability está `frontDoorReadiness: not_implemented` o `denied`; Phase
  0.5 no activa la front door por documentación;
- risk model es multidimensional y fail-closed;
- tests runtime existentes siguen pasando;
- `package.json` y runtime tracked no cambian;
- Spec 005 queda supersedida y Spec 006 completada solo tras la verificación.

## 5. Gate 007 — Thin Local Router

- Status: `completed` (2026-07-13)
- Spec: `03_specs/now/007_skilland_crm_ops_thin_local_router.md`
- Evidence:
  `04_outputs/skilland_crm_ops_router/2026-07-13_gate007_implementation_report_v1.md`

### Objetivo

Demostrar la frontera global/local y el routing por capability sin introducir
side effects externos.

### Implementación mínima

- parser/validator de `RepoHandoffRequest` y `repo-manifest.json`;
- resolución exacta de canonical ID y aliases desde el registry;
- dispatcher local limitado a capabilities con mode `read_only` o `dry_run`;
- `OperationRequest` y `OperationResult` conformes al schema;
- structured errors para unknown capability, unsupported mode, environment y
  contract version;
- correlation IDs y logs redactados.

El handoff v0.1 es provisional y poseído por `skilland-crm`: el commit HomeLab
revisado todavía no define el contrato global machine-readable. Gate 007 no
presenta este schema como interoperabilidad global cerrada.

### Vertical slice obligatorio

```text
HomeLab/Hermes handoff
  -> skilland-crm manifest
  -> Skilland CRM Ops router
  -> report.crm.export
  -> structured OperationResult + artifact evidence
```

`yarn crm:export` permanece disponible como entrypoint de compatibilidad
manual. El adapter canónico reutiliza directamente el servicio query-only del
exportador; nunca ejecuta el CLI ni lo usa como fallback. El slice puede crear
únicamente su artefacto local nuevo en el output allowlisted; no autoriza
overwrite, email ni CRM write.

### Resultado de cierre

- `yarn crm:ops` carga foundation fija, resuelve canónico/alias y devuelve
  `OperationResult` v1;
- solo `report.crm.export/read_only/test` está habilitada; sandbox/production
  esperan retención ejecutable del artefacto con PII;
- el adapter comparte un servicio query-only con el CLI legacy y exige binding
  explícito de environment/workspace;
- source incompleto o exclusión IA Mujeres no demostrable bloquea antes del
  artefacto;
- el store local está confinado, usa `wx`, `0600`, byte cap y SHA-256;
- tests contract/routing/redaction/export/harness/E2E pasan sin red ni live;
- Al cerrar Gate 007, Gate 008 todavía no estaba implementado y todo `apply`
  fallaba antes del worker; el cierre posterior de Gate 008 no amplía esa
  disponibilidad real.

### Gate de salida

- routing no depende de buscar scripts por nombre;
- aliases resuelven al ID canónico sin executor propio;
- unknown/blocked/write capability falla cerrada;
- tests contract, routing, redaction y no-write pasan;
- existe prueba end-to-end local del vertical slice y la compatibilidad legacy
  está documentada como superficie separada, nunca como fallback implícito.

## 6. Gate 008 — Policy and Approval Kernel

- Status: `completed` (2026-07-13)
- Spec: `03_specs/now/008_skilland_crm_ops_policy_approval_kernel.md`
- Evidence:
  `04_outputs/skilland_crm_ops_policy/2026-07-13_gate008_implementation_report_v1.md`

### Objetivo

Implementar el mecanismo determinista que en fases posteriores controlará
workers, manteniendo todavía bloqueados los writes nuevos.

### Implementación mínima

- representación canónica y hashing de `OperationPlan` con golden vectors;
- validator semántico cross-field: `risk.effects` debe ser la unión de
  `operations[].expectedEffects`, environment/tier no pueden divergir, el modo
  efectivo no se eleva y los IDs de partial failure corresponden a operations;
- Policy Decision Point sobre registry, entorno, riesgo y scope;
- approvals inmutables, expirables y ligadas al plan;
- soporte de `operator`, `owner`, `two_stage` y `denied`;
- Policy Enforcement Point con revalidación pre-worker;
- policy deny ejecutable para artefactos locales con PII fuera de test hasta
  implementar retención durable antes de promover reporting;
- idempotency store/port y estados `planned`, `simulated`, `succeeded`,
  `blocked`, `partial_failure` y `failed`, con outcome desconocido expresado
  como issue no reintentable;
- audit evidence y redaction.

### Gate de salida

- hash mismatch, scope expansion, expiry, policy drift y precondition drift
  bloquean;
- registry/policy versions desconocidas o contradictorias bloquean sin
  inventar una versión en el result;
- `two_stage` exige dos decisiones sobre el mismo hash;
- retries no idempotentes se bloquean;
- partial failure y compensation plan se representan sin autoejecución;
- tests adversariales demuestran que ningún worker puede invocarse fuera del
  PEP;
- todos los writes nuevos continúan denylisted.

### Resultado de cierre

- canonical JSON y domain-separated SHA-256 tienen golden vectors y un plan
  example con hash verificable;
- PDP deriva risk/tier y falla cerrado ante readiness, scope, target, effects,
  environment, dangerous effects o retención insuficiente;
- approval humana queda ligada a plan/hash/environment/tier/scope/expiry;
- PEP revalida policy, approval, preconditions e idempotencia antes de un
  worker estático;
- store in-memory demuestra reserva batch, replay, conflict, in-progress y
  outcome unknown sin presentarse como durable;
- partial failure conserva operations y no auto-compensa;
- 24 tests policy, 85 tests ops y 31 tests legacy pasan offline;
- registry real mantiene cero `apply_guarded` y cero workers apply por defecto.

## 7. Gate 009 — Allowlisted CRM Core

### Objetivo

Introducir el primer write boundary CRM nuevo con valor real y blast radius
pequeño.

### Primer allowlist

- note create + validated target link;
- task create y task update/close con resolución exacta;
- subconjunto explícito de Opportunity update;
- Opportunity create solo si sus campos y precondiciones se fijan en la spec
  del gate y existe paridad suficiente con v1.

La spec 009 enumerará objetos, fields y operations exactos desde evidencia del
workspace. Todo lo no enumerado queda read-only o `denied`.

### Implementación mínima

- metadata snapshot/introspection para validación;
- contracts tipados por operación allowlisted;
- planner puro, deterministic CRM worker y Twenty adapter;
- diffs, record limits, ambiguity blocking y evidence;
- wrapper de `crm_execution_crew` donde haya paridad, sin retirar v1.

### Gate de salida

- tests unitarios, contract e integration sandbox por cada allowlist entry;
- no-write-without-valid-approval probado;
- metadata/object discovery no amplía el allowlist;
- delete, destroy, restore, metadata writes y workflows siguen fuera;
- fallback a v1 está documentado y no evade policy para requests nuevos.

## 8. Gate 010 — Unify CRM Writes

### Objetivo

Eliminar paths duplicados sin perder la lógica de conversación y campaña.

### Implementación mínima

- manual review produce `OperationPlan` de CRM Core;
- IA Mujeres conserva selección, copy, funnel y reconciliación, pero emite
  operaciones CRM Core para notes/tasks/Opportunity fields habilitados;
- adapters conversacionales presentan plan, diff, approval y result;
- paridad de dry-run, audit logs y errores con entrypoints legacy.

### Gate de salida

- los casos migrados no importan clientes de escritura CRM fuera del worker;
- tests de paridad cubren éxito, ambigüedad, rechazo y fallo parcial;
- capabilities no incluidas continúan por el path legacy explícito o quedan
  bloqueadas; no hay fallback silencioso;
- se mide uso de ambos paths antes de deprecar nada.

## 9. Gate 011 — CRM–AIKount Integration

### Objetivo

Formalizar AIKount como kernel independiente y el bridge como integration
workflow, con consistencia eventual visible.

### Implementación mínima

- port AIKount sin dependencia de tipos/clientes internos CRM;
- CRM context snapshot read-only y versionado;
- plan AIKount con idempotency y policy contable;
- result AIKount como input evidenciado de un nuevo request de write-back CRM;
- correlation, partial failure y compensation proposal;
- approvals independientes, con `two_stage` para todo `erp_write` bajo la
  policy inicial, external send y CRM write-back cross-domain.

### Gate de salida

- AIKount no puede importar ni recibir un CRM write client;
- un approval AIKount no autoriza CRM;
- un timeout con outcome desconocido evita retries inseguros y exige
  reconciliación;
- sandbox/integration tests cubren éxito AIKount + fallo CRM y el caso inverso
  cuando sea posible;
- extracción futura del adapter AIKount está probada por sus ports.

## 10. Gate 012 — Automation and External Effects

### Objetivo

Incorporar los efectos de mayor blast radius mediante capabilities separadas,
no mediante flags añadidos a CRUD.

### Subdominios

- Gmail drafts y sends;
- IA Mujeres batch execution y signal sync;
- report delivery;
- workflow draft/test y, solo con una decisión posterior explícita,
  activation;
- metadata administration permanece fuera salvo spec dedicada.

### Controles mínimos

- audiencia y contenido congelados en plan;
- send separado de draft;
- recipient/message/run limits;
- sandbox evidence, blast-radius estimate y kill switch para workflows;
- external/accounting effects con `two_stage`;
- resultados parciales y CRM write-back separados.

### Gate de salida

- ningún draft concede permiso de send;
- ninguna implementación de workflow concede activation;
- tests sandbox y fault injection verifican límites, cancelación y
  reanudación segura;
- las capabilities que no cumplen los controles siguen `denied`.

## 11. Gate 013 — Controlled Deprecation

### Objetivo

Retirar duplicidad solo después de que contratos, paridad y operación real lo
permitan.

### Implementación mínima

- mapa legacy -> canonical capability/alias;
- avisos de deprecación y periodo de convivencia;
- métricas de uso, owner y fecha de retirada;
- migración de documentación y consumers;
- rollback path por entrypoint;
- eliminación final de paths directos solo cuando no haya consumers conocidos.

### Gate de salida

- cada comando retirado tiene replacement y evidencia de paridad;
- no quedan dos write owners para la misma capability;
- aliases no conservan policy o executor propios;
- specs/documentos históricos permanecen trazables pero no aparecen como canon
  activo;
- tests y runbooks utilizan exclusivamente las interfaces canónicas.

## 12. Cambios que requieren un gate nuevo

No quedan autorizados por completar 013:

- CRUD universal dinámico;
- hard destroy o bulk delete;
- metadata mutation genérica;
- workflow activation general;
- autonomía sin aprobación para external sends o accounting effects;
- transacciones distribuidas CRM–AIKount;
- convertir CRM Ops en router global.

Cada uno necesita problema de negocio probado, threat model, capability
específica, spec, tests y una decisión explícita. La arquitectura favorece
extensión por capabilities, no expansión silenciosa de autoridad.

## 13. Fuentes y evidencia

- `03_specs/now/006_skilland_crm_ops_phase0_5_foundation.md`
- `shared/knowledge/skilland-crm-ops/target-architecture.md`
- `shared/knowledge/skilland-crm-ops/safety-and-approval-model.md`
- `shared/contracts/skilland-crm-ops/repo-manifest.json`
- `shared/contracts/skilland-crm-ops/capability-registry.json`
- `shared/contracts/skilland-crm-ops/operation-envelope.schema.json`
- auditoría del overhaul del `2026-07-06`
- HomeLab commit `25cb94b2ed5482ca722cd76c8be71487ddba6aff`
- North Star commit `31c59d14b1802081e8e25026cff5d37a843db735`

Cada gate debe añadir evidencia fechada propia. Completar un documento o una
spec no prueba por sí solo readiness runtime.

# Arquitectura objetivo de Skilland CRM Ops

- Status: active
- Owner: Skilland CRM Ops architecture
- Canonical for: límites global/local, capas, ownership y flujo operativo objetivo de `skilland-crm`
- Last verified: 2026-07-13
- Supersedes: shared/knowledge/skilland-ops/target-architecture.md
- Superseded by: none

## 1. Propósito y estado

`Skilland CRM Ops` es la front door operativa **local** de este repositorio. Su
misión es transformar un handoff ya asignado a `skilland-crm` en una
capability registrada y un resultado auditable; para writes futuros también
exigirá un plan explícito.

Gate 007 materializa el router thin y `report.crm.export/read_only/test`.
Gate 008 materializa el policy/approval kernel como runtime interno probado
con workers fake: canonical hash, PDP, approval plan-bound, PEP,
preconditions, idempotencia in-memory y resultados parciales. Los planners y
workers reales de write siguen siendo target state de gates posteriores.
`available` no significa que todo el catálogo esté operativo;
sandbox/production esperan retención gobernada del artefacto con PII.

La arquitectura busca una interfaz semántica estable sin crear un superagente
ni mezclar los kernels de CRM, ERP, campañas y automatización. La especialidad
permanece abajo; la trazabilidad y la política atraviesan todas las capas.

## 2. Estado implementado y límites tras Gate 008

- Implementado: handoff provisional local, router fail-closed, resolución
  canonical/alias, `OperationResult` v1 y worker local determinista del export.
- Implementado: policy engine determinista, hash/finalizer de planes,
  approvals estructuradas, PEP, precondition verifier port, worker map estático
  e idempotency store in-memory de referencia.
- No implementado: planner de negocio, trust provider de approvers, store
  durable, workers reales de write, retención automática ni ninguna promoción
  `apply_guarded`.
- No cambiar la semántica de entrypoints legacy salvo hardening read-only del
  export compartido.
- No convertir toda operación descubierta en Twenty en una capability
  autorizada.
- No fusionar AIKount con CRM Core.
- No tratar workflows, metadata administration o external sends como CRUD
  ordinario.
- No conceder autoridad de escritura a un agente por su nombre o rol.
- No ejecutar mutaciones live para validar la arquitectura.

## 3. Frontera global/local

El sistema tiene dos niveles deliberadamente distintos:

| Nivel | Responsable | Responsabilidades | Fuera de su alcance |
| --- | --- | --- | --- |
| Control plane global | Hermes + HomeLab Meta-Harness | identificar repo, priorizar, coordinar trabajo inter-repo, evaluar riesgo global y producir `RepoHandoffRequest` | decidir detalles de capabilities o escribir directamente en sistemas de este repo |
| Front door local | `Skilland CRM Ops` | validar el handoff, resolver una capability registrada, aplicar política local, coordinar planificación y devolver un resultado estructurado | redirigir arbitrariamente otros repos o convertirse en control plane empresarial |

Por tanto, “una única puerta” significa una front door por repo detrás del
meta-harness global. Un humano o Codex puede seguir usando entrypoints legacy
durante la migración, pero esa compatibilidad no altera el ownership objetivo.

```text
Human / channel
        |
        v
Hermes + HomeLab Meta-Harness
  global repo routing, priority, cross-repo risk
        |
        | RepoHandoffRequest
        v
skilland-crm repo manifest
        |
        v
Skilland CRM Ops
  local capability routing and domain policy
        |
        +--> interaction adapters
        +--> application/use-case capabilities
        +--> domain kernels
        +--> integration workflows
        |
        v
deterministic policy enforcement and workers
        |
        +--> Twenty
        +--> AIKount
        +--> Gmail
        +--> allowlisted local filesystem
```

El `repo-manifest.json` es la interfaz de descubrimiento del repo. Declara la
front door disponible, el handoff provisional y el único entrypoint/capability
implementados sin habilitar production external writes.

## 4. Principios invariantes

1. **Capability before tool.** Se enruta por `capabilityId`, no por intuición
   sobre filenames, endpoints o scripts.
2. **Repo before capability.** HomeLab resuelve el repo antes de que CRM Ops
   aplique semántica local.
3. **Plan before external write.** Ninguna mutation nace de texto libre; debe
   existir un `OperationPlan` normalizado. Gate 007 permite plan nulo solo para
   read-only externo con un artefacto local create-only acotado.
4. **Policy before execution.** El worker recibe autoridad solo después de una
   comprobación determinista, inmediatamente antes del efecto.
5. **Dry-run by default.** `apply` es explícito y nunca se infiere de la
   intención conversacional.
6. **Metadata validates; registry authorizes.** Descubrir una API o un objeto
   no habilita su mutación.
7. **Domains remain separate.** CRM y AIKount conservan modelos, fuentes de
   verdad y efectos distintos.
8. **Cross-domain means correlated plans.** No se finge una transacción
   distribuida; cada frontera de escritura tiene su propio plan y resultado.
9. **Fail closed.** Capability, entorno, identidad, alcance o evidencia
   ambiguos bloquean `apply`.
10. **Compatibility is explicit and temporary.** Un entrypoint legacy se
    preserva mediante wrapper o alias hasta demostrar paridad; no se convierte
    por ello en owner objetivo.

## 5. Capas y responsabilidades

### 5.1 Interaction adapters

Traducen canales humanos o machine-to-machine al contrato local y presentan el
resultado. Incluyen el handoff provisional HomeLab/Hermes materializado en Gate
007, CLI, conversación supervisada y otros canales autorizados.

`CRM Conversation` pertenece aquí. Puede entrevistar, resolver ambigüedad,
explicar planes y presentar diffs, pero no posee lógica de mutación ni un write
path propio.

### 5.2 Application/use-case capabilities

Coordinan casos de uso de negocio: sales operations, manual review, campaign
operations, creación documental y reporting. Deciden qué resultado de negocio
se busca y componen planes mediante ports de dominio.

Una capability de aplicación no obtiene permiso implícito sobre infraestructura.
Su presencia en el registry define modos, riesgo, contratos y límites.

### 5.3 Domain kernels

Contienen reglas y vocabulario propios de una fuente de verdad:

- **CRM Core:** objetos, relaciones, actividades y mutaciones CRM allowlisted.
- **AIKount ERP:** contactos de facturación, presupuestos, facturas, series,
  impuestos, emisión y estado contable.

Los kernels no dependen de una conversación concreta ni conocen detalles de
Hermes. Exponen ports que permiten sustituir adaptadores sin reescribir reglas
de dominio.

### 5.4 Integration workflows

Coordinan dominios sin fusionarlos. El bridge CRM–AIKount lee contexto CRM,
prepara o ejecuta una operación AIKount mediante su port y, si procede, produce
un **nuevo** plan de write-back CRM. Comparte `correlationId`, no autoridad ni
transacción.

Campaign operations puede coordinar CRM y Gmail bajo la misma regla: la
vertical decide selección, contenido y estado de campaña; los adapters de Gmail
y CRM realizan sus efectos solo mediante planes autorizados.

### 5.5 Policy and observability

Es una capa transversal, no un pack de negocio:

- un Policy Decision Point determinista calcula la decisión desde registry,
  plan, entorno, riesgo y alcance;
- la aprobación humana se liga al hash inmutable del plan;
- un Policy Enforcement Point determinista revalida autorización y
  precondiciones justo antes de ejecutar;
- request, plan, approval y result comparten correlación y evidencia sin
  incluir secretos.

Los agentes pueden explicar la decisión; no pueden sustituirla.

### 5.6 Deterministic workers e infrastructure adapters

Solo esta capa puede producir side effects. Cada worker acepta operaciones
tipadas, scope limitado e idempotency key cuando proceda. Los adapters encapsulan
Twenty API, AIKount API, Gmail y filesystem allowlisted.

Un worker no interpreta intención de negocio y no amplía un plan. Si el target,
entorno o precondición difiere, devuelve un resultado bloqueado o fallido y
obliga a replanificar.

## 6. Ownership por área

| Área | Decide | Ejecuta en el futuro | Límite obligatorio |
| --- | --- | --- | --- |
| CRM genérico | CRM Core planner/use case | deterministic CRM worker vía Twenty adapter | allowlist por objeto + operación; metadata solo valida |
| CRM metadata administration | specialized metadata administration capability | dedicated metadata worker, solo si una gate futura lo habilita | separado de record CRUD; `denied` hasta una spec futura explícita |
| CRM Conversation | interaction adapter | ninguno | produce requests/planes; nunca escribe |
| Twenty Workflows | workflow application capability | workflow worker especializado | activation y blast radius separados de CRUD |
| AIKount | AIKount domain capability | deterministic AIKount worker | port extraíble; no write-back CRM directo |
| CRM–AIKount | integration workflow | workers de cada dominio en planes separados | correlación, idempotencia y partial failure explícitos |
| IA Mujeres | campaign application capability | CRM/Gmail workers | la vertical conserva política; no duplica adapters |
| Reporting | reporting capability | deterministic local artifact worker | read-only externo; `local_write` declarado por separado |

### CRM Core allowlisted y metadata-aware

CRM Core podrá leer metadata e introspección para validar nombres, tipos,
opciones, relaciones y operaciones disponibles. La habilitación proviene
exclusivamente del capability registry y de allowlists versionadas por objeto,
operación, entorno y scope.

En concreto:

- una mutation descubierta no se ejecuta automáticamente;
- objetos nuevos nacen read-only o `denied` hasta tener caso de uso, contrato y
  tests;
- delete, destroy, metadata writes y workflow activation permanecen `denied`
  durante los primeros gates;
- metadata administration y workflows conservan capabilities y workers
  especializados.

### AIKount separado y extraíble

AIKount permanece en este repo mientras la proximidad operativa aporte valor,
pero detrás de un port de dominio sin dependencias sobre tipos internos de CRM.
Esto permite extraerlo a otro repo o servicio sin cambiar el contrato de
integración. AIKount puede consumir un snapshot CRM read-only; nunca obtiene un
cliente CRM para escribir.

## 7. Flujo de una operación

```text
RepoHandoffRequest
  -> validate repo manifest and requester context
  -> resolve canonical capabilityId
  -> validate capability lifecycle/readiness/mode/environment
  -> validate the embedded OperationRequest and canonicalize its capabilityId
  -> planner produces normalized operations and preconditions as a PlanDraft
  -> policy deterministically derives risk and required approval tier
  -> plan finalizer freezes OperationPlan + policy/registry versions + planHash
  -> dry_run returns simulated OperationResult
  -> apply requires matching, scoped, non-expired OperationApproval
  -> enforcement point rechecks registry, hash, scope and preconditions
  -> deterministic worker executes exactly the authorized operations
  -> OperationResult records evidence, warnings, errors and next actions
```

Cada transición conserva `requestId` y `correlationId`. Los cuatro envelopes
(`OperationRequest`, `OperationPlan`, `OperationApproval`, `OperationResult`)
son contratos versionados; un cambio incompatible requiere nueva versión, no
interpretación tolerante durante un write.

El planner no elige `approvalTier`. El campo aparece dentro del
`OperationPlan.risk` porque el plan final e inmutable se materializa **después**
de la clasificación del PDP; así el hash cubre también la decisión de riesgo,
las versiones de policy/registry y cualquier cambio obliga a replanificar.

Gate 008 fija el hash normativo como SHA-256 de la concatenación UTF-8 del
domain separator `skilland-crm-ops/operation-plan/v1\n` y el JSON canónico del
`OperationPlan` omitiendo únicamente `planHash`. Las keys se ordenan por code
units UTF-16, los arrays preservan orden y valores fuera del subset JSON seguro
se rechazan. Los golden vectors de `policy.test.mjs` son evidencia runtime.

Un alias de capability solo resuelve al ID canónico. No puede tener contrato,
policy ni executor independientes.

Resolver un ID tampoco implica que sea públicamente invocable.
`routingExposure: internal` reserva helpers como validation, execution y
bridges para composición desde una capability pública ya autorizada. Además,
`frontDoorReadiness` debe permitir el modo en la gate vigente; la readiness
legacy y un entrypoint directo nunca satisfacen esa comprobación.

## 8. Side-effect boundary

Un agente interpreta, pregunta, propone, compara y explica. Un agente **nunca**
es la frontera de efectos, aunque su nombre contenga `execution-agent` u
`operator`.

La autoridad efectiva pertenece a la combinación:

```text
registered capability
+ immutable plan
+ computed policy
+ matching approval
+ valid preconditions
+ deterministic enforcement
= one bounded worker invocation
```

La aprobación no autoriza “hacer lo necesario”. Autoriza un `planHash`, un
scope, un entorno y una ventana temporal. Cualquier cambio invalida la
aprobación. Los workers no aceptan tokens o secretos dentro del envelope; los
obtienen por configuración segura del adapter.

## 9. Fallos y consistencia

- Un lookup ambiguo bloquea; no se elige el primer resultado.
- Un schema o registry desconocido bloquea `apply`.
- El cambio de metadata entre plan y apply invalida las precondiciones.
- Un retry automático solo existe si el worker demuestra idempotencia para esa
  operación y reutiliza la misma key.
- Una operación cross-domain registra resultados parciales por dominio. No
  ejecuta write-back de compensación implícito.
- Si un efecto es compensatable, el resultado puede proponer un plan de
  compensación nuevo; nunca lo aplica automáticamente.
- La pérdida de observabilidad no se considera éxito. El worker debe producir
  evidencia suficiente o devolver `failed`/`partial_failure` con una issue de
  outcome desconocido y reconciliación manual.

## 10. Compatibilidad y migración

Los entrypoints actuales siguen siendo interfaces de compatibilidad hasta los
gates que los envuelvan o sustituyan:

- `yarn crm:execute`
- `yarn crm:review`
- `yarn crm:export`
- `yarn crm:aikount`
- `node scripts/ia_mujeres_operator_harness.mjs --action=...`

No se renombra ni retira un entrypoint por documentación. La deprecación exige
contrato equivalente, tests de paridad, telemetría suficiente, periodo de
compatibilidad y un fallback documentado. El orden completo está en
[`migration-roadmap.md`](migration-roadmap.md).

## 11. Decisiones relacionadas

- [ADR-001 — Global control plane y local front door](decisions/ADR-001_global-control-plane-and-local-front-door.md)
- [ADR-002 — Agents plan; deterministic workers execute](decisions/ADR-002_agents-plan-deterministic-workers-execute.md)
- [ADR-003 — CRM Core metadata-aware y allowlisted](decisions/ADR-003_allowlisted-metadata-aware-crm-core.md)
- [ADR-004 — Riesgo multidimensional y aprobación ligada al plan](decisions/ADR-004_multidimensional-risk-and-plan-bound-approval.md)
- [ADR-005 — Límites de dominio, integración y adapters](decisions/ADR-005_domain-integration-and-adapter-boundaries.md)

## 12. Criterios de aceptación arquitectónica

La fundación queda aceptada cuando:

- ninguna fuente canónica presenta `Skilland CRM Ops` como control plane
  global;
- manifest, registry y contracts distinguen estado planificado de runtime
  verificado;
- una capability solo se habilita mediante registry, no por introspección;
- todo side effect objetivo termina en policy enforcement y worker
  deterministas;
- riesgo y aprobación son multidimensionales y fail-closed;
- CRM, AIKount, campañas, workflows, integración e infraestructura tienen
  ownership inequívoco;
- el roadmap obliga a demostrar un vertical slice read-only antes de habilitar
  CRM writes nuevos;
- los entrypoints legacy conservan compatibilidad explícita; el export puede
  endurecerse sin volver a admitir resultados parciales o overwrite.

## 13. Fuentes y evidencia

- `04_outputs/crm_agents_overhaul_audit/2026-07-06_crm_agents_overhaul_audit.md`
- `03_specs/now/005_skilland_ops_phase0_canonical_docs.md`
- `shared/knowledge/skilland-ops/target-architecture.md`
- `shared/contracts/skilland-crm-ops/repo-manifest.json`
- `shared/contracts/skilland-crm-ops/capability-registry.json`
- `shared/contracts/skilland-crm-ops/operation-envelope.schema.json`
- `shared/contracts/skilland-crm-ops/repo-handoff.schema.json`
- `scripts/skilland_crm_ops/`
- `scripts/skilland_crm_ops/policy/policy.test.mjs`
- `package.json` y entrypoints bajo `scripts/crm_*` e
  `scripts/ia_mujeres_*`, inspeccionados en Phase 0/0.5
- HomeLab commit `25cb94b2ed5482ca722cd76c8be71487ddba6aff`
- North Star commit `31c59d14b1802081e8e25026cff5d37a843db735`

Los commits externos fijan la doctrina cross-repo revisada; los schemas y el
registry activos gobiernan shapes y habilitación. El kernel Gate 008 tiene
evidencia runtime offline, mientras los workers reales y la durabilidad siguen
siendo target state.

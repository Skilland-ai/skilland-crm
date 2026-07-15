# 006 — Skilland CRM Ops Phase 0.5 Architecture Foundation

- Status: completed
- Date: 2026-07-13
- Completed: 2026-07-13
- Owner: Skilland CRM Ops architecture
- Implementer target: architecture foundation implementation session
- Canonical for: alcance y gate de Phase 0.5
- Last verified: 2026-07-13
- Supersedes: 005_skilland_ops_phase0_canonical_docs.md
- Superseded by: none
- Closure report:
  04_outputs/skilland_crm_ops_architecture/2026-07-13_phase0_5_implementation_report_v1.md

## 1. Objetivo

Crear la fuente de verdad arquitectónica y contractual del subharness
operativo de skilland-crm, preparada para ser descubierta por Hermes/HomeLab y
consumida posteriormente por un router local.

Phase 0.5 debe:

- sustituir el concepto global ambiguo Skilland Ops Orchestrator por Skilland
  CRM Ops, una front door exclusivamente local al repo;
- fijar el boundary entre el control plane global y el routing local;
- definir contratos versionados para request, plan, approval y result;
- separar agentes decisores de policy enforcement y workers deterministas;
- sustituir un safety profile único por riesgo multidimensional;
- convertir el catálogo Markdown en proyección humana de un registry JSON;
- establecer precedencia, lifecycle, frescura y supersesión del conocimiento;
- preservar trazabilidad con Phase 0 y compatibilidad con entrypoints legacy;
- dejar un gate inequívoco para Phase 1 sin cambiar runtime.

La entrega es documental y machine-readable. No implementa todavía Skilland
CRM Ops.

## 2. Corrección arquitectónica que motiva la spec

Phase 0 acertó al proponer una superficie semántica única y kernels separados,
pero trató esa superficie como puerta para humanos, Codex y Hermes sin
distinguir el nivel global del local. También asignó side effects a agentes,
mezcló varios ejes de riesgo en una etiqueta y apuntó hacia CRUD
metadata-driven sin una allowlist explícita.

Phase 0.5 fija la topología:

~~~text
Human / channel
    |
    v
Hermes + HomeLab Meta-Harness
    global repo routing, priority and cross-repo risk
    |
    v  RepoHandoffRequest
skilland-crm repo manifest
    |
    v
Skilland CRM Ops
    local capability routing and domain policy
    |
    +-- Interaction adapters
    +-- Application/use-case capabilities
    +-- Domain kernels
    +-- Integration workflows
    |
    v
Deterministic policy enforcement and workers
    |
    +-- Twenty
    +-- AIKount
    +-- Gmail
    +-- filesystem
~~~

Hermes/HomeLab puede seleccionar este repo y entregar una solicitud, pero no
posee las reglas internas del dominio. Skilland CRM Ops puede seleccionar una
capability dentro del repo, pero no es el control plane del Agentic OS.

## 3. Fuentes obligatorias y evidencia

El implementer debe inspeccionar, como mínimo:

### Repo local

- AGENTS.md
- 03_specs/now/005_skilland_ops_phase0_canonical_docs.md
- shared/knowledge/skilland-ops/target-architecture.md
- shared/knowledge/skilland-ops/capability-catalog.md
- 04_outputs/crm_agents_overhaul_audit/2026-07-06_crm_agents_overhaul_audit.md
- package.json
- scripts/crm_execution_crew/README.md, contracts, kernel y tests
- scripts/crm_aikount_ops/README.md, contracts, kernel y tests
- scripts/crm_manual_update_crew, su parser y tests
- agentes y skills de crm-execution-crew, crm-manual-update-crew, AIKount,
  IA Mujeres y Twenty Workflows
- shared/orchestration/ia-mujeres-crm-gws/2026-06-08_how_to_use.md

### Doctrina cross-repo fijada

- skilland-agentic-homelab en commit
  25cb94b2ed5482ca722cd76c8be71487ddba6aff
- skilland-agentic-north-star en commit
  31c59d14b1802081e8e25026cff5d37a843db735
- manifiesto MVP 1.0, semantic intersection, meta-harness learnings y workspace
  continuity de HomeLab en esos commits
- principios y doctrine aplicables de North Star en el commit fijado

No citar solo ramas mutables como main. El README del nuevo canon o el informe
de cierre debe registrar repo, path y commit SHA. Si una fuente falta, se anota
como unknown y se continúa únicamente cuando su ausencia no impida una
decisión requerida.

## 4. Alcance

### Incluido

- gobierno raíz del overlay y lifecycle de specs;
- arquitectura target y ADRs;
- modelo de seguridad, aprobación y failure semantics;
- knowledge governance;
- repo manifest;
- capability registry y proyección Markdown;
- JSON Schemas Draft 2020-12 para manifest, registry y operation envelope;
- instancias y ejemplos válidos;
- compatibilidad documental desde el path Phase 0;
- roadmap con gates 006–013;
- verificaciones locales y closure report.

### Fuera de alcance

- modificar package.json, scripts, kernels, harnesses, agentes o skills
  operativos;
- implementar router, policy engine, workers o adapters;
- cambiar, mover o retirar comandos y entrypoints actuales;
- mover specs 002–004 mientras scripts legacy escriban esas rutas;
- ejecutar CRM, AIKount, Gmail o workflows live;
- habilitar deletes, hard destroy, metadata mutations, workflow activation o
  external sends;
- añadir secretos o credenciales;
- realizar commit, push o publicación sin una instrucción separada.

Cambios de caché producidos por tests no mutantes son admisibles; cambios
tracked fuera de los entregables no lo son.

## 5. Decisiones obligatorias

### 5.1 Control planes

- Skilland CRM Ops es el nombre definitivo de la front door local.
- Hermes + HomeLab Meta-Harness mantiene routing y riesgo global.
- repo-manifest.json es la handoff surface machine-readable.
- El manifest declara localFrontDoor.status como planned. Ningún documento
  puede presentarla como runtime ya disponible.

### 5.2 Capas y ownership

- CRM Conversation es un interaction adapter; no posee writes.
- CRM Core es metadata-aware y capability-driven con allowlist por
  objeto/operación.
- Metadata administration y workflow automation son superficies distintas de
  record CRUD.
- IA Mujeres posee selección, copy, reglas y decisiones de campaña; Gmail y
  CRM son adapters de efectos.
- AIKount permanece en este repo en esta fase, como dominio independiente y
  detrás de un port extraíble.
- CRM–AIKount Bridge es un integration workflow. No otorga a un dominio permiso
  de mutar al otro.
- Reporting es read-only respecto a sistemas externos; escribir artefactos
  locales se declara como efecto local_write.

### 5.3 Side effects

- Los agentes interpretan, entrevistan, planifican, revisan y explican.
- La autoridad no pertenece a un agente executor.
- Solo policy enforcement y workers deterministas podrán ejecutar side effects
  en la arquitectura target.
- Toda operación apply futura debe verificar capability, environment,
  workspace, planHash, approval, scopeLimits, expiresAt e idempotencyKey cuando
  corresponda.

### 5.4 Metadata y habilitación

- Descubrir un objeto, field o mutation en metadata no lo habilita.
- La metadata valida shape, tipos, relaciones y preconditions.
- La allowlist del registry autoriza capability, modos y entornos.
- Todo lo no registrado o no habilitado falla cerrado.
- Generic CRUD universal, destructive operations, metadata writes y workflow
  activation no forman parte de Phase 0.5.

## 6. Entregables de gobierno

### 6.1 AGENTS.md raíz

Debe establecer:

- identidad Twenty upstream + Skilland operational overlay;
- orden de lectura canónico;
- boundary HomeLab global / CRM Ops local;
- distinción entre target y realidad de runtime;
- no-write-by-default, dry-run y fail-closed;
- modelo de riesgo multidimensional;
- no secrets, no direct DB writes y no bypass de adapters;
- fallback sin degradación silenciosa a scripts legacy;
- status de specs como autoridad durante la transición.

### 6.2 03_specs/README.md

Debe definir:

- statuses draft, ready_for_implementation, in_progress, completed, blocked y
  superseded;
- transiciones y evidencia necesaria para completar;
- una sola spec del programa in_progress;
- 002–004 completed pero retenidas en now porque scripts legacy escriben rutas
  exactas;
- 005 superseded por 006;
- 006 solo transiciona de in_progress a completed tras superar todo este gate.

### 6.3 Transición de 005

La spec 005 debe cambiar a superseded, apuntar a 006 y conservar su contenido
histórico. No se debe reescribir para hacer parecer que ya incluía las
decisiones de Phase 0.5.

## 7. Entregables de conocimiento

Crear shared/knowledge/skilland-crm-ops/ con:

- README.md: mapa de fuentes, canon y orden de lectura.
- target-architecture.md: topology global/local, capas, ownership y data flow.
- safety-and-approval-model.md: riesgo, autorización, enforcement, fallos,
  idempotencia y cross-domain consistency.
- capability-catalog.md: proyección humana del registry.
- knowledge-governance.md: metadata, precedencia, lifecycle, evidencia,
  frescura y excepciones legacy.
- migration-roadmap.md: gates 006–013 y condiciones de entrada/salida.
- decisions/ADR-001_global-control-plane-and-local-front-door.md
- decisions/ADR-002_agents-plan-deterministic-workers-execute.md
- decisions/ADR-003_allowlisted-metadata-aware-crm-core.md
- decisions/ADR-004_multidimensional-risk-and-plan-bound-approval.md
- decisions/ADR-005_domain-integration-and-adapter-boundaries.md

Todos los documentos canónicos deben declarar Status, Owner, Canonical for,
Last verified, Supersedes y Superseded by.

Crear shared/knowledge/skilland-ops/README.md como compatibility pointer. Los
dos documentos Phase 0 se conservan como evidencia histórica, pero el pointer
debe advertir que no son canon y dirigir toda decisión nueva al nuevo path.
No pueden quedar dos arquitecturas activas.

## 8. Contratos machine-readable

Crear shared/contracts/skilland-crm-ops/ con JSON Draft 2020-12:

- repo-manifest.schema.json
- capability-registry.schema.json
- operation-envelope.schema.json
- repo-manifest.json
- capability-registry.json

Los $id deben ser estables, los $ref locales deben resolver sin network access
y las instancias deben validar contra sus schemas.

### 8.1 Repo manifest

repo-manifest.json debe declarar al menos:

- schemaVersion
- repoId
- displayName
- role
- scope
- globalControlPlane
- localFrontDoor
- domains
- sensitivity
- supportedModes
- entrypoints
- capabilityRegistry
- canonicalKnowledge
- operability
- outputs
- fallbackPolicy

Invariantes:

- repoId es estable y no depende del path de una máquina;
- globalControlPlane identifica Hermes/HomeLab;
- localFrontDoor identifica Skilland CRM Ops y status planned;
- entrypoints actuales declaran `surfaceRole: compatibility`, aunque su estado
  operativo sea current o legacy; no se presentan como nueva front door;
- canonicalKnowledge apunta únicamente al path skilland-crm-ops;
- fallbackPolicy es fail_closed y prohíbe direct API improvisado.

### 8.2 Capability registry

Cada capability canónica debe incluir:

- id
- domain
- ownerComponent
- lifecycleStatus
- semanticMaturity
- runtimeReadiness
- frontDoorReadiness
- routingExposure
- testLevel
- evidence
- supportedModes
- effects
- domainSpan
- dataClasses
- reversibility
- approvalTier
- environmentAllowlist
- scopeLimits
- currentEntrypoints
- inputContract
- outputContract
- lastVerifiedAt
- aliases
- deprecatedBy
- notes

Los 39 IDs heredados de Phase 0 deben poder resolverse exactamente una vez,
como capability canónica o alias:

1. crm.metadata.read
2. crm.schema.introspect
3. crm.record.search
4. crm.record.get
5. crm.record.create
6. crm.record.update
7. crm.record.delete
8. crm.record.restore
9. crm.record.destroy
10. crm.relation.link
11. crm.relation.unlink
12. crm.activity.note.create
13. crm.activity.task.create
14. crm.activity.task.update
15. crm.metadata.field.create
16. crm.metadata.view.manage
17. crm.workflow.research
18. crm.workflow.design
19. crm.workflow.implement
20. crm.workflow.test
21. crm.plan.validate
22. crm.execution.apply
23. crm.conversation.manual_review
24. crm.export.chatgpt
25. aikount.openapi.live
26. aikount.document.interview
27. aikount.operation.plan
28. aikount.execution.apply
29. aikount.file_container.manage
30. bridge.crm_aikount.context
31. bridge.crm_aikount.writeback.plan
32. campaign.ia_mujeres.status
33. campaign.ia_mujeres.batch.prepare
34. campaign.ia_mujeres.drafts.create
35. campaign.ia_mujeres.batch.send
36. campaign.ia_mujeres.signals.sync
37. campaign.ia_mujeres.tasks.reconcile
38. campaign.ia_mujeres.weekly_report
39. report.crm.export

crm.export.chatgpt se resuelve solo como alias dentro de
report.crm.export.aliases. No tiene owner, executor, evidence o contract
independientes.

No usar stable como resumen ambiguo. Separar implementation state, semantic
maturity, runtime readiness y test level. Una capability sin evidencia fechada
debe usar unknown; nunca elevarse por intuición.

`runtimeReadiness` describe el runtime current/legacy inspeccionado;
`frontDoorReadiness` describe disponibilidad real detrás de la front door en la
gate vigente. `supportedModes`, effects y approvalTier son policy target. Un
legacy script puede ser `apply_guarded` mientras la capability permanece
`frontDoorReadiness: denied`; documentar esa tensión es obligatorio y nunca
convierte el script en fallback. `routingExposure: internal` mantiene el ID
resoluble para composición sin aceptar un handoff público directo.

### 8.3 Operation envelope

operation-envelope.schema.json debe exponer definiciones para:

- OperationRequest
- OperationPlan
- OperationApproval
- OperationResult

Campos comunes mínimos:

- schemaVersion
- kind
- requestId
- correlationId
- repoId
- capabilityId
- requester
- environment
- mode
- timestamps

OperationPlan añade:

- planId
- planHash
- registryVersion y policyVersion
- operations normalizadas
- preconditions estructuradas con source, observación, vigencia y
  version/hash esperado cuando exista
- riesgo calculado
- scopeLimits
- expiresAt
- idempotencyKey cuando la capability admita retry o apply

OperationApproval añade:

- approvalId
- planId
- approvedPlanHash
- approver
- approvalTier
- allowedScope
- expiresAt
- decision

OperationResult añade:

- status
- effectiveMode
- planHash, registryVersion, policyVersion y policyDecision
- approvalIds y workerVersion
- operaciones ejecutadas, simuladas o bloqueadas
- evidence
- warnings
- errors
- partial-failure information
- nextActions

Invariantes:

- apply exige capability habilitada, plan vigente y approvedPlanHash idéntico
  a planHash;
- cualquier cambio del plan invalida la aprobación;
- aprobación expirada, denegada o de alcance inferior bloquea;
- ausencia de scopeLimits bloquea apply;
- los límites deben poder expresar IDs/resources/fields, documentos,
  recipients/sender, amount/currency, workflows y paths/overwrite/tamaño local
  según el efecto;
- requester y approver se registran como identidad y canal, nunca como secreto;
- secrets y tokens están prohibidos en envelopes y logs;
- un cross-domain flow no implica transacción distribuida;
- cada CRM write-back posterior a AIKount usa un plan y aprobación separados;
- automatic retries con side effects exigen idempotencia demostrada.

Phase 0.5 codifica en JSON Schema todos los invariantes estructurales
expresables. Igualdad/containment entre documentos o colecciones —plan hash y
approval, unión de operation effects y risk effects, IDs de partial failure,
scope containment y policy drift— quedan definidos normativamente aquí y se
implementan como validator determinista con tests adversariales en Gate 008.
Los ejemplos no deben presentarlos como enforcement runtime ya disponible.

### 8.4 Ejemplos contractuales

Crear y validar:

- examples/report-crm-export-request.json
- examples/manual-review-dry-run-plan.json
- examples/plan-bound-approval.json
- examples/success-result.json
- examples/blocked-result.json
- examples/partial-cross-domain-result.json

Los ejemplos deben cubrir read-only, dry-run, aprobación válida, éxito, bloqueo
fail-closed y partial failure con evidencia por operación. No incluir IDs,
emails, tokens o datos reales del CRM.

## 9. Modelo de riesgo inicial

El registry y los planes deben expresar ejes independientes:

| Dimensión | Valores iniciales |
| --- | --- |
| effects | local_write, crm_write, erp_write, metadata_write, workflow_change, external_draft, external_send, destructive |
| domainSpan | single_domain, cross_domain |
| dataClasses | internal, commercial, pii, accounting |
| reversibility | reversible, compensatable, irreversible |
| approvalTier | none, operator, owner, two_stage, denied |
| environment | test, sandbox, production |

Política Phase 0.5:

- read_only y dry_run pueden planificarse sin aprobación de apply;
- todo write futuro en production requiere aprobación humana ligada al plan;
- external_send, accounting effects y CRM write-back cross-domain requieren
  two_stage;
- destructive, metadata_write y workflow activation permanecen denied;
- campos desconocidos, capability no registrada, environment ambiguo,
  scopeLimits ausentes o evidencia insuficiente bloquean.

Esta política es target documentation. No habilita ningún write ni sustituye
las gates de entrypoints legacy.

## 10. Gobierno del conocimiento

knowledge-governance.md debe fijar:

- metadata obligatoria de documentos canónicos;
- lifecycle proposed, accepted, active, superseded y archived;
- precedencia separada para runtime state, contracts, target architecture,
  procedure, historical evidence y specs;
- last verified, fuentes y evidence links;
- regla de unknown ante evidencia ausente o caducada;
- supersedes/superseded by sin borrar historia;
- excepción física 002–004;
- política de conflicto: no usar una precedencia universal para confundir
  realidad actual con intención target.

El Markdown capability catalog es una proyección humana. El JSON registry es la
fuente machine-readable. Ambos deben pasar un control de paridad en esta fase;
un cambio futuro al registry debe regenerar o actualizar la proyección en el
mismo change set.

## 11. Programa posterior por gates

Phase 0.5 documenta, pero no implementa, esta secuencia:

1. 006 — Architecture Foundation.
2. 007 — Thin Local Router solo read_only y dry_run; primer vertical slice
   Hermes/HomeLab → manifest → report.crm.export → structured result.
3. 008 — Deterministic Policy and Approval Kernel.
4. 009 — Allowlisted CRM Core empezando por notes, tasks y updates concretos
   de Opportunity.
5. 010 — Unify CRM Writes para manual review e IA Mujeres.
6. 011 — CRM–AIKount Integration con planes separados.
7. 012 — Automation and External Effects.
8. 013 — Controlled Deprecation de wrappers y legacy.

No redactar una spec posterior como autorización de ejecución. Cada gate se
detalla después de verificar el anterior. El siguiente gate tras 006 es 007,
no generic CRM Core.

## 12. Orden de implementación

1. Inventariar fuentes locales y commits cross-repo.
2. Crear esta spec y marcar 005 como superseded.
3. Crear AGENTS.md y gobierno de specs.
4. Redactar ADRs y arquitectura target.
5. Redactar seguridad, approval y failure model.
6. Crear schemas, manifest, registry y ejemplos.
7. Crear la proyección Markdown del registry y comprobar paridad.
8. Crear knowledge governance y migration roadmap.
9. Añadir compatibility pointer en el path Phase 0.
10. Ejecutar checks y tests sin llamadas live.
11. Emitir el closure report.
12. Marcar 006 completed únicamente si todos los criterios pasan.

## 13. Verificación

Ejecutar como mínimo:

    git diff --check

    node --test \
      scripts/crm_execution_crew/crm-execution-crew.test.mjs \
      scripts/crm_manual_update_crew/parser.test.mjs \
      scripts/crm_aikount_ops/crm-aikount-ops.test.mjs

Además:

- parsear todo JSON nuevo;
- validar repo-manifest.json y capability-registry.json contra sus schemas;
- validar los seis ejemplos contra la definición correcta del envelope;
- resolver todos los $schema, $id y $ref locales sin network access;
- comprobar que los 39 IDs se resuelven exactamente una vez;
- comprobar que crm.export.chatgpt solo es alias;
- comprobar que toda capability incluye status, evidence, modos, efectos,
  riesgo y readiness;
- comprobar que ningún alias define executor o contrato independiente;
- buscar y bloquear claims de Skilland CRM Ops como control plane global;
- buscar y bloquear autorización automática derivada de metadata;
- comprobar destructive, metadata_write y workflow activation como denied;
- confirmar que package.json, scripts y runtime tracked no cambiaron;
- confirmar que no hubo llamadas live ni mutaciones externas.

Los tests históricos deben seguir dando 31 pass. Si el número cambia por el
estado base, el informe debe registrar total, fallos y causa; no se puede
declarar completed con regresiones introducidas por esta fase.

## 14. Closure report

Crear:

    04_outputs/skilland_crm_ops_architecture/
      2026-07-13_phase0_5_implementation_report_v1.md

El informe debe listar:

- archivos creados y modificados;
- fuentes locales y commits externos consultados;
- ADRs aceptados;
- decisiones de clasificación relevantes;
- unknowns y evidencia ausente;
- verificaciones y resultados exactos;
- confirmación de no runtime changes y no live calls;
- trabajo diferido a 007–013;
- cualquier desviación respecto a esta spec.

## 15. Acceptance criteria

La spec solo puede pasar a completed cuando:

- existe una única arquitectura canónica bajo
  shared/knowledge/skilland-crm-ops/;
- el path anterior advierte de su supersesión y apunta al canon;
- el boundary HomeLab global / CRM local es inequívoco;
- AGENTS.md permite a un agente nuevo encontrar front door, canon y reglas;
- 005 está superseded sin pérdida de historia;
- el status gobierna specs y la excepción 002–004 está documentada;
- manifest, registry y envelope son machine-readable y versionados;
- schemas, instancias y ejemplos validan;
- el manifest declara Skilland CRM Ops planned;
- los 39 capability IDs se resuelven, con un único alias para el export;
- el catálogo separa implementación, madurez, readiness, tests y evidencia;
- el safety model es multidimensional y fail-closed;
- la aprobación está ligada al hash de un plan y a scope/expiry;
- los agentes no poseen autoridad intrínseca de side effects;
- CRM Core queda allowlisted, no universal;
- AIKount, campañas, workflows, reporting y adapters tienen ownership claro;
- destructive, metadata writes y workflow activation siguen denied;
- roadmap fija 007 como siguiente gate;
- tests actuales pasan y no hay runtime changes;
- el closure report contiene evidencia suficiente.

Si cualquier criterio falla, mantener Status: in_progress o usar blocked solo
cuando exista un bloqueo real según 03_specs/README.md.

## 16. Supuestos fijados

- Narrativa en español; identifiers, schemas, comandos y nombres técnicos en
  inglés.
- Skilland CRM Ops es el nombre local definitivo.
- Hermes/HomeLab conserva responsabilidad global.
- Los documentos Phase 0 sin commit siguen siendo inputs históricos, no canon
  aprobado.
- Ausencia de evidencia se representa como unknown.
- AIKount permanece en este repo por ahora detrás de una frontera extraíble.
- Las specs legacy no se mueven hasta retirar consumidores runtime.
- No se crea código de generación o runtime en Phase 0.5.
- Otra fase implementará 007; esta spec no autoriza avanzar directamente a
  CRM Core genérico.

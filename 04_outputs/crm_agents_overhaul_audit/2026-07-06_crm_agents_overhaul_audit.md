# CRM Agents And Skills Overhaul Audit

Fecha: 2026-07-06

## Resumen ejecutivo

La decision estrategica recomendada es: una sola puerta operativa para usuarios
humanos, Codex y Hermes iAgent, pero no un unico kernel monolitico.

La arquitectura objetivo debe separar:

- orquestacion conversacional y routing;
- kernel CRM/Twenty;
- pack ERP AIKount;
- bridge CRM <-> AIKount;
- packs verticales como IA Mujeres;
- workflows Twenty como capacidad CRM especializada;
- safety/review/auditoria como contrato transversal.

AIKount no debe meterse dentro del core CRM. Debe seguir siendo una capacidad
ERP separada, con su propio planificador, preflight OpenAPI, registry y safety,
pero invocable desde la puerta operativa unica mediante un bridge formal.

## Estado actual observado

### Entrypoints runtime

Actualmente hay varias puertas paralelas:

- `yarn crm:execute` -> `scripts/crm_execution_crew/harness.mjs`
- `yarn crm:review` -> `scripts/crm_manual_update_crew/harness.mjs`
- `yarn crm:export` -> `scripts/crm_manual_update_crew/export-para-chatgpt.mjs`
- `yarn crm:aikount` -> `scripts/crm_aikount_ops/harness.mjs`
- `node scripts/ia_mujeres_operator_harness.mjs --action=...`
- scripts puntuales historicos de import, smoke test, workflows y updates.

### Inventario de specs y runtime

Conteo local:

- 23 specs de agentes en `shared/agents/**/AGENT.md`
- 22 specs de skills en `shared/skills/**/SKILL.md`
- 11 agentes runtime en `scripts/**/agents/*.mjs`
- 10 skills runtime en `scripts/**/skills/*.mjs`

Esto no es malo por si mismo, pero ahora mismo no hay un catalogo central que
publique todas esas capacidades a una unica puerta operativa.

### Estado de tests locales

Se ejecutaron tests unitarios aislados:

```bash
node --test scripts/crm_execution_crew/crm-execution-crew.test.mjs scripts/crm_manual_update_crew/parser.test.mjs scripts/crm_aikount_ops/crm-aikount-ops.test.mjs
```

Resultado:

- 31 tests
- 31 pass
- 0 fail

La base actual es aprovechable. El problema principal es arquitectonico, no que
todo este roto.

## Hallazgos principales

### 1. Hay una aspiracion horizontal, pero el kernel CRM v1 es limitado

`scripts/crm_execution_crew` se documenta como capa horizontal de ejecucion CRM,
pero su contrato actual soporta solo:

- `create_opportunity`
- `update_opportunity`
- `update_task`
- `create_note`
- `create_task`
- `close_task`
- `delete_record` bloqueado
- `metadata_change` bloqueado

Ademas:

- el planner bloquea peticiones solo en lenguaje natural;
- la metadata validation esta centrada en `opportunity` y `task`;
- el resolver indexa `opportunities`, `people`, `companies` y `tasks`;
- el executor tiene mutaciones hardcodeadas para `createOpportunity`,
  `updateOpportunity`, `updateTask`, `/notes`, `/tasks`, `/noteTargets` y
  `/taskTargets`.

Conclusion: no es todavia un CRUD completo de todas las entidades Twenty.

### 2. `crm_manual_update_crew` duplica capacidades de escritura CRM

El manual update crew implementa otra via para:

- actualizar oportunidades;
- crear notas;
- crear tareas;
- cerrar tareas;
- enlazar notas/tareas a deals.

Esto duplica parte de `crm_execution_crew` con otro contrato, otro parser y otro
executor. A corto plazo ha sido util, pero a largo plazo crea dos fuentes de
verdad para escrituras CRM.

### 3. IA Mujeres tiene logica valiosa pero escribe CRM directamente

IA Mujeres combina:

- setup de campos y vistas por Metadata API;
- seleccion de tandas;
- generacion de drafts/payloads;
- Gmail draft/send;
- sync de replies/bounces;
- updates CRM;
- notas/tareas;
- reconciliacion de tareas;
- reportes.

Esa logica vertical debe mantenerse, pero las mutaciones CRM estandar deberian
emitirse hacia el CRM core, no vivir como escrituras ad hoc en runners de
campana.

### 4. AIKount ya esta mejor separado por dominio

AIKount tiene:

- contrato `AikountActionRequest`;
- preflight OpenAPI live;
- document interview;
- contact resolver;
- planner;
- reviewer;
- executor;
- registry;
- file container;
- contexto CRM read-only.

Ese aislamiento es correcto porque AIKount es ERP contable, no CRM. Lo que
falta es formalizarlo como pack invocable por una puerta superior y definir el
write-back al CRM como un bridge con contrato.

### 5. Twenty workflows esta bien pensado como capability team, pero aislado

La documentacion de `shared/knowledge/twenty-workflows` corrige supuestos
anteriores: workflow authoring no es necesariamente UI-first. Hay un camino API
con `createWorkflow`, draft version, step/edge mutations, posiciones y
activacion controlada.

Pero hoy esa capacidad no esta integrada en la puerta CRM general. El CRM
Execution Crew v1 simplemente bloquea workflows como out-of-scope y deriva a
otro capability team.

### 6. "Agentic" no significa aun subagentes inteligentes runtime

Los agentes runtime actuales son wrappers deterministas que llaman skills y
kernels. Eso es bueno para auditabilidad, pero la documentacion puede crear una
expectativa equivocada: no existe todavia un router natural-language -> plan
generico -> executor completo.

El sistema sigue dependiendo de contratos estructurados o parsers concretos.

### 7. Falta un catalogo de capacidades

El problema raiz es que no hay una tabla central del estilo:

- dominio;
- capability id;
- input contract;
- output contract;
- modo read/dry-run/apply;
- safety profile;
- owner pack;
- comandos runtime;
- si esta soportada, parcial, bloqueada o historica.

Sin ese catalogo, Codex/Hermes tiene que descubrir scripts por nombre y acaba
improvisando.

## Arquitectura objetivo

### Principio base

Una unica puerta operativa. Multiples packs de dominio.

```text
Usuario / Codex / Hermes iAgent
        |
        v
Skilland Ops Orchestrator
        |
        +-- CRM Core Pack
        +-- CRM Conversation Pack
        +-- Twenty Workflows Pack
        +-- AIKount ERP Pack
        +-- CRM-AIKount Bridge Pack
        +-- IA Mujeres Campaign Pack
        +-- Export / Reporting Pack
```

### Puerta unica propuesta

Nombre sugerido:

- agente: `skilland-ops-orchestrator`
- comando futuro: `yarn skilland:ops`
- runtime futuro: `scripts/skilland_ops/harness.mjs`

Responsabilidad:

- entender peticiones en lenguaje natural;
- clasificar dominio;
- consultar el capability catalog;
- convertir la peticion a uno o varios requests estructurados;
- pedir aclaraciones si falta informacion;
- ejecutar dry-run por defecto;
- delegar a packs;
- consolidar logs y resumen;
- no escribir nunca directamente en CRM, AIKount o Gmail.

### Packs de dominio

#### CRM Core Pack

Debe ser el unico boundary para writes CRM genericos.

Capacidades objetivo:

- metadata read: listar objetos, campos, tipos, opciones y relaciones;
- schema/introspection: derivar operaciones GraphQL disponibles;
- record query: find/get/list/aggregate cuando aplique;
- record CRUD generico: create/update/delete/restore/destroy cuando la API lo
  soporte;
- activity helpers: notes, tasks, noteTargets, taskTargets;
- relation helpers: link/unlink relaciones;
- metadata mutations: custom fields, views, filters y groups bajo safety fuerte;
- workflow authoring/execution mediante el Twenty Workflows Pack;
- audit log unico.

El punto importante: el CRUD no debe codificarse por `opportunity` y `task`.
Debe usar metadata/introspection para cualquier objeto soportado por Twenty.

#### CRM Conversation Pack

Debe absorber lo util de `crm_manual_update_crew`:

- review deal-by-deal;
- parser rapido de comandos comerciales;
- entrevistas;
- batch review;
- export read-only;
- generacion de planes CRM.

Pero no debe ejecutar writes directamente. Debe emitir operaciones hacia CRM
Core.

#### Twenty Workflows Pack

Debe pasar de "equipo separado" a pack dentro de la puerta unica, con gating
propio:

- research;
- design;
- safety;
- implementation;
- QA/smoke test.

Workflows no deben mezclarse con record CRUD simple porque tienen otro perfil
de riesgo: triggers, blast radius, activacion, runs, side effects.

#### AIKount ERP Pack

Debe conservar separacion propia:

- OpenAPI live;
- taxes/numbering;
- contacts;
- quotes;
- invoices;
- issue/share/send;
- registry;
- file container;
- dry-run/apply/confirmation.

No debe convertirse en una subfuncion del CRM core.

#### CRM-AIKount Bridge Pack

Este pack es el puente formal.

Responsabilidades:

- leer deal/contexto CRM por CRM Core o por snapshot read-only;
- construir `AikountActionRequest`;
- ejecutar AIKount ERP Pack;
- proponer write-back CRM como `CrmActionRequest` o contrato v2 equivalente;
- aplicar write-back solo a traves de CRM Core y tras confirmacion.

Ejemplos:

- "crea un presupuesto en AIKount para este deal";
- "convierte el presupuesto aceptado en factura y deja nota en el CRM";
- "registra estas facturas pendientes del contenedor y enlazalas al deal".

#### IA Mujeres Campaign Pack

Debe mantenerse como vertical pack, no como CRM core.

Responsabilidades:

- seleccion de batches;
- reglas de campana;
- Gmail draft/send;
- sync replies/bounces;
- reportes;
- reconciliacion especifica.

Pero:

- updates CRM, notas, tareas y campos deberian pasar por CRM Core;
- Gmail sigue siendo canal externo con safeguards propios;
- el estado comercial sigue en Twenty.

## Separacion agentes vs skills

### Agentes

Los agentes deben ser roles de decision/orquestacion, no sitios donde se
improvisa codigo.

Agentes recomendados:

- `skilland-ops-orchestrator`: puerta unica.
- `capability-router-agent`: clasifica dominio y selecciona capability.
- `crm-planner-agent`: convierte intencion CRM a operaciones CRM Core.
- `crm-safety-reviewer-agent`: gate para writes CRM.
- `crm-execution-agent`: unica frontera de side effects CRM.
- `workflow-specialist-agent`: gate especializado para workflows.
- `aikount-operator-agent`: dominio ERP.
- `crm-aikount-bridge-agent`: coordina lectura CRM, AIKount y write-back CRM.
- `campaign-ops-agent`: verticales como IA Mujeres.
- `audit-qa-agent`: verifica resultados y logs.

### Skills

Las skills deben ser capacidades llamables, con contratos estables.

Skills objetivo de CRM Core:

- `crm.metadata.read`
- `crm.schema.introspect`
- `crm.record.search`
- `crm.record.get`
- `crm.record.create`
- `crm.record.update`
- `crm.record.delete`
- `crm.record.restore`
- `crm.record.destroy`
- `crm.relation.link`
- `crm.relation.unlink`
- `crm.activity.note.create`
- `crm.activity.task.create`
- `crm.activity.task.update`
- `crm.metadata.field.create`
- `crm.metadata.view.manage`
- `crm.workflow.research`
- `crm.workflow.design`
- `crm.workflow.implement`
- `crm.workflow.test`
- `crm.plan.validate`
- `crm.execution.apply`

Skills objetivo cross-domain:

- `aikount.openapi.live`
- `aikount.document.interview`
- `aikount.operation.plan`
- `aikount.execution.apply`
- `bridge.crm_aikount.context`
- `bridge.crm_aikount.writeback.plan`
- `campaign.ia_mujeres.batch.prepare`
- `campaign.ia_mujeres.gmail.sync`
- `report.crm.export`

## Contrato comun recomendado

### CapabilityRequest

```json
{
  "requestId": "ops_...",
  "requester": "codex|hermes|user",
  "mode": "dry_run|apply",
  "domain": "crm|aikount|bridge|campaign|workflow|reporting",
  "capability": "crm.record.update",
  "intent": "texto humano original",
  "input": {},
  "constraints": {
    "requireHumanConfirmation": true,
    "maxRecords": 100,
    "allowCreate": true,
    "allowUpdate": true,
    "allowDelete": false,
    "allowExternalSend": false,
    "allowMetadataChanges": false
  }
}
```

### CapabilityResult

```json
{
  "requestId": "ops_...",
  "status": "planned|dry_run_completed|apply_completed|blocked|failed",
  "domain": "crm",
  "capability": "crm.record.update",
  "artifacts": [],
  "plan": {},
  "review": {},
  "executionResult": {},
  "warnings": [],
  "blockingIssues": [],
  "logPath": "04_outputs/..."
}
```

### CRM operation v2

El CRM core deberia aceptar operaciones genericas:

```json
{
  "id": "op_001",
  "objectNameSingular": "opportunity",
  "action": "create|read|update|delete|restore|destroy",
  "recordId": "optional",
  "filter": {},
  "data": {},
  "select": [],
  "relations": [],
  "safetyProfile": "read_only|standard_write|destructive|metadata|workflow"
}
```

La implementacion debe validar cada operacion contra:

- metadata live;
- GraphQL schema/introspection;
- permisos disponibles;
- constraints de request;
- max records;
- ambiguity resolver;
- dry-run/apply;
- confirmation.

## Reglas de safety objetivo

### Por defecto

- dry-run por defecto;
- apply explicito;
- confirmacion humana para writes no triviales;
- no direct DB writes;
- no secrets en logs;
- logs estructurados siempre.

### Destructivo

Deletes/restores/destroys deben existir como capacidades si la API los soporta,
pero no deben estar habilitados por defecto.

Requieren:

- objeto y record IDs exactos;
- dry-run con diff;
- confirmacion explicita;
- limite bajo de records;
- log de rollback cuando sea posible.

### Metadata

Custom fields, views, filters, groups y workflow changes requieren safety
profile separado. No deben pasar por el mismo gate que un update de campo en una
opportunity.

### External side effects

AIKount sends, Gmail sends y emails de reportes requieren confirmaciones
separadas. No deben activarse como side effect implicito de una peticion CRM.

## Plan de migracion recomendado

### Fase 0 - Congelar decisiones y catalogar

Objetivo: documentar arquitectura objetivo y no romper lo que esta verde.

Acciones:

- crear capability catalog inicial;
- mapear cada script actual a una capability;
- marcar cada capability como `stable`, `partial`, `legacy`, `blocked` o
  `candidate`;
- definir owner pack;
- mantener comandos actuales como compatibilidad.

### Fase 1 - CRM Core v2 metadata-driven

Objetivo: sustituir el executor hardcodeado por un core generico.

Acciones:

- construir snapshot metadata completo;
- crear introspector de operaciones GraphQL disponibles;
- generar helpers de create/update/delete por object name;
- soportar find/get/list generico;
- normalizar actividades y relaciones;
- mantener `crm_execution_crew` v1 como wrapper temporal.

### Fase 2 - Unificar writes CRM

Objetivo: que no haya escrituras CRM fuera del core.

Acciones:

- refactorizar `crm_manual_update_crew` para emitir CRM operation v2;
- refactorizar IA Mujeres para emitir CRM operation v2 para notes/tasks/updates;
- dejar en IA Mujeres solo seleccion, Gmail y logica de campana;
- conservar tests existentes y anadir regression tests de compatibilidad.

### Fase 3 - Puerta unica Skilland Ops

Objetivo: una entrada para Codex/Hermes/usuarios.

Acciones:

- crear `shared/agents/skilland-ops/orchestrator/AGENT.md`;
- crear `shared/skills/skilland-ops-router/SKILL.md`;
- crear `scripts/skilland_ops/harness.mjs`;
- implementar routing a CRM Core, AIKount, Bridge, IA Mujeres, Workflows y
  Reporting;
- publicar comandos alias.

### Fase 4 - Bridge CRM-AIKount formal

Objetivo: convertir lo ya existente en capacidad cross-domain auditable.

Acciones:

- mantener AIKount ERP Pack separado;
- exponer `bridge.crm_aikount.*`;
- definir write-back CRM como plan separado;
- anadir logs correlacionados entre AIKount session y CRM write-back session.

### Fase 5 - Workflows dentro del CRM ops surface

Objetivo: que el usuario no tenga que saber que existe `twenty-workflows`.

Acciones:

- integrar research/design/safety/implement/test como workflow pack;
- routear peticiones de automatizacion desde Skilland Ops;
- usar API-first segun knowledge actual;
- bloquear activaciones sin approval explicito.

### Fase 6 - Deprecacion controlada

Objetivo: eliminar confusion sin romper habitos existentes.

Acciones:

- mantener `crm:execute`, `crm:review`, `crm:aikount` como aliases;
- hacer que aliases llamen al nuevo router cuando sea seguro;
- marcar docs antiguas como legacy;
- mover scripts puntuales historicos a `scripts/legacy` solo cuando haya
  equivalentes en packs.

## Estructura futura sugerida

```text
shared/
  agents/
    skilland-ops/
      orchestrator/AGENT.md
      capability-router/AGENT.md
      audit-qa/AGENT.md
    crm-core/
    aikount-erp/
    crm-aikount-bridge/
    campaigns/
      ia-mujeres/
  skills/
    skilland-ops/
    crm-core/
    aikount-erp/
    crm-aikount-bridge/
    campaigns/
    reporting/
  knowledge/
    skilland-ops/
      capability-catalog.md
      safety-profiles.md
      routing-rules.md

scripts/
  skilland_ops/
    harness.mjs
    kernel/
      capability-registry.mjs
      router.mjs
      logger.mjs
  crm_core/
    kernel/
      metadata.mjs
      schema-introspection.mjs
      operation-planner.mjs
      executor.mjs
      reviewer.mjs
  aikount_erp/
  crm_aikount_bridge/
  campaigns/
    ia_mujeres/
```

## Recomendacion sobre AIKount

Decision: mantener AIKount como crew/pack propio y crear puente formal.

No se debe meter en el CRM core porque:

- es otra API;
- es otro dominio semantico;
- tiene otro modelo de riesgo;
- maneja contabilidad, impuestos, series, documentos y envios;
- tiene registry/idempotency propio;
- el CRM no debe ser fuente de verdad contable.

Pero tampoco debe seguir como entrada aislada sin relacion clara con CRM. Debe
ser invocable desde la puerta unica.

Regla propuesta:

- AIKount puede leer contexto CRM a traves del bridge.
- AIKount no escribe CRM directamente.
- Todo write-back CRM se convierte en plan CRM Core.

## Criterios de aceptacion del overhaul

El refactor estara bien hecho cuando:

- una peticion natural de usuario entra por una sola puerta;
- el router no busca scripts sueltos, consulta un capability catalog;
- todas las entidades CRM soportadas por la API son operables por contrato
  generico;
- no hay writes CRM fuera de CRM Core;
- AIKount sigue separado y bridgeado;
- IA Mujeres mantiene su logica vertical pero no duplica executor CRM;
- workflows estan routeados desde la puerta CRM/ops;
- dry-run/apply/confirmation/logging son consistentes;
- los comandos antiguos siguen funcionando o tienen aliases claros;
- hay tests para no-write-without-apply, metadata validation, destructive
  gates, bridge write-back y routing.

## Siguiente paso recomendado

Antes de tocar runtime, crear dos documentos canonicos:

1. `shared/knowledge/skilland-ops/capability-catalog.md`
2. `shared/knowledge/skilland-ops/target-architecture.md`

Despues, implementar Fase 1: `crm_core` metadata-driven, con wrappers de
compatibilidad para que `crm_execution_crew` y `crm_manual_update_crew` no se
rompan durante la migracion.

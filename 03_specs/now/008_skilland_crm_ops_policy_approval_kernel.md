# 008 — Skilland CRM Ops Policy and Approval Kernel

- Status: completed
- Date: 2026-07-13
- Owner: Skilland CRM Ops architecture
- Implementer target: Gate 008 implementation session
- Canonical for: hashing, policy decision, approval, enforcement e idempotencia de Skilland CRM Ops
- Last verified: 2026-07-13
- Supersedes: none
- Superseded by: none
- Depends on: 007_skilland_crm_ops_thin_local_router.md
- Closure report:
  04_outputs/skilland_crm_ops_policy/2026-07-13_gate008_implementation_report_v1.md

## 1. Objetivo

Implementar el kernel determinista que gobernará futuros workers con side
effects, sin habilitar todavía ninguna mutation ni ampliar la disponibilidad
de Gate 007:

~~~text
typed PlanDraft
  -> deterministic PDP + derived risk
  -> immutable OperationPlan + canonical planHash
  -> structured human OperationApproval
  -> PEP revalidation + idempotency reservation
  -> static allowlisted worker
  -> validated OperationResult
~~~

Gate 008 demuestra la frontera de autoridad con workers fake y stores en
memoria. El registry real conserva `report.crm.export/read_only/test` como
único vertical disponible; no se promociona ninguna capability a
`apply_guarded` y el mapa de workers real permanece vacío.

## 2. Decisiones de alcance

### 2.1 Kernel real, writes reales denegados

El PDP, PEP, hashing y store son runtime reutilizable, no pseudocódigo. Sin
embargo, los tests de ejecución usan workers inyectados que no acceden a red,
CRM, AIKount, Gmail, DB ni outputs del repo. Gate 009 será el propietario del
primer worker CRM real y de cualquier promoción de readiness.

### 2.2 Handoff y router

El contrato inbound sigue siendo `RepoHandoffRequest` v0.1 provisional/local.
Gate 008 no inventa el contrato global HomeLab ni modifica otros repos. El
router read-only de Gate 007 continúa operativo y no se degrada a un planner o
worker legacy.

### 2.3 Retención PII

Un artefacto local con PII no se vuelve production-ready por disponer de
hashing o approvals. Hasta que exista sweeper durable, observabilidad y prueba
de eliminación, la policy debe denegar `local_write + pii` fuera de `test`.
Gate 008 codifica y prueba esa regla, pero no crea un worker destructivo de
cleanup ni promociona `report.crm.export` a sandbox/production.

### 2.4 Idempotencia

Se implementa un port con semántica batch y una referencia in-memory para
tests. Esa implementación no se presenta como store durable de producción.
Gate 009 deberá aportar un adapter durable antes de cualquier write live.

## 3. Incluido

- canonical JSON determinista para el subset seguro de JSON;
- golden vectors y SHA-256 con domain separator;
- `PlanDraft` interno exacto y finalización inmutable de `OperationPlan`;
- validación runtime completa de plan, approval y result;
- invariantes cross-field que JSON Schema no expresa;
- PDP determinista desde registry, capability, mode, environment, scope y
  effects;
- derivación de riesgo y tier más restrictivo;
- validación plan-bound de approval, stages, expiración y scope;
- PEP fail-closed inmediatamente anterior al worker;
- revalidación inyectable de precondiciones;
- mapa estático de workers por capability canónica;
- idempotency store in-memory con conflict, replay, in-progress y outcome
  unknown;
- resultados success, blocked, failed y partial failure;
- redaction y audit events sin payloads sensibles;
- tests unitarios, contract, adversariales e integración enteramente offline;
- actualización de policy version, contratos, ejemplos y conocimiento;
- closure report.

## 4. Fuera de alcance

- cualquier adapter o worker que escriba en sistemas reales;
- promover capabilities a `apply_guarded`;
- llamadas live o sandbox integration;
- persistencia durable de approvals o idempotencia;
- UI/CLI humana para emitir approvals;
- interpretar un “sí” conversacional como aprobación;
- scheduler o borrado de artefactos con PII;
- compensaciones automáticas;
- retirar entrypoints legacy;
- contrato global definitivo HomeLab/Hermes;
- commits, push o publicación.

## 5. Canonical JSON y `planHash`

Crear un canonicalizer sin dependencias externas que:

- acepte exclusivamente null, boolean, finite JSON number, strings Unicode
  bien formados, arrays y plain objects;
- rechace `undefined`, bigint, functions, symbols, NaN, Infinity, ciclos,
  prototypes no planos y lone surrogates;
- preserve el orden de arrays;
- ordene keys de objetos lexicográficamente por UTF-16 code units;
- use serialización JSON/ECMAScript estable para strings y numbers;
- no aplique normalización Unicode silenciosa.

El hash normativo es:

~~~text
sha256(
  UTF8("skilland-crm-ops/operation-plan/v1\n")
  + UTF8(canonicalJson(OperationPlan sin planHash))
)
~~~

`planHash` es el único campo excluido. Requester, environment/workspace,
mode, capability, operations y su orden, inputs, constraints, preconditions,
risk, scopes, versions, timestamps y expiry quedan ligados. Un cambio en
cualquier campo semántico produce otro hash.

`finalizeOperationPlan` debe devolver un árbol deep-frozen y no mutar el
draft. `verifyOperationPlanHash` recalcula desde el payload recibido y usa
comparación segura.

## 6. `PlanDraft` y validación semántica

El planner entrega un objeto exacto equivalente a `OperationPlan` sin:

- `planHash`;
- `registryVersion`;
- `policyVersion`;
- `risk`.

Esos campos pertenecen al PDP/finalizer, no al planner. El validator debe
rechazar propiedades desconocidas, secrets/PII en lugares no permitidos y:

- operation IDs o idempotency keys duplicados;
- effects desconocidos;
- `risk.effects` distinto de la unión de `operations[].expectedEffects`;
- effects que la capability no declare;
- environment, mode o scope fuera del registry;
- plan expiry no posterior a `createdAt`;
- preconditions duplicadas, fallidas, expiradas o incoherentes;
- registry/policy version drift;
- hash ausente, mal formado o incorrecto.

## 7. Policy Decision Point

El PDP es puro y devuelve:

- `allow` para una operación no-apply habilitada;
- `require_approval` para un `apply` allowlisted que requiere aprobación;
- `deny` para cualquier ambigüedad o policy violation.

Evalúa, como mínimo:

1. capability canónica, exposure y lifecycle;
2. `frontDoorReadiness`, mode y environment allowlist;
3. scope containment;
4. effects como subset de policy;
5. domain span, data classes y reversibility;
6. tiers mínimos:
   - CRM write: al menos `operator`;
   - external draft: al menos `owner`;
   - ERP write, external send o CRM write-back cross-domain: `two_stage`;
   - destructive, metadata write y workflow change: `denied`;
7. `local_write + pii` fuera de test: `denied` mientras falte retención
   operativa;
8. policy/registry versions.

El rationale usa códigos estables, no texto libre derivado de input.

## 8. Approval plan-bound

El PEP solo acepta `OperationApproval` estructurada. Para `apply`:

- `approver.type` y todos los stage approvers son `human`;
- request, correlation, repo, capability, environment/workspace y plan ID
  coinciden exactamente;
- `approvedPlanHash` coincide con el hash recalculado;
- tier coincide con el tier derivado;
- decision y todos los stages están `approved`;
- `operator`, `owner` y `two_stage` tienen exactamente sus stages normativos;
- `decidedAt` no precede creación ni supera expiry;
- approval y plan no están expirados;
- `allowedScope` está contenido en `plan.scopeLimits`;
- ampliar o cambiar scope exige otro plan/approval.

No se crea una función que transforme una confirmación booleana en approval.

## 9. Policy Enforcement Point

El PEP recibe un plan finalizado, approval, registry y adapters inyectados.
Orden obligatorio:

1. validar schema/runtime y secrets;
2. recalcular plan hash;
3. volver a ejecutar PDP contra el registry vigente;
4. validar approval y scope;
5. revalidar preconditions con un port inyectado;
6. localizar worker en un mapa estático por capability canónica;
7. reservar todas las idempotency keys de forma atómica;
8. invocar exactamente una vez el worker;
9. validar execution records y emitir result;
10. cerrar o marcar unknown las reservas.

Si cualquier paso previo falla, el contador del worker permanece cero. El
kernel por defecto se construye sin workers y no descubre módulos, comandos o
scripts por nombre recibido.

## 10. Precondiciones

Una precondition de apply debe estar `satisfied` y no expirada. Cuando declara
`expectedVersion` o `expectedHash`, el verifier devuelve la observación actual
y el PEP exige igualdad exacta. Si existe una precondition y no hay verifier,
se bloquea; no se confía en evidencia histórica sin revalidación.

El verifier es read-only e inyectable. Gate 008 usa fixtures locales y nunca
consulta metadata/API live.

## 11. Idempotencia y retries

El port soporta reserva batch antes del worker:

- key nueva + plan hash: reserva `in_progress`;
- misma key + hash diferente: conflict y bloqueo;
- misma key/hash `in_progress` o `unknown`: bloqueo sin retry;
- terminal con result cacheado: replay del mismo result sin worker;
- excepción posterior a invocación: estado `unknown`, error no reintentable y
  reconciliación manual;
- partial failure: no compensation ni retry automático; un nuevo intento
  requiere plan nuevo.

La referencia in-memory debe copiar/freeze datos y no exponer mutación directa
de sus entries.

## 12. Results y partial failure

Extender la validación semántica de `OperationResult` para exigir:

- operation IDs únicos;
- IDs de partial failure existentes, disjuntos y coherentes con status;
- apply success/partial ligado a plan, hash y approval;
- effective mode nunca superior al solicitado;
- no success si un execution record falla;
- evidence/issues redactados;
- compensation solo como estado observado; nunca autoejecutada.

Un throw del worker sin outcome confirmado produce `failed` con
`OUTCOME_UNKNOWN`, ninguna afirmación de rollback y next action manual.

## 13. Integración con Gate 007

- `yarn crm:ops` conserva el slice `report.crm.export/read_only/test`;
- read-only puede continuar con `planId/planHash: null`;
- el registry real no contiene ninguna capability front-door apply-ready;
- el default worker map Gate 008 está vacío;
- package expone una suite policy offline, no un comando de apply;
- `policyVersion` incrementa por la nueva semántica; `registryVersion` solo
  cambia si cambia contenido del catálogo/evidence;
- ninguna superficie legacy se convierte en fallback.

## 14. Tests obligatorios

### Canonicalización/hash

- golden vectors de primitives, nesting y key order;
- mismo valor con distinto insertion order produce el mismo hash;
- cualquier campo semántico alterado cambia el hash;
- planHash no se auto-incluye;
- non-finite, undefined, cycles y lone surrogates bloquean.

### Plan/PDP

- plan válido se finaliza y deep-freeze;
- planner no puede elegir risk, versions o hash;
- union de effects y scope drift bloquean;
- unknown/internal/not implemented/denied bloquean;
- tier escalation es determinista;
- destructive/metadata/workflow y retention PII fuera de test deniegan;
- registry/policy drift bloquea.

### Approval/PEP

- missing approval, hash/plan/environment mismatch, expired approval, agent
  approver, stage incorrecto y scope expansion bloquean;
- precondition pending/expired/drift/no-verifier bloquea;
- worker ausente o no allowlisted bloquea;
- todos los casos prueban cero invocaciones;
- approval correcto invoca una vez un worker fake.

### Idempotencia/result

- key/hash conflict bloquea;
- replay terminal no reinvoca;
- in-progress/unknown no reintenta;
- worker throw marca outcome unknown;
- partial failure conserva fronteras y no compensa;
- IDs de partial failure inconsistentes bloquean.

### Regresión

- suite Gate 007 completa;
- 31 tests legacy relevantes;
- schemas/ejemplos/refs/catálogo;
- sin red, live, outputs en repo ni writes externos.

## 15. Criterios de aceptación

- [x] Spec 008 es la única spec `in_progress` antes de implementar runtime.
- [x] Canonical JSON y plan hash tienen golden vectors estables.
- [x] PlanDraft no puede autoasignar risk, versions ni hash.
- [x] OperationPlan se valida semánticamente, se hashea y queda deep-frozen.
- [x] PDP deriva una decisión y el tier más restrictivo de forma determinista.
- [x] Approval está ligada a plan/hash/environment/tier/scope/expiry y exige
      humanos.
- [x] PEP revalida policy, hash, approval, preconditions e idempotencia antes
      de worker.
- [x] Worker map es estático y el default real está vacío.
- [x] Store in-memory demuestra conflict, replay y outcome unknown sin
      presentarse como durable.
- [x] Partial failure es coherente y no auto-compensa.
- [x] `local_write + pii` fuera de test permanece denegado.
- [x] Registry real no promociona ninguna capability a `apply_guarded`.
- [x] Gate 007 y entrypoints legacy conservan comportamiento y tests.
- [x] Suite Gate 008 pasa enteramente offline.
- [x] Contratos, examples, manifest, registry, catálogo, roadmap y AGENTS
      describen la realidad implementada.
- [x] Closure report registra decisiones, comandos, resultados, unknowns y
      rollback.
- [x] No hubo live calls, external writes, commits ni push.

## 16. Rollback y trabajo diferido

Rollback: retirar módulos/scripts policy, restaurar `policyVersion`, examples y
documentación Gate 008. El router Gate 007 y export legacy deben continuar
funcionando sin el kernel.

Queda diferido:

- store durable y multi-process;
- trust/identity provider para approvers;
- UI/CLI de aprobación;
- retention sweeper durable y promoción de reporting;
- workers y adapters reales de Gate 009+;
- sandbox/live verification;
- contrato global definitivo HomeLab/Hermes.

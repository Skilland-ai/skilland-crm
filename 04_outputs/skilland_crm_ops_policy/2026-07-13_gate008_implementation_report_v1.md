# Skilland CRM Ops Gate 008 — Implementation Report v1

- Status: completed
- Date: 2026-07-13
- Owner: Skilland CRM Ops architecture
- Scope: Spec 008 Policy and Approval Kernel
- Repo baseline: `4f1a383944c731255b9b86b75d601fb2bbe8f800`
- New real workers or writes enabled: none
- Live calls, external mutations, commits or push: none

## 1. Resultado

Gate 008 implementa el boundary determinista que deberán atravesar los futuros
writes de Skilland CRM Ops:

```text
exact PlanDraft
  -> deterministic PDP + derived risk
  -> immutable OperationPlan + canonical planHash
  -> structured human OperationApproval
  -> PEP + precondition revalidation + batch idempotency reservation
  -> static allowlisted worker
  -> validated OperationResult
```

El kernel es runtime reutilizable, no pseudocódigo. Su prueba de ejecución usa
exclusivamente workers fake inyectados y un store in-memory. El mapa de workers
por defecto está vacío y el registry real conserva cero capabilities
`apply_guarded`: Gate 008 no abre ninguna ruta real de write.

## 2. Canonical JSON y plan hash

`canonical-json.mjs` acepta solo el subset JSON seguro: null, boolean, números
finitos, strings Unicode bien formados, arrays densos y plain objects. Rechaza
undefined, bigint, funciones, symbols, NaN/Infinity, ciclos, accessors,
prototypes exóticos, sparse arrays y lone surrogates.

La representación preserva el orden de arrays, ordena object keys por code
units UTF-16, usa serialización ECMAScript de strings/números y no normaliza
Unicode. El hash normativo es:

```text
sha256(
  UTF8("skilland-crm-ops/operation-plan/v1\n")
  + UTF8(canonicalJson(OperationPlan sin planHash))
)
```

Solo se omite `planHash`. El finalizer clona y deep-freezes el plan; la
verificación usa comparación constant-time. La suite fija golden vectors y el
ejemplo versionado `manual-review-dry-run-plan.json` contiene su hash real
`sha256:270f9e74dd0d069a167a036678c65b1fc4afdbcb7e4220b3b24158bf85083150`.

## 3. PDP y riesgo derivado

El planner no puede asignar `risk`, `registryVersion`, `policyVersion` ni
`planHash`. El PDP deriva efectos, domain span, data classes, reversibility,
tier y rationale estable desde el registry y el plan.

La decisión falla cerrada para capability desconocida, no pública, inactiva,
no ready, mode/environment no allowlisted, scope o effect drift, operación que
no cabe en scope/target, dangerous effects y tier denied. Aplica los mínimos:

- `crm_write`: operator, y owner si incluye PII;
- `external_draft`: owner, o two-stage si incluye PII;
- `erp_write`, `external_send` y CRM write-back cross-domain: two-stage;
- destructive, metadata write y workflow change: denied;
- `local_write + pii` fuera de test: denied mientras no exista retención
  ejecutable.

`policyVersion` sube de `1.1.0` a `1.2.0`; `registryVersion` permanece en
`1.1.0` porque no cambian catálogo, aliases ni readiness.

## 4. Approval plan-bound

El validator de approval exige envelope estructurado, approver y stage
approvers humanos, request/correlation/repo/capability/environment exactos,
plan ID y hash exactos, tier derivado, decisión approved, stages normativos,
scope contenido que además cubra todas las operaciones y timestamps
coherentes/no expirados.

`operator`, `owner` y `two_stage` tienen stage sets exactos; two-stage conserva
dos decisiones explícitas sobre el mismo hash. No existe conversión desde
`--yes` o un sí conversacional. Gate 008 valida el tipo de identidad declarado,
pero no afirma autenticidad criptográfica u organizativa: el trust provider
queda diferido.

## 5. PEP, workers y precondiciones

El PEP aplica este orden antes de invocar un worker:

1. valida plan y valores sensibles;
2. recalcula hash;
3. comprueba registry/policy versions y vuelve a ejecutar PDP;
4. compara el risk derivado;
5. valida approval, scope y expiry;
6. revalida todas las precondiciones con un port read-only;
7. resuelve el worker en un Map estático copiado al construir el kernel;
8. reserva el batch de idempotency keys;
9. invoca una vez y valida todos los execution records;
10. completa o marca unknown las reservas.

Missing approval/worker, hash/risk/policy drift, precondition pending/expired,
verifier ausente, version/hash drift e idempotency conflict/in-progress/unknown
bloquean antes del worker. Audit events contienen IDs, decisión y versión, no
operation inputs.

## 6. Idempotencia y partial failure

`InMemoryIdempotencyStore` demuestra reserva batch atómica dentro de un proceso:

- key nueva: `in_progress`;
- misma key con otro plan hash: conflict;
- misma key/hash in-progress o unknown: no retry;
- terminal: replay del mismo result sin reinvocar;
- excepción o output inválido tras invocación: unknown y reconciliación manual.

El store copia y congela sus datos, pero no es durable ni multi-process. Un
worker que devuelve éxitos y fallos produce `partial_failure` con IDs exactos,
disjuntos y coherentes. No hay compensation ni retry automáticos. Un throw no
afirma rollback: produce `OUTCOME_UNKNOWN` y marca todas las operaciones como
requiriendo reconciliación.

## 7. Contratos e integración con Gate 007

La validación runtime de plan, approval y result añade invariantes cross-field
que JSON Schema no puede expresar. Los resultados apply success/partial exigen
plan/hash/approval y los IDs de partial failure deben corresponder exactamente
a sus execution records.

El router Gate 007 no fue convertido en planner ni PEP. Sigue ofreciendo solo
`report.crm.export/read_only/test`; sus resultados read-only pueden conservar
plan/hash nulos. El registry continúa con 31 capabilities `not_implemented`,
seis `denied` y una `read_only`. Sandbox y production del export siguen
bloqueados por falta de retención durable de PII.

Se actualizan manifest, registry policy version, schema description, examples,
AGENTS, README operativo, target architecture, safety model, ADRs, catálogo,
governance y roadmap sin cambiar el contrato HomeLab provisional v0.1.

## 8. Verificación ejecutada

| Check | Resultado |
| --- | --- |
| Gate 008 policy suite | 24 tests, 24 pass, 0 fail. |
| Gate 007 + Gate 008 suite | 85 tests, 85 pass, 0 fail. |
| Regresión overlay legacy | 31 tests, 31 pass, 0 fail. |
| Inventario ejecutado | 116 tests, 116 pass, 0 fail. |
| Examples runtime | 7/7 validados; el plan example verifica su hash canónico. |
| Foundation runtime | Manifest + registry válidos; registry `1.1.0`, policy `1.2.0`. |
| Schema refs | 68 referencias locales resueltas en cuatro schemas. |
| Readiness | 31 `not_implemented`, seis `denied`, una `read_only`, cero `apply_guarded`. |
| Syntax/diff | Todos los módulos ops/policy pasan `node --check`; `git diff --check` limpio. |
| External effects | Sin red, APIs, CRM/ERP/Gmail/DB, outputs de datos, commits ni push. |

Comandos principales:

```bash
npm run crm:ops:test

node --test \
  scripts/crm_execution_crew/crm-execution-crew.test.mjs \
  scripts/crm_aikount_ops/crm-aikount-ops.test.mjs \
  scripts/crm_manual_update_crew/parser.test.mjs
```

La suite policy construye registries y workers fake en memoria. No lee
credenciales, bloquea la disponibilidad apply del registry real y no persiste
artefactos en el repo.

## 9. Decisiones y unknowns

Decisiones cerradas:

- domain-separated canonical hash, con `planHash` como única exclusión;
- risk/version fields poseídos por PDP/finalizer;
- approvals humanas estructuradas, nunca booleanas;
- worker registry estático y vacío por defecto;
- post-invocation ambiguity siempre unknown/no retry;
- partial failure sin ficción de transacción distribuida;
- retención de PII como deny ejecutable, no como afirmación documental.

Queda deliberadamente diferido:

- trust/identity provider para approvers;
- idempotency y approval stores durables/multi-process;
- planner/normalizer de negocio y UI de approvals;
- primer worker CRM real y typed allowlists de Gate 009;
- retention sweeper y promoción del export;
- sandbox/live verification;
- contrato global definitivo HomeLab/Hermes;
- compensaciones como planes nuevos.

## 10. Rollback y siguiente gate

El rollback consiste en retirar `scripts/skilland_crm_ops/policy/`, la suite y
exports policy, restaurar `policyVersion`/examples/docs a `1.1.0` y revertir las
invariantes result añadidas. El router Gate 007 y los entrypoints legacy no
dependen del kernel y deben seguir operativos.

Gate 009 podrá diseñar el primer worker CRM real solo después de elegir store
durable, trust boundary y allowlist tipada. Este cierre no preautoriza notes,
tasks ni Opportunity updates.

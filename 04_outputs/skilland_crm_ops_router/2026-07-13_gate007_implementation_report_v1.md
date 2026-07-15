# Skilland CRM Ops Gate 007 — Implementation Report v1

- Status: completed
- Date: 2026-07-13
- Owner: Skilland CRM Ops architecture
- Scope: Spec 007 Thin Local Router
- Repo baseline: `4f1a383944c731255b9b86b75d601fb2bbe8f800`
- New external writes enabled: none
- Live calls or external mutations: none
- Commits or push: none

## 1. Resultado

Gate 007 queda implementado como una front door local mínima, estática y
fail-closed. El único vertical disponible es `report.crm.export` en mode
`read_only` y environment `test`; el alias `crm.export.chatgpt` resuelve al
mismo ID canónico sin contrato, policy ni executor propios. Sandbox y
production permanecen fuera de la front door mientras no exista retención
ejecutable para el artefacto con PII.

El flujo probado es:

~~~text
RepoHandoffRequest v0.1 provisional/local
  -> manifest + capability registry fijos
  -> validación y routing canónico
  -> adapter report.crm.export
  -> CRM reader query-only fake
  -> un Markdown create-only en filesystem temporal
  -> OperationResult v1 + evidencia acotada
~~~

No se ha implementado Gate 008. `apply`, todas las demás capabilities,
approvals, plan hashing, PDP/PEP, idempotency store y writes externos siguen
bloqueados.

## 2. Contrato de frontera

Se añadió `repo-handoff.schema.json` con:

- Draft 2020-12 y `$id` estable;
- versión propia `0.1.0`;
- `contractStatus: provisional_local`;
- autoridad `skilland-crm-local`;
- destino exacto `skilland-crm`;
- `OperationRequest` v1 embebido mediante `$ref` local.

El contrato es deliberadamente provisional. El commit HomeLab fijado por la
fundación no publica un `RepoHandoffRequest` machine-readable global. Gate 007
prueba la frontera sin atribuirse un estándar que todavía no existe y deja su
futura sustitución como migración explícita.

El harness acepta un único fichero JSON regular, no symlink, de hasta 256 KiB.
Un input inválido devuelve un `OperationResult` bloqueado y parseable con exit
code `2`; no refleja campos arbitrarios en el result.

## 3. Router y policy local

El runtime nuevo bajo `scripts/skilland_crm_ops/` separa:

- validación runtime del handoff y envelopes;
- carga acotada de manifest y registry desde paths fijos;
- validación de invariantes cross-document;
- resolución canonical-first de un alias exacto y no ambiguo;
- gates de exposure, lifecycle, readiness, mode, environment y scope;
- mapa estático e inyectable de adapters por ID canónico;
- redaction, logs JSON a stderr y resultados v1 por stdout.

El router no usa shell, no deriva nombres de módulo o comando desde input y no
hace fallback a scripts, APIs o bases de datos. Solo
`report.crm.export/read_only/test` atraviesa la allowlist de Gate 007. Un
request `apply`, `dry_run` no soportado, capability
interna/desconocida/bloqueada/no implementada, environment fuera de allowlist,
scope ampliado o adapter ausente se detiene antes del worker.

La auditoría final detectó que la primera versión del loader solo comprobaba
un subconjunto del schema de foundation. Se reabrió el gate y se sustituyó por
validación exhaustiva de shape, tipos, enums, additional properties,
condicionales, evidence, contracts, risk/approval, scopes, entrypoints,
outputs y coherencia manifest/registry. Mutaciones adversariales de ambos
documentos prueban que una foundation inválida bloquea antes del adapter.

Los resultados read-only usan `planId: null` y `planHash: null`, permitido por
el envelope v1. Gate 008 conserva ownership sobre planes, hashes, approvals y
enforcement de writes.

## 4. Vertical seguro de export

El exportador legacy se refactorizó para exponer
`generateCrmExportMarkdown(...)` sin ejecutar `main()` al importarlo. El
servicio:

- solo recibe un reader con metadata GET y GraphQL query;
- bloquea una operation GraphQL que no sea query;
- impone un máximo real de 1000 opportunities;
- exige `pageInfo` y cursores coherentes;
- bloquea si opportunities, notes o tasks quedan truncadas;
- inspecciona señales consultables de business line, IA Mujeres y tags,
  incluidos campos `MULTI_SELECT`;
- no genera un artefacto si no puede demostrar exclusión y completitud.

El binding del adapter requiere explícitamente
`SKILLAND_CRM_OPS_ENVIRONMENT`, `SKILLAND_CRM_OPS_WORKSPACE`,
`TWENTY_API_KEY` y `TWENTY_BASE_URL`. Environment/workspace deben coincidir con
el envelope. Gate 007 exige `test`; el reader exige HTTPS para cualquier
entorno superior que una gate futura habilite. No existe fallback a producción
ni al fichero de credenciales usado por el CLI legacy.

El artifact store nuevo:

- está confinado a `04_outputs/crm_manual_update_session`;
- genera el basename desde un `requestId` validado;
- crea con `wx` y nunca sobrescribe;
- verifica modo `0600`, tamaño y SHA-256;
- aplica el menor byte cap entre request, registry y 5 MiB;
- elimina el fichero parcial ante un fallo de escritura.

El result solo conserva path relativo, media type, hash, bytes, conteos y una
señal de completitud. Markdown y datos CRM no se serializan como evidencia.

## 5. Compatibilidad legacy

Siguen presentes:

- `yarn crm:export`;
- `node scripts/crm_manual_update_crew/export-para-chatgpt.mjs`;
- `yarn crm:review`, `yarn crm:execute` y `yarn crm:aikount` sin cambios de
  routing implícito.

El CLI de export mantiene `--output-dir` como opción legacy explícita, pero
ahora usa create-only, `0600`, byte cap y cleanup. La nueva front door nunca
acepta un output path elegido por el request ni invoca el CLI como fallback.

## 6. Manifest, registry y conocimiento

El manifest declara:

- `localFrontDoor.status: available`;
- entrypoint `crm.ops` con comando `yarn crm:ops`;
- handoff v0.1 provisional/local;
- `localFrontDoorImplemented: true`;
- production writes deshabilitados;
- cero external calls durante la validación Gate 007.

El registry/policy sube de `1.0.0` a `1.1.0`. Solo
`report.crm.export` pasa a `frontDoorReadiness: read_only` y
`testLevel: integration`, con tres claims de evidence y allowlist exacta
`environment: test`. Las otras 37 capabilities conservan su readiness
anterior: 31 `not_implemented` y seis `denied`.

Se actualizaron AGENTS, catálogo, target architecture, safety model,
knowledge governance, roadmap, documentación/skills del export y README
operativo. `available` describe la existencia del router; la disponibilidad
continúa siendo una decisión por capability.

## 7. Verificación ejecutada

| Check | Resultado |
| --- | --- |
| JSON parse | 13/13 válidos. |
| Schema meta-validation | 4/4 Draft 2020-12 válidos. |
| Instance validation | Manifest + registry + siete ejemplos: 9/9 válidos. |
| References y paths | `$ref`, contract current/evidence y canonical knowledge resueltos offline. |
| Capability parity | 38 canónicas + un alias = 39 IDs, sin colisiones. |
| Readiness | 31 `not_implemented`, seis `denied`, una `read_only`. |
| Catalog parity | 38 filas y alias coinciden exactamente con el registry. |
| Gate 007 | 61 tests, 61 pass, 0 fail. |
| Regresión overlay | 31 tests, 31 pass, 0 fail. |
| Inventario ejecutado | 92 tests, 92 pass, 0 fail. |
| Mutaciones críticas de foundation | 8/8 rechazadas por schema offline y 11/11 bloqueadas por runtime antes del adapter. |
| Syntax | Todos los `.mjs` nuevos y el exportador compartido pasan `node --check`. |
| Harness inválido | Result bloqueado parseable, exit code `2`. |
| External effects | Sin red, live calls, writes CRM/API/DB/email ni artefactos en el repo. |

Suite principal ejecutada sin dependencias instaladas:

~~~bash
node --test \
  scripts/skilland_crm_ops/router.test.mjs \
  scripts/skilland_crm_ops/adapters/adapters.test.mjs
~~~

La E2E incluida usa el handoff fixture y la foundation real, enruta el alias al
adapter canónico, reemplaza CRM por un reader fake, bloquea
`globalThis.fetch`, escribe en un root temporal y comprueba un único artefacto,
hash, conteos y modo `0600`.

Regresión relevante:

~~~bash
node --test \
  scripts/crm_execution_crew/crm-execution-crew.test.mjs \
  scripts/crm_aikount_ops/crm-aikount-ops.test.mjs \
  scripts/crm_manual_update_crew/parser.test.mjs
~~~

`yarn crm:ops:test` está correctamente registrado como alias del primer
comando, pero este checkout no contiene el state file de `node_modules` que
Yarn exige y por ello Yarn abortó antes de lanzar Node. No se ejecutó una
instalación porque no es necesaria para validar estos módulos y habría
ampliado el alcance del worktree. La misma suite subyacente pasó 61/61 por
Node.

## 8. Fuentes y decisiones fijadas

La doctrina cross-repo continúa fijada a los commits revisados por Spec 006:

- HomeLab:
  `25cb94b2ed5482ca722cd76c8be71487ddba6aff`;
- North Star:
  `31c59d14b1802081e8e25026cff5d37a843db735`.

Gate 007 no reconsultó `main`, no modificó esos repos y no afirma nada sobre su
estado posterior. ADR-001 conserva la decisión de ownership global/local;
este gate materializa únicamente su lado local provisional.

## 9. Unknowns y trabajo diferido

Queda deliberadamente fuera de Gate 007:

- contrato global definitivo de HomeLab/Hermes y su migración desde v0.1;
- validación live de credenciales, workspace, metadata y volumen real;
- retención/cleanup gobernados para artefactos locales con PII y la posterior
  promoción de reporting a sandbox/production;
- `OperationPlan`, canonical hash, PDP/PEP, approval e idempotency store;
- adapters adicionales read-only/dry-run;
- cualquier mutation CRM, AIKount, Gmail, metadata o workflows;
- retirada de entrypoints y paths legacy;
- publicación o resolución remota de los `$id` de schemas;
- generación automática registry -> catálogo Markdown.

El CLI legacy sigue pudiendo recibir un `--output-dir` explícito. Esa
compatibilidad no amplía la front door y deberá revisarse en una futura gate de
deprecación. La producción del export también permanece solo en esa superficie
manual legacy; no es un fallback del router. El estado live del CRM continúa
`unknown` porque este cierre no autoriza llamadas externas.

## 10. Rollback y siguiente gate

El rollback operativo consiste en retirar los scripts `crm:ops` del
`package.json`, devolver la front door a `planned`/no implementada y restaurar
`report.crm.export` a `frontDoorReadiness: not_implemented`. Los contratos y
este informe pueden conservarse como historia; los entrypoints legacy no
dependen del router.

La auditoría final y la remediación de paridad runtime están completas. Todos
los criterios de Spec 007 quedan satisfechos y la spec se marca `completed`.
Gate 008 continúa `not_started`: este informe no autoriza policy/approval
runtime ni ningún write externo.

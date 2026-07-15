# 007 — Skilland CRM Ops Thin Local Router

- Status: completed
- Date: 2026-07-13
- Completed: 2026-07-13
- Owner: Skilland CRM Ops architecture
- Implementer target: Gate 007 implementation session
- Canonical for: alcance y gate del thin local router de Skilland CRM Ops
- Last verified: 2026-07-13
- Supersedes: none
- Superseded by: none
- Depends on: 006_skilland_crm_ops_phase0_5_foundation.md
- Closure report:
  04_outputs/skilland_crm_ops_router/2026-07-13_gate007_implementation_report_v1.md

## 1. Objetivo

Implementar la primera front door local real de `skilland-crm`, limitada a
routing determinista y a un único vertical slice de reporting sin writes
externos:

~~~text
RepoHandoffRequest provisional/local
  -> repo manifest
  -> Skilland CRM Ops router
  -> canonical report.crm.export adapter
  -> OperationResult + un artefacto Markdown local
~~~

El gate debe demostrar que el control plane global puede entregar una petición
a este repo y obtener un resultado contractual sin conocer scripts internos.
No debe anticipar el policy/approval kernel de Gate 008 ni habilitar ninguna
mutation de CRM, AIKount, Gmail, metadata o workflows.

## 2. Corrección de alcance

El commit de HomeLab fijado por Spec 006 no publica todavía un contrato
machine-readable `RepoHandoffRequest`; sus propios unknowns dejan esa decisión
abierta. Por tanto, el contrato inbound creado aquí es:

- provisional y poseído localmente por `skilland-crm`;
- versionado de forma independiente;
- suficiente para probar la frontera, pero no presentado como estándar global;
- sustituible mediante una migración explícita cuando HomeLab/Hermes publique
  el contrato global.

`repo-manifest.json` debe declarar esta autoridad y provisionalidad. No se
puede fingir interoperabilidad global cerrada ni editar el repo HomeLab desde
este gate.

## 3. Principios obligatorios

1. El router usa un mapa estático de adapters por capability canónica. Nunca
   busca o ejecuta scripts por nombre recibido.
2. La resolución intenta primero el ID canónico exacto y después un único alias
   exacto. Un alias no posee executor, contrato ni policy propios.
3. Solo una capability `public`, `active`, habilitada en
   `frontDoorReadiness`, compatible con mode/environment/scope y con adapter
   registrado puede alcanzar un worker.
4. El router de Gate 007 acepta semánticamente `read_only` y `dry_run`; todo
   `apply` se bloquea antes del adapter. El primer adapter solo soporta
   `read_only` y no convierte silenciosamente `dry_run`.
5. Los resultados read-only no necesitan `OperationPlan`: `planId` y
   `planHash` pueden ser `null`, como permite el envelope v1. Gate 008 será el
   propietario de plan hashing, approvals, PDP/PEP e idempotency store.
6. Leer CRM y crear un artefacto local es `read_only` respecto al sistema
   externo, pero el efecto `local_write` sigue declarado y limitado.
7. Toda ambigüedad, versión desconocida, input secreto, scope ampliado, falta
   de adapter o evidencia incompleta falla cerrada con errores estructurados.
8. El comando legacy sigue disponible, pero nunca es fallback implícito del
   router.

## 4. Alcance

### Incluido

- schema e instancia de ejemplo del handoff provisional/local;
- referencia explícita al handoff desde el repo manifest;
- parser de fichero JSON acotado y validación runtime de handoff,
  `OperationRequest`, manifest y registry;
- resolución canónica/alias y dispatcher allowlisted;
- resultados v1 estructurados para éxito, bloqueo y fallo;
- correlation IDs, observabilidad estructurada y redaction;
- adapter determinista `report.crm.export` con port CRM query-only;
- artifact store confinado, create-only y con byte cap;
- refactor mínimo del exportador legacy para compartir lógica sin ejecutar
  `main()` al importarlo;
- tests unitarios, contract e integración local sin red;
- documentación operativa, actualización honesta de registry/manifest/catálogo
  e informe de cierre.

### Fuera de alcance

- definir o modificar el contrato global de HomeLab/Hermes;
- implementar `OperationPlan`, plan hash, approvals, PDP/PEP o Gate 008;
- soportar `apply` en la front door;
- habilitar otras capabilities aunque su runtime legacy exista;
- llamadas live durante tests o validación de este gate;
- CRM/API/DB writes, email/draft/send, AIKount writes, metadata mutations,
  workflows o acciones destructivas;
- overwrite de artefactos o output paths elegidos por input;
- retirar o cambiar de semántica los comandos legacy;
- commits, push o publicación.

## 5. Contrato de handoff provisional

Crear `shared/contracts/skilland-crm-ops/repo-handoff.schema.json` con JSON
Schema Draft 2020-12, `$id` estable y versión provisional propia. El payload
debe declarar como mínimo:

- `kind`, `schemaVersion` y estado/autoridad provisional local;
- `handoffId`, fuente y destino `skilland-crm`;
- timestamp de entrega;
- un `OperationRequest` v1 completo referenciado desde
  `operation-envelope.schema.json`.

El parser debe rechazar:

- JSON inválido, ficheros excesivos y propiedades desconocidas;
- schema/kind/version no soportados;
- repo de destino o `operationRequest.repoId` distintos;
- IDs, fechas, requester o environment/workspace inválidos;
- claves con forma de secret en cualquier profundidad;
- ausencia de mode, scope o contrato de operación.

Crear un ejemplo válido para el alias `crm.export.chatgpt` que pruebe que el
resultado y el executor terminan en `report.crm.export`.

## 6. Router local

El runtime nuevo vive en `scripts/skilland_crm_ops/` y expone tanto una API
inyectable como un harness CLI. Debe separar:

- carga y validación de foundation (manifest + registry);
- validación/redaction de contratos;
- resolución de capability;
- decisión fail-closed previa al adapter;
- mapa estático canónico de adapters;
- construcción de `OperationResult`.

El orden de evaluación es autoritativo:

1. parsear y validar el handoff sin loguear su payload;
2. cargar/validar manifest y registry desde paths fijos del repo;
3. verificar versión, repo, environment y workspace explícitos;
4. resolver canonical/alias de forma exacta y no ambigua;
5. comprobar exposure, lifecycle, readiness, mode y environment allowlist;
6. comprobar que el requested scope no supera el registry ni activa flags
   prohibidos;
7. localizar el adapter por ID canónico exacto;
8. ejecutar el worker e incorporar solo evidencia redactada;
9. validar/emitir `OperationResult` v1.

Errores mínimos, con códigos estables y mensajes sin payloads sensibles:

- `INVALID_HANDOFF`
- `CONTRACT_VERSION_UNSUPPORTED`
- `REPO_MISMATCH`
- `FOUNDATION_INVALID`
- `CAPABILITY_UNKNOWN`
- `CAPABILITY_INTERNAL`
- `CAPABILITY_BLOCKED`
- `CAPABILITY_NOT_IMPLEMENTED`
- `MODE_UNSUPPORTED`
- `ENVIRONMENT_UNSUPPORTED`
- `WORKSPACE_BINDING_MISMATCH`
- `SCOPE_EXCEEDED`
- `ADAPTER_NOT_FOUND`
- `OUTPUT_POLICY_VIOLATION`
- `SOURCE_DATA_INCOMPLETE`
- `EXECUTION_FAILED`

Cuando un handoff inválido impida reutilizar sus campos, el router puede usar
identificadores sentinel válidos para emitir un `OperationResult` bloqueado;
nunca debe reflejar un valor arbitrario o secreto para forzar conformidad.

## 7. Vertical `report.crm.export`

### 7.1 Interfaz

El adapter debe poder ejecutarse como servicio inyectable equivalente a:

~~~js
executeReportCrmExport({
  request,
  crmReader,
  artifactStore,
  clock,
})
~~~

`crmReader` solo expone metadata GET y GraphQL query con un guard que rechaza
mutations. No entrega al servicio un cliente de escritura genérico.

Para ejecución real, environment y workspace deben estar vinculados a
configuración explícita del proceso y coincidir con el envelope. El nuevo
router no puede usar el fallback histórico a producción ni leer
silenciosamente credenciales de otra superficie. La ausencia o discrepancia
bloquea antes de la primera lectura.

Gate 007 limita además `report.crm.export` a environment `test`. El artefacto
puede contener datos comerciales/PII y todavía no existe enforcement de
retención; por ello sandbox/production permanecen fuera de la allowlist de la
front door. El CLI legacy de producción sigue siendo una selección manual
separada, no una degradación automática. Promover entornos requiere una spec
que gobierne retención y, si procede, approval.

### 7.2 Input allowlisted

La capability acepta exclusivamente:

- formato Markdown;
- exclusión obligatoria de IA Mujeres;
- `maxRecords` entre 1 y 1000;
- exactamente un artefacto local;
- prefix `04_outputs/crm_manual_update_session`;
- `allowOverwrite: false`;
- byte cap positivo no superior al límite del adapter;
- cero documentos/recipients y todos los flags externos, destructivos,
  metadata y workflow en `false`.

No acepta output path, query, filtros arbitrarios ni opciones de escritura
dentro de `input`.

### 7.3 Completitud y exclusión IA Mujeres

El artefacto solo puede crearse si el adapter puede demostrar la política de
exclusión sobre todo el dataset permitido. Debe bloquear antes de escribir si:

- existe otra página de opportunities al alcanzar `maxRecords`/`maxPages`;
- notes o tasks de cualquier opportunity están truncadas;
- metadata revela un posible campo de señal IA Mujeres/tags que el query
  allowlisted no puede inspeccionar;
- la respuesta carece de `pageInfo` o shape necesario para probar completitud;
- el workspace/environment no está inequívocamente vinculado.

Los campos escalares conocidos, incluidos multi-select cuando existan, pueden
participar en la detección. El adapter nunca debe afirmar “IA Mujeres
excluido” basándose en una lectura parcialmente conocida.

### 7.4 Artifact store

La única escritura nueva permitida es un Markdown bajo el prefix fijo. El
store debe:

- resolver containment contra el root del repo;
- generar un basename desde IDs/timestamp controlados, no desde input libre;
- crear directorios con permisos restrictivos;
- abrir con semántica `wx`, nunca sobrescribir;
- aplicar modo `0600` al fichero;
- medir bytes antes de persistir y respetar el menor cap efectivo;
- devolver path relativo, media type, bytes y SHA-256;
- retirar un fichero incompleto si la escritura falla.

El result puede incluir path/hash/bytes/conteos/completitud. No puede incluir el
Markdown, nombres, emails, notas, tareas, credenciales ni respuestas CRM.

## 8. Compatibilidad legacy

`yarn crm:export` y
`node scripts/crm_manual_update_crew/export-para-chatgpt.mjs` permanecen como
entrypoints explícitos. La lógica de lectura/render puede extraerse o
exportarse para que el adapter no use shell ni parsee stdout.

El CLI debe conservar su experiencia básica, pero puede adoptar controles
create-only, byte cap y fallo ante dataset incompleto porque son hardening de
seguridad. Cualquier diferencia debe documentarse en `README_EXPORT.md`.

Si la front door bloquea, el resultado puede mencionar el comando legacy como
acción manual separada; no debe ejecutarlo automáticamente ni insinuar que
evita el control que produjo el bloqueo.

## 9. Observabilidad y secretos

Los logs son eventos JSON a stderr. Solo contienen identifiers validados,
capability canónica, alias usado, environment, mode, decisión, código de error
y timings/conteos no sensibles.

El redactor debe cubrir de forma recursiva claves de credential/token/secret,
Bearer values, cookies, signed URLs y patrones de email. Tests negativos deben
demostrar que un payload sensible no aparece ni en logs ni en results.

El CLI emite el `OperationResult` JSON por stdout para que el caller pueda
parsearlo sin mezclar telemetría.

## 10. Registry, manifest y conocimiento

Solo después de que los tests pasen:

- promover `report.crm.export` a `frontDoorReadiness: read_only` y
  `testLevel: integration`;
- añadir evidence de tests/runtime y actualizar sus referencias de contrato;
- incrementar `registryVersion` por cambio de readiness/policy de scope;
- mantener las otras 37 capabilities exactamente en su readiness anterior;
- declarar la front door `available` en el manifest sin habilitar production
  writes;
- añadir el entrypoint `crm.ops` con role `local_front_door`;
- declarar el handoff provisional y los límites locales machine-readable;
- actualizar catálogo, roadmap, ADR/AGENTS únicamente donde la realidad haya
  cambiado.

`localFrontDoor.status: available` significa que existe el router, no que todas
las capabilities estén disponibles. La disponibilidad sigue siendo por
capability.

## 11. Tests obligatorios

### Contract y foundation

- handoff válido y versión provisional admitida;
- schema/kind/version/repo inválidos bloquean;
- manifest o registry inválidos bloquean;
- claves secret-shaped se rechazan en cualquier profundidad;
- `OperationResult` éxito/bloqueo/fallo conserva shape v1.

### Routing

- canonical exacto invoca un solo adapter;
- alias exacto comparte el mismo adapter y devuelve canonical ID;
- alias ambiguo, desconocido, internal, blocked y not implemented bloquean;
- `apply` nunca alcanza un adapter;
- `dry_run` sobre el export no se coerciona a read-only;
- environment y scope fuera de allowlist bloquean;
- falta de adapter bloquea sin ejecutar CLI/direct API.

### Export y no-write

- todas las operaciones GraphQL observadas son queries;
- fixture IA Mujeres queda excluida;
- truncación de opportunities/notes/tasks bloquea antes del artefacto;
- record/byte/path/overwrite limits se aplican;
- artefacto tiene SHA correcto y modo `0600`;
- error no deja fichero parcial;
- result/log no contienen PII ni secrets.

### E2E local

Ejecutar el vertical completo con manifest/registry reales, un handoff fixture,
CRM reader fake y artifact store temporal. Debe producir un result exitoso y
un solo Markdown sin realizar ninguna petición de red. La suite normal debe
fallar si intenta usar `fetch`.

Las pruebas live quedan separadas, opt-in y fuera de este gate.

## 12. Criterios de aceptación

- [x] Existe una spec activa única y este alcance precede al runtime nuevo.
- [x] Handoff, manifest, registry y envelope tienen validación runtime y
      ejemplos machine-readable.
- [x] El contrato inbound se presenta honestamente como provisional/local.
- [x] El router es estático, canónico, allowlisted y fail-closed.
- [x] `apply` y toda capability distinta de `report.crm.export` quedan
      bloqueados antes de worker.
- [x] El alias legacy no posee executor independiente.
- [x] El export usa un port query-only y vinculación explícita de
      environment/workspace.
- [x] `report.crm.export` queda limitado a `test` hasta que exista policy de
      retención ejecutable para artefactos con PII.
- [x] Los límites de records, completitud IA Mujeres, path, bytes, overwrite y
      permisos se aplican antes/durante la única escritura local.
- [x] Los entrypoints legacy siguen presentes y no son fallback implícito.
- [x] Tests contract, routing, redaction, export y E2E pasan sin red/live.
- [x] Los tests runtime existentes del overlay continúan pasando.
- [x] Solo `report.crm.export` se promociona en el registry.
- [x] Manifest/catálogo/roadmap/AGENTS describen la realidad implementada.
- [x] El closure report registra archivos, decisiones, comandos, resultados,
      unknowns y trabajo diferido.
- [x] No se han realizado writes externos, live tests, commits ni push.

## 13. Verificación y cierre

El implementer debe registrar como mínimo:

- parse/check de todos los JSON y scripts nuevos;
- validación de schemas, instancias, refs, counts y aliases;
- suite Gate 007 completa;
- suites legacy relevantes y test inventory total;
- diff/status para demostrar alcance;
- evidencia de que tests usaron fakes/temp y no red;
- búsqueda de `main()` import-unsafe, shell dispatch, output paths arbitrarios,
  secret logging y writes externos en el runtime nuevo.

La spec solo cambia a `completed` después de satisfacer todos los criterios y
publicar el closure report. Si la foundation o la exclusión completa no puede
demostrarse, permanece `in_progress` o `blocked`; no se promociona readiness.

## 14. Rollback y trabajo diferido

El rollback operativo consiste en retirar el entrypoint `crm:ops` y devolver
la front door/capability a `not_implemented`, manteniendo contratos y evidence
como historia. Los comandos legacy no dependen del router y permanecen
disponibles.

Queda deliberadamente diferido:

- adopción/mapeo del contrato global futuro de HomeLab;
- Gate 008 (plans, hashing, approvals, PDP/PEP e idempotency store);
- más adapters read-only/dry-run;
- cualquier write externo o enablement de production mutations;
- live verification de credenciales/workspace y medición operativa real.

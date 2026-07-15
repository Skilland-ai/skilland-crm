# AGENTS.md — Skilland CRM

## Alcance

Estas instrucciones se aplican a todo el repositorio, salvo que un
`AGENTS.md` más cercano defina reglas adicionales para un subárbol concreto.

## Identidad del repositorio

Este repositorio combina dos capas que deben mantenerse distinguibles:

1. **Twenty upstream**: el producto CRM y su código base heredado.
2. **Skilland operational overlay**: scripts, agentes, skills, contratos,
   conocimiento y outputs que convierten Twenty y los sistemas conectados en
   una superficie operativa de Skilland.

No se debe interpretar el `README` upstream de Twenty como la front door
operativa de Skilland. Tampoco se debe modificar código upstream para resolver
una necesidad del overlay si existe una extensión local más acotada y
mantenible.

`Skilland CRM Ops` es la front door local de este repositorio. Desde Gate 007
existe un router thin, pero solo `report.crm.export` está disponible detrás de
él, únicamente en `read_only` y environment `test`; toda otra capability
conserva la readiness que declare el registry. Producción permanece en la
superficie legacy manual hasta gobernar retención de artefactos con PII. Un
flag global nunca habilita el catálogo en bloque.

Gate 008 añade un policy/approval kernel interno y probado offline: canonical
plan hash, PDP, approval plan-bound, PEP, preconditions y semántica de
idempotencia. No amplía el router: el mapa de workers de apply está vacío por
defecto, el store de referencia es solo in-memory y ninguna capability real
está `apply_guarded`. No presentar el kernel como autorización de writes ni
como durabilidad de producción.

`Hermes + HomeLab Meta-Harness` sigue siendo el control plane global: elige el
repositorio y evalúa riesgo entre repos; `Skilland CRM Ops` resuelve dentro de
este repo la capability, el dominio, la política y el worker adecuados. El
`RepoHandoffRequest` v0.1 de Gate 007 es provisional y poseído localmente hasta
que HomeLab publique un contrato global; no presentarlo como interoperabilidad
global cerrada.

## Orden de lectura canónico

Antes de planificar o implementar trabajo sobre el overlay, leer en este orden:

1. Este archivo.
2. `shared/contracts/skilland-crm-ops/repo-manifest.json`, para identidad,
   superficies y rutas canónicas.
3. `shared/knowledge/skilland-crm-ops/README.md` y los ADRs o documentos que
   este enrute para la decisión en cuestión.
4. `03_specs/README.md` y la spec cuyo `Status` sea `in_progress`, o el estado
   que ese índice identifique explícitamente como vigente.
5. `shared/contracts/skilland-crm-ops/capability-registry.json` y los schemas
   del operation envelope.
6. Los agentes, skills, orquestaciones y README del dominio afectado.
7. Runtime, tests y evidencia fechada. Estos últimos determinan qué existe de
   verdad; una arquitectura objetivo o una spec no demuestran implementación.

Si una ruta todavía no existe durante una migración, registrar el hueco y
continuar con el siguiente nivel disponible. No inventar su contenido ni
presentar una superficie `planned` como operativa.

## Fronteras arquitectónicas

- Hermes/HomeLab posee routing global, prioridad y riesgo cross-repo.
- `Skilland CRM Ops` posee routing local por `capabilityId`; no decide sobre
  otros repositorios.
- `CRM Conversation` es un interaction adapter: entrevista, interpreta y
  explica, pero no debe convertirse en un segundo write boundary.
- CRM, AIKount, campañas y Twenty Workflows conservan límites y ownership
  separados. CRM Core y AIKount son domain kernels; campañas y workflows son
  capabilities especializadas. El bridge CRM–AIKount coordina; no fusiona
  fuentes de verdad.
- La metadata descubierta sirve para validar. No concede autorización ni
  habilita CRUD automáticamente.
- Los agentes pueden interpretar, planificar y revisar. Los side effects del
  target architecture pertenecen a policy enforcement y workers
  deterministas.
- `yarn crm:ops` es la front door local actual. Los demás entrypoints son
  superficies de compatibilidad y no prueban que sus capabilities estén
  implementadas detrás del router.

## Seguridad y modos

- Empezar en `read_only` o `dry_run`. No convertir una petición de análisis,
  auditoría, explicación o planificación en una mutación.
- No ejecutar writes live salvo que la tarea los incluya de forma inequívoca,
  la capability esté permitida para ese entorno y se cumplan todas las gates
  vigentes del entrypoint. En el target, todo write de producción requerirá un
  plan vigente y una aprobación cuyo `approvedPlanHash` coincida.
- Mientras la aprobación ligada al plan no esté implementada, no describir
  flags legacy como `--yes` como equivalentes a ese control.
- `destructive`, `metadata_write` y activación o ejecución productiva de
  workflows permanecen `denied` para la nueva front door hasta una spec que
  cambie expresamente la política.
- `external_send`, efectos contables y write-back cross-domain requieren gates
  separadas; nunca se deben agrupar bajo una confirmación genérica.
- No realizar writes directos a bases de datos, no saltarse adapters mediante
  llamadas ad hoc y no introducir secretos, tokens, payloads sensibles o PII
  innecesaria en prompts, logs, specs u outputs.
- Resolver personas, compañías, oportunidades, documentos, workspaces y
  entornos de forma inequívoca. Ante ambigüedad, bloquear y producir evidencia
  de qué falta.

El modelo de riesgo es multidimensional. Como mínimo, revisar `effects`,
`domainSpan`, `dataClasses`, `reversibility`, `approvalTier`, `environment` y
`scopeLimits`; no reducir la decisión a una sola etiqueta de seguridad.

## Fallback y fallo seguro

- Fallar cerrado ante capability desconocida, schema o contrato inválido,
  entorno ambiguo, evidencia obsoleta, límites ausentes o discrepancia entre
  plan y aprobación.
- El router solo acepta handoffs versionados, modes `read_only` o `dry_run`, y
  solo dispone del worker `report.crm.export` en
  `read_only/test`. `apply`, sandbox y production deben bloquearse antes de
  cualquier adapter.
- El PEP de Gate 008 solo puede ejecutar workers que se inyecten en su mapa
  estático; la construcción real por defecto no contiene ninguno. Todo apply
  debe conservar plan/hash/approval/preconditions/idempotencia exactos y falla
  cerrado ante drift o outcome desconocido.
- No improvisar una ruta directa si falta un adapter, una credencial o una
  capability. Proponer el hueco como trabajo futuro.
- No degradar silenciosamente desde la front door a un script legacy. Un
  entrypoint de compatibilidad solo puede usarse si la tarea lo selecciona y se
  respetan su contrato y sus controles actuales.
- En partial failures cross-domain, conservar evidencia por operación y no
  asumir transacción distribuida. Todo write-back se planifica como operación
  independiente.
- Los retries con side effects solo son admisibles cuando la idempotencia esté
  demostrada para esa capability.

## Specs y gobierno del conocimiento

- `03_specs/README.md` define el lifecycle de specs. Durante la transición, el
  campo `Status` es autoritativo; la ubicación en `03_specs/now/` no lo es.
- Solo una spec de este programa puede estar `in_progress` a la vez.
- Las specs 002–004 permanecen físicamente en `now/` por compatibilidad con
  rutas consumidas por runtime o documentación legacy. No moverlas ni
  renombrarlas sin migrar y probar antes esos consumidores.
- Un documento supersedido se conserva como historia, incluye enlace al canon
  nuevo y deja de gobernar decisiones nuevas.
- Usar `shared/knowledge/skilland-crm-ops/knowledge-governance.md` para
  metadata, precedencia, evidencia y frescura.
- Preservar los cambios no relacionados del worktree. No normalizar, mover ni
  reescribir archivos fuera del alcance de la spec activa.

## Reglas de verificación

- Validar documentos machine-readable contra sus schemas y resolver todos los
  `$ref` locales.
- Ejecutar primero checks y tests no mutantes, proporcionales al riesgo.
- Nunca usar una prueba live como verificación implícita. Una prueba externa
  necesita alcance y autorización explícitos.
- Informar por separado: realidad observada, inferencias, decisiones objetivo,
  unknowns y trabajo diferido.

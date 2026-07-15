# Modelo de seguridad y aprobación

- Status: active
- Owner: Skilland CRM Ops architecture
- Canonical for: clasificación de riesgo, autorización, enforcement y tratamiento de fallos de `Skilland CRM Ops`
- Last verified: 2026-07-13
- Supersedes: modelo de safety profile único de shared/knowledge/skilland-ops/
- Superseded by: none

## 1. Propósito

Este documento define cómo el sistema decide si una operación puede
planificarse, simularse o ejecutarse. El modelo separa tres conceptos que no
deben confundirse:

- **risk classification:** qué efectos y exposición tendría el plan;
- **approval:** qué persona autorizó exactamente qué plan y durante cuánto
  tiempo;
- **enforcement:** qué comprobación determinista permite o bloquea al worker.

Un agente puede ayudar a clasificar o explicar el riesgo, pero su opinión no es
una autorización. La policy machine-readable y el enforcement point son
autoritativos para `apply`.

## 2. Postura base

- `read_only` y `dry_run` son los modos de partida.
- `apply` siempre es explícito; nunca se deduce de lenguaje natural.
- La política falla cerrada ante valores desconocidos o inconsistentes.
- No existen writes directos a base de datos.
- Una identidad de agente, skill o pack no concede permisos por sí misma.
- La metadata valida una operación; el capability registry decide si está
  habilitada.
- Toda mutation productiva sobre un sistema externo requiere una aprobación
  humana ligada al plan.
- El worker ejecuta exactamente el scope aprobado o no ejecuta nada.
- Secrets, tokens, cookies y credenciales quedan fuera de requests, planes,
  approvals, results, logs y ejemplos.

Phase 0.5 documentó este modelo. Gate 007 habilita únicamente
`report.crm.export/read_only/test`, con lectura externa query-only y un
artefacto local create-only acotado. Gate 008 implementa hashing, PDP,
approval, PEP, preconditions e idempotencia in-memory con workers fake, pero no
habilita external writes. Sandbox/production quedan bloqueados porque aún no
existe retención ejecutable para ese artefacto con PII. El registry no tiene
ninguna capability `apply_guarded` y el mapa real de workers está vacío.

## 3. Riesgo multidimensional

El antiguo `safetyProfile` escalar mezclaba efecto, dominio y severidad. Se
sustituye por dimensiones independientes. Un plan puede tener varios valores
simultáneos; por ejemplo, un envío de factura puede ser:

```text
effects: [erp_write, external_send]
domainSpan: cross_domain
dataClasses: [commercial, pii, accounting]
reversibility: irreversible
environment: production
approvalTier: two_stage
```

### 3.1 `effects`

| Valor | Significado |
| --- | --- |
| `local_write` | crea o modifica un artefacto en un path local allowlisted |
| `crm_write` | cambia records o activities en Twenty CRM |
| `erp_write` | cambia estado o documentos en AIKount |
| `metadata_write` | cambia schema, fields, views, filters, groups o metadata equivalente |
| `workflow_change` | crea, modifica, activa, desactiva o ejecuta automatización |
| `external_draft` | crea contenido persistente en un canal externo sin enviarlo |
| `external_send` | publica o envía contenido fuera del sistema local |
| `destructive` | elimina, destruye o realiza un cambio con pérdida durable de información |

Una operación de lectura no necesita inventar un efecto `read_only`: su modo y
la ausencia de efectos mutables expresan esa condición. `effects` describe el
efecto **pretendido** aunque `effectiveMode: dry_run` lo simule.

### 3.2 `domainSpan`

- `single_domain`: un único dominio de negocio y source of truth. Staging,
  logs o artefactos derivados en filesystem no añaden por sí solos otro
  dominio, aunque deben declarar `local_write`.
- `cross_domain`: coordina dos o más dominios de negocio, o combina un dominio
  con un canal externo de comunicación. Una frontera puede ser read-only y
  seguir contando; `external_draft` y `external_send` cruzan canal.

`cross_domain` no es sinónimo de “alto riesgo” por sí solo. Sí obliga a declarar
fronteras, correlación y tratamiento de resultados parciales.

### 3.3 `dataClasses`

| Valor | Incluye |
| --- | --- |
| `internal` | configuración y datos operativos no destinados al exterior |
| `commercial` | pipeline, propuestas, comunicaciones y condiciones comerciales |
| `pii` | identidad, contacto u otros datos personales |
| `accounting` | impuestos, importes, facturas, series y estado contable |

La clasificación es acumulativa. Que un record sea comercial no elimina su
posible condición de PII o accounting.

### 3.4 `reversibility`

- `reversible`: existe una reversión probada y acotada.
- `compensatable`: no puede deshacerse, pero existe una acción posterior que
  compensa el efecto sin borrarlo.
- `irreversible`: ni reversión ni compensación segura están demostradas.

La existencia teórica de un endpoint de restore no basta. La reversibilidad
debe estar probada para la capability y el entorno concretos.

### 3.5 `environment`

- `test`
- `sandbox`
- `production`

Un environment ambiguo se trata como `production` para calcular riesgo y como
inválido para ejecutar: hay que identificarlo antes de `apply`. El workspace,
tenant o cuenta target forma parte de las precondiciones y del hash del plan.
El envelope almacena esta dimensión una sola vez en
`CommonEnvelope.environment`; `Risk` no duplica un valor que pudiera divergir.

### 3.6 `approvalTier`

| Tier | Semántica |
| --- | --- |
| `none` | no exige aprobación de apply porque no hay efecto live autorizado |
| `operator` | aprobación de un operador para un cambio acotado y reversible |
| `owner` | aprobación del owner del dominio o canal afectado |
| `two_stage` | dos decisiones explícitas sobre el mismo plan: negocio/contenido y efecto/target |
| `denied` | ninguna aprobación puede habilitar el plan bajo la policy vigente |

`approvalTier` es un resultado de policy, no una etiqueta elegida por el
requester. La regla más restrictiva prevalece y `denied` es absorbente.

## 4. Política inicial

Esta tabla define mínimos; el registry puede endurecerlos, nunca relajarlos sin
una decisión versionada y tests.

| Condición | Tier mínimo | Reglas adicionales |
| --- | --- | --- |
| lectura o `dry_run` sin side effect | `none` | puede leer live solo si capability, identidad y environment lo permiten |
| `local_write` de artefacto nuevo en output allowlisted | `none` | path, formato y data class acotados; sin overwrite, executable bit ni cambio de configuración |
| `local_write` con overwrite o fuera del output allowlisted | `operator` o `denied` | policy específica; nunca permitido por una capability read-only externa |
| `crm_write` reversible y single-domain | `operator` | IDs o query determinista, diff, record limit y precondiciones |
| cualquier `erp_write` | `two_stage` inicialmente | documento e importe exactos; validar términos y luego el efecto ERP; idempotency key obligatoria cuando aplique |
| issue/share/send de documento | `two_stage` | además aplica la política de `external_send` cuando abandona AIKount |
| `external_draft` | `owner` | contenido, cuenta y destinatarios exactos; no implica permiso de envío |
| `external_send` | `two_stage` | aprobar contenido/audiencia y confirmar el envío sobre el mismo hash |
| CRM write-back originado en flujo cross-domain | `two_stage` | plan CRM independiente después del resultado del dominio origen |
| `pii` combinada con `crm_write`, `erp_write`, `external_draft` o `external_send` | subir al menos un tier | scope mínimo y evidencia redactada; un artefacto local allowlisted puede conservar `none` solo con path, acceso y retención acotados |
| `metadata_write` | `denied` inicialmente | solo una futura spec dedicada puede habilitar subsets |
| delete/destroy u otro `destructive` | `denied` inicialmente | nombrar la capability no la hace utilizable |
| workflow activation o production run | `denied` inicialmente | requiere gate de blast radius, kill switch y sandbox evidence |
| workflow draft aislado en test/sandbox | `owner` cuando se habilite | target allowlisted y ninguna activación implícita |

Durante los gates 006–008, los writes externos y cualquier `local_write`
distinto del artefacto create-only acotado de `report.crm.export` permanecen
bloqueados aunque la tabla muestre el tier que necesitarían en el futuro.

## 5. Ciclo request–plan–approval–result

### 5.1 Request

`OperationRequest` identifica requester, canal, repo, capability, entorno, modo
e input. No contiene instrucciones abiertas del tipo “haz lo necesario” para
un worker. La front door conserva el texto original como contexto seguro si es
útil, pero el planner debe convertirlo a operaciones tipadas.

### 5.2 Plan

El planner primero produce operaciones y precondiciones normalizadas como un
`PlanDraft`; no elige su propio tier. El PDP deriva riesgo y `approvalTier`, y
solo entonces un finalizer construye el `OperationPlan` inmutable y calcula el
hash. Ese plan congela:

- capability canónica y contract version;
- target environment/workspace;
- operaciones ordenadas y parámetros normalizados;
- precondiciones y metadata version/evidence relevante;
- riesgo calculado;
- scope limits;
- idempotency requirements;
- expiración;
- `planHash` reproducible.

También fija `registryVersion` y `policyVersion`, de modo que un cambio en la
allowlist o en policy no pueda reutilizar una aprobación anterior.

Gate 008 fija el hash como:

```text
sha256(
  UTF8("skilland-crm-ops/operation-plan/v1\n")
  + UTF8(canonicalJson(OperationPlan sin planHash))
)
```

`planHash` es el único campo excluido. Canonical JSON preserva arrays, ordena
keys por code units UTF-16, no normaliza Unicode y rechaza valores no JSON,
ciclos, prototypes exóticos y surrogates aislados. Los golden vectors están en
`scripts/skilland_crm_ops/policy/policy.test.mjs`.

### 5.3 Approval

`OperationApproval` liga `approver`, `decision`, `planId`, `approvedPlanHash`,
`allowedScope`, `approvalTier` y `expiresAt`. No se reutiliza entre planes,
environments o workspaces.

Para `two_stage` deben existir dos decisiones registradas contra el mismo hash:

1. **`business_content_approval`:** confirma datos, términos, contenido y
   audiencia;
2. **`effect_target_approval`:** confirma el efecto live, cuenta/workspace y
   scope inmediatamente antes de ejecutar.

En una operación gestionada por un único owner, ambas decisiones pueden
pertenecer a la misma persona mientras la policy no exija separación de
funciones, pero deben ser eventos distintos, fechados y no colapsables en un
único `--yes` genérico.

Gate 008 valida que las identidades declaradas sean humanas y que stages,
scope, environment, hash y vigencia coincidan. La autenticidad criptográfica o
procedencia organizativa de esas identidades requiere todavía un trust
provider; no se atribuye esa garantía al shape del envelope.

### 5.4 Result

`OperationResult` registra `effectiveMode`, estado, operaciones simuladas o
ejecutadas, evidencia redactada, warnings, errores, información parcial y
`nextActions`. Un resultado no altera por sí mismo otro dominio; puede alimentar
un request posterior correlacionado.

## 6. Policy Decision Point y Policy Enforcement Point

El Policy Decision Point (PDP) es determinista y no produce efectos. Calcula
`allow`, `require_approval` o `deny` desde:

- versión del registry y policy;
- lifecycle, `frontDoorReadiness` y `routingExposure` de la capability;
- requester y canal;
- mode, environment y workspace;
- todas las dimensiones de riesgo;
- scope y precondiciones.

`runtimeReadiness` describe únicamente entrypoints current/legacy y sirve como
evidencia de migración. No participa como permiso positivo de la front door;
así un script especializado que hoy admite `--apply` puede coexistir
honestamente con `frontDoorReadiness: denied` sin convertirse en bypass.

El Policy Enforcement Point (PEP) corre inmediatamente antes del worker y
revalida, como mínimo:

1. schema y contract version soportados;
2. capability canónica, enabled mode y environment allowlist;
3. policy version no invalidada;
4. `planHash` recalculado e idéntico al aprobado;
5. approval tier, decisiones, identidad, expiración y scope;
6. precondiciones, target IDs y límites todavía válidos;
7. idempotency key y estado de ejecuciones anteriores;
8. ausencia de secretos en el envelope;
9. worker exacto allowlisted para la capability.

Si una comprobación falla, el PEP devuelve un resultado bloqueado con razón
estructurada. No pide al agente que “decida si parece seguro”.

## 7. Invalidación y replanificación

Requieren un plan nuevo y dejan sin valor approvals anteriores:

- cualquier cambio en operaciones, orden o payload;
- target, workspace, environment o cuenta distintos;
- ampliación de records, destinatarios, importes o límites;
- precondición vencida o metadata incompatible;
- cambio de capability o contract version;
- policy update que eleve el tier o deniegue la operación;
- expiración del plan o de una aprobación.

Reducir scope también obliga a recalcular el hash; se puede emitir una nueva
aprobación, no editar la existente.

## 8. Límites de alcance

`apply` se deniega si `scopeLimits` está ausente. Según el efecto debe incluir
límites como:

- número máximo y IDs de records;
- objetos y fields permitidos;
- importe, moneda y documento;
- destinatarios, dominio, cuenta remitente y máximo de mensajes;
- workflow y máximo de records/runs afectados;
- paths locales, política de overwrite y tamaño de artefacto.

El contrato base representa esos ejes con counts y, cuando proceda,
`recordIds`, `resourceTypes`, `fieldNames`, `documentIds`, `recipientRefs`,
`senderAccountRef`, `maxAmountMinor`, `currency`, `workflowIds`,
`localPathPrefixes`, `allowOverwrite` y `maxArtifactBytes`. Los refs de
destinatario son identificadores opacos o hashes, no direcciones PII en claro.
Una capability puede añadir constraints más específicos dentro de sus
operaciones; siempre quedan cubiertos por `planHash` y por containment en el
scope aprobado.

Una query que pueda crecer entre plan y apply necesita snapshot de IDs o una
precondición que bloquee si cambia el conjunto. “Todos los que coincidan” no es
un scope válido para producción sin límite y evidencia explícitos.

Cada precondición identifica `sourceRef`, observación y vigencia, además de
`expectedVersion` o `expectedHash` cuando exista una señal comparable. Un texto
de evidencia ayuda a auditar, pero no sustituye esos campos estructurados para
detectar drift.

## 9. Idempotencia, retries y fallos parciales

- No hay retry automático de writes sin idempotencia demostrada.
- La misma `idempotencyKey` no puede autorizar un payload diferente.
- Un timeout posterior al envío se trata como outcome desconocido, no como
  fallo seguro que permita repetir. El result usa `failed` o `partial_failure`
  con issue explícita y reconciliación manual según las operaciones completadas.
- Los workers consultan el registro de ejecución antes de reintentar.
- Un cross-domain workflow produce un resultado por frontera. El éxito AIKount
  y fallo CRM se registra como parcial, no se oculta bajo un único booleano.
- La compensación es un plan nuevo, con policy y aprobación propias.
- Nunca se emula atomicidad distribuida con deletes o rollback no probado.

El store de Gate 008 es una referencia in-memory con reserva batch atómica en
un proceso, replay terminal, conflict, in-progress y outcome unknown. No es
durable, no coordina varios procesos y no autoriza un worker real; Gate 009
debe aportar un adapter durable antes del primer write.

## 10. Datos sensibles y evidencia

Los envelopes pueden referenciar un secret por identificador de configuración,
pero nunca transportar su valor. Antes de persistir evidencia se redactan:

- authorization headers, API keys, cookies y tokens;
- URLs firmadas o temporales;
- payloads completos cuando basten IDs, hashes o campos allowlisted;
- PII no necesaria para demostrar el resultado.

El JSON Schema aplica una denylist recursiva de nombres de clave sensibles como
guard estructural de primera línea. No es DLP completo: strings de evidencia,
errores y referencias también pasan por redaction determinista antes de
persistirse. Gate 007 cubre request, result y salida de adapters con tests
negativos; Gate 008 extiende la cobertura a plan, approval, audit events y
salida de workers fake.

La auditoría mínima conserva IDs de correlación, capability/version, actor,
plan hash, policy decision, approval IDs, effective mode, worker version,
timestamps y evidencia acotada. Si no se puede registrar esta evidencia, un
write no se declara exitoso.

## 11. Escenarios normativos

### Export CRM

`report.crm.export` lee CRM y escribe un artefacto local allowlisted. Se declara
`local_write`; no obtiene permiso para modificar CRM ni enviar el informe. Una
futura entrega por email es otra capability y otro plan.

### Manual review CRM

La conversación produce un plan de notes/tasks/Opportunity updates allowlisted.
El operador aprueba el diff exacto; el CRM worker ejecuta solo esos IDs. La
conversación nunca recibe el cliente de escritura.

### Presupuesto AIKount con write-back CRM

El flujo usa al menos dos planes correlacionados: uno AIKount y otro CRM creado
después de conocer el resultado real. La aprobación AIKount no autoriza el
write-back. Si la operación emite o envía un documento, usa `two_stage`.

### Campaña IA Mujeres

La vertical decide batch y contenido. Crear drafts y enviar son capabilities
distintas. El send requiere audiencia congelada y dos decisiones; el estado CRM
posterior es un plan separado. Un draft nunca se interpreta como consentimiento
para enviar.

### Workflow

Research, design y simulación no autorizan activation. Mientras activation esté
`denied`, ni owner approval ni un flag CLI pueden saltarse la policy.

## 12. Decisión de cierre seguro

Ante cualquier inconsistencia entre conversación, docs, registry, policy,
approval o estado live, prevalece la alternativa que no produce side effects.
El sistema devuelve el bloqueo y la información necesaria para replanificar;
no degrada silenciosamente la seguridad para completar la tarea.

## 13. Fuentes y evidencia

- `shared/contracts/skilland-crm-ops/operation-envelope.schema.json`
- `shared/contracts/skilland-crm-ops/capability-registry.schema.json`
- `shared/contracts/skilland-crm-ops/capability-registry.json`
- `shared/contracts/skilland-crm-ops/repo-handoff.schema.json`
- `scripts/skilland_crm_ops/router.test.mjs`
- `scripts/skilland_crm_ops/adapters/adapters.test.mjs`
- `scripts/skilland_crm_ops/policy/`
- `scripts/skilland_crm_ops/policy/policy.test.mjs`
- `scripts/crm_execution_crew/kernel/contracts.mjs`
- `scripts/crm_aikount_ops/kernel/contracts.mjs`
- tests locales de CRM Execution, CRM Manual Review y AIKount enumerados en la
  Spec 006 y su informe de cierre
- ADR-002 y ADR-004 de este directorio
- North Star commit `31c59d14b1802081e8e25026cff5d37a843db735`

Los contracts y tests Gate 008 demuestran el kernel offline. No demuestran
identidad confiable, persistencia durable, integración sandbox/live ni
autorización de las capabilities previstas para Gates 009–012.

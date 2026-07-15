# Skilland CRM Ops — Knowledge Governance

- Status: active
- Owner: Skilland CRM Ops architecture
- Canonical for: metadata, lifecycle, precedencia, evidencia y frescura del conocimiento operativo
- Last verified: 2026-07-13
- Supersedes: implicit Phase 0 documentation practices
- Superseded by: none

## Propósito

Este documento evita tres errores:

1. confundir una spec o arquitectura target con runtime implementado;
2. dejar que documentación antigua gobierne después de una decisión nueva;
3. usar evidencia caducada o incompleta como autorización para side effects.

La gobernanza cubre conocimiento y contratos del overlay Skilland. No modifica
la política de documentación propia de Twenty upstream.

## 1. Tipos de artefacto

| Tipo | Pregunta que responde | Ubicación principal |
| --- | --- | --- |
| Repo manifest | ¿Qué repo es, qué expone y dónde está su canon? | shared/contracts/skilland-crm-ops/repo-manifest.json |
| Contract/schema | ¿Qué shape e invariantes debe cumplir una interfaz? | shared/contracts/skilland-crm-ops/ |
| Capability registry | ¿Qué capabilities se conocen, quién las posee y con qué readiness/riesgo? | shared/contracts/skilland-crm-ops/capability-registry.json |
| ADR | ¿Qué decisión arquitectónica se aceptó y por qué? | shared/knowledge/skilland-crm-ops/decisions/ |
| Target document | ¿Cómo debe funcionar el sistema objetivo? | shared/knowledge/skilland-crm-ops/ |
| Procedure | ¿Cómo se realiza una tarea concreta de forma segura? | AGENTS.md, shared/agents/, shared/skills/, shared/orchestration/ |
| Spec | ¿Qué cambio está autorizado, con qué alcance y acceptance criteria? | 03_specs/ |
| Runtime/test | ¿Qué está implementado y qué comportamiento verifican las pruebas? | package.json, scripts/, código y tests |
| Evidence/output | ¿Qué se observó o ejecutó en un momento concreto? | 04_outputs/ |
| Audit | ¿Qué análisis se realizó sobre un estado fechado? | 04_outputs/ y reports dedicados |

No existe una única fuente que responda correctamente a todas estas preguntas.
La precedencia depende del tipo de claim.

## 2. Metadata obligatoria

Todo documento canónico nuevo bajo shared/knowledge/skilland-crm-ops debe
incluir, inmediatamente después del título:

- Status
- Owner
- Canonical for
- Last verified
- Supersedes
- Superseded by

Semántica:

| Campo | Regla |
| --- | --- |
| Status | Usa el lifecycle documental definido abajo; no reutiliza el status de runtime readiness. |
| Owner | Rol o componente responsable de revisión, no el nombre incidental de una sesión. |
| Canonical for | Claim acotado y único. Debe permitir detectar solapamientos con otro canon. |
| Last verified | Fecha ISO YYYY-MM-DD en que contenido y fuentes fueron comprobados, no fecha de edición cosmética. |
| Supersedes | IDs o paths gobernados anteriormente; usar none cuando no aplique. |
| Superseded by | Sucesor canónico; usar none mientras siga vigente. |

Además, todo canon debe contener una sección Sources o Evidence que identifique
paths locales, commits externos o pruebas suficientes para sus claims.
Referenciar una rama mutable sin SHA no fija evidencia cross-repo.

Los schemas y JSON no usan un header Markdown. Deben expresar versión,
identidad y links canónicos en los campos definidos por su schema, y quedar
referenciados desde el README canónico.

## 3. Lifecycle documental

| Status | Autoridad | Requisitos |
| --- | --- | --- |
| proposed | No gobierna implementación. Es una propuesta revisable. | Owner, alcance y preguntas abiertas explícitos. |
| accepted | La decisión fue aceptada, pero todavía puede no ser la vista integrada activa. | Decision record y consecuencias cerradas. |
| active | Canon vigente para el alcance declarado. | Fuentes verificadas, sin canon activo solapado y enlaces desde README/manifest. |
| superseded | Conserva historia; no gobierna decisiones nuevas. | Superseded by no vacío y compatibility pointer cuando exista una ruta legacy. |
| archived | Evidencia histórica sin valor como entrada operativa por defecto. | Contexto temporal y motivo de archivo. |

Transiciones normales:

~~~text
proposed -> accepted -> active -> superseded -> archived
~~~

Un ADR puede pasar de proposed a accepted y permanecer accepted mientras su
decisión siga incorporada en documentos active. Un target document integrado
usa active. No se reactiva un artefacto superseded: se crea una revisión nueva
que lo referencia.

Para un mismo valor de Canonical for solo puede existir un documento active.
Si dos documentos parecen solaparse, el owner debe acotar sus claims o
superseder uno antes de completar la spec.

El lifecycle de specs es distinto y está definido en 03_specs/README.md.

## 4. Precedencia por pregunta

### 4.1 Estado y comportamiento actual

Para responder qué existe o qué hace el sistema hoy:

1. estado live reciente y explícitamente observado, cuando la pregunta depende
   de un sistema externo;
2. runtime inspeccionado más tests ejecutados;
3. contratos realmente consumidos por ese runtime;
4. README, agentes, skills y auditorías.

Una spec completed aumenta la trazabilidad, pero no reemplaza inspección ni
test. Un output live solo prueba el estado en su timestamp y entorno; no
demuestra por sí solo que todo el runtime siga igual.

### 4.2 Contratos públicos y machine-readable

Para shapes, campos, enums e invariantes:

1. schema activo bajo shared/contracts/skilland-crm-ops/;
2. instancia canónica que valida contra ese schema;
3. ejemplos validados;
4. explicación humana del documento target.

Si prose y schema divergen, el schema gobierna al consumidor y la divergencia
es un defecto que debe corregirse antes del gate. El schema nunca autoriza una
capability por sí solo; la autorización procede del registry y de policy.

### 4.3 Arquitectura objetivo

Para boundaries y decisiones target:

1. ADR accepted aplicable;
2. target document active que integra los ADRs;
3. migration roadmap active;
4. spec activa, solo para el delta autorizado.

Runtime legacy puede contradecir el target mientras exista migración. Esa
contradicción no invalida la decisión, pero debe declararse como current gap.

### 4.4 Procedimiento operativo

Para cómo ejecutar una tarea:

1. AGENTS.md más específico al path;
2. skill o agent procedure activo del dominio;
3. orchestration guide activa;
4. README del entrypoint exacto;
5. notas históricas.

El procedimiento no puede ampliar el permiso concedido por capability policy,
spec o usuario. Ante conflicto de seguridad se aplica la regla más restrictiva
y se registra el conflicto.

### 4.5 Historia y evidencia

Outputs, run logs, auditorías y specs superseded se interpretan con su fecha y
entorno. Son evidencia histórica inmutable: no deben editarse para reflejar la
arquitectura actual. Se añade un pointer o una revisión nueva.

## 5. Resolución de conflictos

No aplicar una precedencia universal. Clasificar primero el claim:

- current-state claim;
- contract claim;
- target-design claim;
- procedure claim;
- historical claim.

Después:

1. identificar las fuentes en conflicto y sus fechas/versiones;
2. elegir la precedencia de la sección anterior;
3. comprobar si el conflicto es en realidad current versus target;
4. registrar unknown si falta evidencia;
5. bloquear apply si el conflicto afecta identidad, environment, scope,
   capability, plan, approval o side effects;
6. corregir ambos lados en el mismo change set cuando schema y proyección
   humana diverjan.

Nunca resolver un conflicto inventando que el estado actual ya cumple el
target. Nunca usar documentación legacy para rebajar una gate activa.

## 6. Evidencia mínima por claim

| Claim | Evidencia mínima |
| --- | --- |
| implemented | Path de runtime y entrypoint/símbolo identificable. |
| tested | Test path, nivel de test y resultado fechado. |
| live_verified | Sistema/environment, timestamp y output redactado. |
| read_only | Inspección del camino completo que confirme ausencia de external writes; local_write se declara aparte. |
| dry_run | Test o ejecución controlada que demuestre que el modo no aplica operaciones. |
| supports_apply | Worker/adapter, policy gate, scope e idempotency behavior documentados y probados. |
| stable | implemented + maintained entrypoint + evidencia de test para el alcance exacto; no se infiere por antigüedad. |
| denied | Registry/policy explícitos y ausencia de fallback que permita el efecto. |

La falta de evidencia se representa como unknown. No usar none para disfrazar
que una afirmación no fue verificada.

Evidence entries del capability registry deben ser machine-readable y, como
mínimo, identificar `type`, `path`, `verifiedAt` y `claim`. Un link a un README
no basta como test evidence.

## 7. Frescura

Last verified indica el momento de la última comprobación, no una garantía
permanente. Se usan estas clases:

| Clase | Ejemplos | Regla de revalidación |
| --- | --- | --- |
| volatile | Live OpenAPI, metadata de Twenty, auth, workspace IDs, workflow state | Revalidar en la misma sesión antes de planear apply. Para análisis read-only, evidencia de más de 30 días se marca stale. |
| operational | Entrypoints, parsers, tests, capability readiness | Revalidar en cada gate y siempre que cambien paths de runtime o contratos. |
| architectural | ADRs, boundaries y ownership | Revisar al abrir cada nueva spec del programa o cuando cambie North Star/HomeLab. |
| historical | Outputs, auditorías y run reports | No caduca como historia, pero solo describe su timestamp y environment. |

Una fuente stale puede orientar investigación, pero no autorizar side effects.
Si revalidar exige una llamada live no autorizada, mantener unknown/stale y
limitarse a trabajo local.

Para doctrina cross-repo, fijar commit SHA. Un cambio en main no invalida
automáticamente el canon local, pero obliga a una revisión explícita antes de
afirmar alineación con la versión nueva.

## 8. Capability registry y proyecciones

capability-registry.json es el source of truth machine-readable para
capabilities. capability-catalog.md es su proyección explicativa para humanos.

Reglas:

- todo ID y alias debe resolverse una sola vez;
- un alias no tiene owner, executor, evidence ni contracts independientes;
- metadata discovery no modifica registry ni habilita operaciones;
- `lifecycleStatus` describe la vigencia semántica de la capability target;
- `runtimeReadiness` registra únicamente realidad current/legacy observada y
  nunca concede autoridad a la front door;
- `frontDoorReadiness` indica qué está realmente disponible detrás de
  `Skilland CRM Ops` en la gate vigente; Gate 007 habilita solo
  `report.crm.export/read_only/test` y Gate 008 no amplía esa disponibilidad:
  el resto se mantiene `not_implemented` o `denied`;
- `supportedModes`, `effects`, `approvalTier`, environment y scope expresan
  policy target, que se evalúa además de readiness y lifecycle;
- `routingExposure` distingue handoffs públicos de helpers `internal`; que un
  ID sea resoluble no significa que un caller externo pueda invocarlo;
- `semanticMaturity` y `testLevel` son ejes independientes de todos los
  anteriores;
- lastVerifiedAt pertenece a evidencia real, no a la fecha de redacción;
- registry y catálogo se actualizan en el mismo change set;
- si no existe generador todavía, el gate exige un check de paridad explícito;
- una discrepancia bloquea completar la spec.

## 9. Supersesión y compatibilidad

Superseder no significa borrar:

1. el documento anterior cambia a superseded o recibe un compatibility
   pointer en su directorio;
2. Superseded by identifica el successor;
3. el documento nuevo declara Supersedes;
4. enlaces canónicos del manifest y README apuntan al successor;
5. la historia no se reescribe para incorporar decisiones posteriores.

El directorio shared/knowledge/skilland-ops/ es un path legacy de Phase 0. Su
README es únicamente un compatibility pointer. target-architecture.md y
capability-catalog.md dentro de ese path pueden conservarse físicamente como
historia, pero no son inputs autoritativos para trabajo nuevo.

## 10. Excepciones legacy de specs

Los scripts IA Mujeres generan las specs 002–004 en rutas dentro de
03_specs/now/. Hasta migrar esos default paths:

- la ubicación física no representa lifecycle;
- su Status completed es autoritativo;
- no se mueven ni renombran;
- una ejecución legacy puede sobrescribirlas, por lo que no deben recibir
  metadata manual que el renderer no preserve;
- la futura retirada debe migrar productores, consumidores y tests en una
  misma spec.

La Spec 005 se conserva como antecedente superseded. Las Specs 006, 007 y 008
cerraron respectivamente foundation, router local y policy/approval kernel.
No hay spec activa; Gate 009 requiere una spec nueva antes del primer worker
CRM real.

## 11. Escritura y mantenimiento

- Narrativa en español; identifiers y nombres de contrato en inglés.
- No copiar secrets, access tokens, headers de auth o payloads con PII.
- Redactar identificadores live cuando no sean imprescindibles como evidencia.
- No editar outputs históricos para limpiar una contradicción; crear un nuevo
  análisis o redaction report.
- Toda decisión material debe vivir en un ADR, no solo en un chat o closure
  report.
- Todo documento active debe estar enlazado desde el README canónico o manifest.
- Los implementation reports registran resultado; no se convierten en target
  architecture.

## 12. Checklist de revisión

Antes de marcar un gate documental como completed:

- cada canon tiene metadata completa;
- no hay dos Canonical for activos y solapados;
- fuentes cross-repo incluyen commit SHA;
- current y target se distinguen explícitamente;
- unknowns no están expresados como hechos;
- claims de readiness tienen evidence;
- schemas, instancias, registry y Markdown son coherentes;
- paths legacy poseen pointers claros;
- no hay secrets ni PII innecesaria;
- Last verified refleja comprobación real;
- el closure report lista checks y desviaciones.

## 13. Fuentes y evidencia

- `AGENTS.md`
- `03_specs/README.md`
- `03_specs/now/006_skilland_crm_ops_phase0_5_foundation.md`
- `03_specs/now/007_skilland_crm_ops_thin_local_router.md`
- `shared/contracts/skilland-crm-ops/repo-manifest.json`
- `shared/contracts/skilland-crm-ops/capability-registry.json`
- `shared/contracts/skilland-crm-ops/operation-envelope.schema.json`
- `shared/contracts/skilland-crm-ops/repo-handoff.schema.json`
- `shared/knowledge/skilland-crm-ops/decisions/`
- auditoría del overhaul CRM del `2026-07-06`
- HomeLab commit `25cb94b2ed5482ca722cd76c8be71487ddba6aff`
- North Star commit `31c59d14b1802081e8e25026cff5d37a843db735`

Las fuentes cross-repo fijan la doctrina revisada; no prueban el estado live de
ningún sistema. Los contratos y tests locales deben revalidarse en cada gate.

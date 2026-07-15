# Skilland CRM Ops — conocimiento canónico

- Status: active
- Owner: Skilland CRM Ops architecture
- Canonical for: mapa de lectura y fuentes de la arquitectura operativa local de `skilland-crm`
- Last verified: 2026-07-13
- Supersedes: shared/knowledge/skilland-ops/
- Superseded by: none

## Propósito

Este directorio contiene la arquitectura objetivo del subharness operativo del
repositorio `skilland-crm`. Define cómo una petición ya encaminada a este repo se
convierte en una capability local, un plan verificable y, en fases futuras, una
ejecución controlada.

`Skilland CRM Ops` es una **front door local disponible por capability**. Gate
007 implementa el router y un único vertical: `report.crm.export` en
`read_only/test`. Gate 008 implementa el policy/approval kernel interno sin
añadir workers reales ni promover readiness. El resto del catálogo permanece
`not_implemented` o `denied` detrás de esta superficie aunque existan
entrypoints legacy. Sandbox y production quedan fuera hasta gobernar retención
del artefacto con PII.

No es el control plane global de Skilland ni sustituye a Hermes/HomeLab.
HomeLab/Hermes conserva el routing entre repositorios; como todavía no publica
un contrato global machine-readable, el `RepoHandoffRequest` v0.1 actual es
provisional, poseído por este repo y explícitamente migrable.

## Orden de lectura

1. [`target-architecture.md`](target-architecture.md): límites, capas, ownership
   y flujo end-to-end.
2. [`safety-and-approval-model.md`](safety-and-approval-model.md): riesgo,
   aprobación, enforcement y fallos.
3. [`knowledge-governance.md`](knowledge-governance.md): autoridad, precedencia,
   frescura y supersesión de conocimiento.
4. [`capability-catalog.md`](capability-catalog.md): proyección humana del
   capability registry.
5. [`migration-roadmap.md`](migration-roadmap.md): gates 006–013 y condiciones
   para avanzar.
6. [`decisions/`](decisions/): decisiones arquitectónicas aceptadas y sus
   consecuencias.

Los contratos y datos operativos machine-readable viven en
`shared/contracts/skilland-crm-ops/`. Para routing y validación, el
`repo-manifest.json`, el capability registry y los JSON Schemas tienen
precedencia sobre tablas o ejemplos narrativos. El catálogo Markdown debe
explicar ese registro, no competir con él.

## Mapa de autoridad

| Pregunta | Fuente autoritativa |
| --- | --- |
| ¿Qué sistema enruta globalmente? | `target-architecture.md` y ADR-001 |
| ¿Quién puede producir side effects? | `safety-and-approval-model.md` y ADR-002 |
| ¿Una capability está registrada y habilitada? | capability registry machine-readable |
| ¿Qué forma tiene request/plan/approval/result? | JSON Schemas bajo `shared/contracts/skilland-crm-ops/` |
| ¿Qué forma tiene el handoff actual? | `repo-handoff.schema.json`, con autoridad `skilland-crm-local` y status provisional |
| ¿Qué decisión arquitectónica prevalece? | ADR aceptado más reciente que superseda explícitamente al anterior |
| ¿Qué existe realmente hoy? | runtime inspeccionado, tests y evidencia fechada |
| ¿Qué se implementa a continuación? | spec activa y gate vigente del roadmap |

Una spec expresa intención y criterios de aceptación; por sí sola no prueba que
un comportamiento esté implementado. Una tabla Markdown tampoco habilita una
operación. Ante contradicción o falta de evidencia, el sistema falla cerrado y
registra el dato como `unknown`.

## Fuentes de la revisión

La fundación Phase 0.5 parte de:

- la auditoría del overhaul CRM del `2026-07-06`;
- la Spec 005 y los documentos Phase 0 que produjo;
- contratos, tests y entrypoints existentes de CRM Execution, CRM Manual
  Review, AIKount, IA Mujeres y Twenty Workflows;
- el manifiesto, semantic intersection y doctrina de meta-harness de HomeLab;
- los principios de North Star sobre especialización agentic y workers
  deterministas.

Las referencias externas deben fijarse a commit SHA en el inventario de la
Spec 006. Un enlace flotante a `main` sirve para navegar, no para demostrar qué
versión se revisó.

## Compatibilidad

El antiguo namespace `shared/knowledge/skilland-ops/` es histórico. Conserva:

- un `README.md` como puntero de compatibilidad hacia este directorio;
- `target-architecture.md` y `capability-catalog.md` como snapshots Phase 0,
  con metadata `superseded` y sin autoridad canónica.

Esos snapshots preservan la evidencia de cómo evolucionó la decisión; no pueden
presentarse como una segunda arquitectura activa ni recibir mejoras target.
`yarn crm:ops` es la front door local. Los demás comandos runtime permanecen
vigentes como compatibilidad hasta que gates posteriores aporten wrappers,
paridad y deprecación explícita; nunca son fallback silencioso del router.

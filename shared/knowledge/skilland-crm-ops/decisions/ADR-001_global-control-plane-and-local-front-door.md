# ADR-001 — Global control plane y local front door

- Status: accepted
- Owner: Skilland CRM Ops architecture
- Canonical for: frontera de routing entre HomeLab/Hermes y `skilland-crm`
- Last verified: 2026-07-13
- Supersedes: afirmación Phase 0 de que `Skilland Ops Orchestrator` es la puerta única global
- Superseded by: none

## Contexto

Phase 0 propuso `Skilland Ops Orchestrator` como superficie única para humanos,
Codex y Hermes. HomeLab, sin embargo, ya define a Hermes + Meta-Harness como el
control plane que identifica repositorios, coordina riesgo inter-repo y carga
subharnesses especializados. Mantener ambos como “puerta única” dejaría
ownership duplicado y routing recursivo.

El repo necesita una interfaz semántica estable para que HomeLab no descubra
scripts por nombre, pero esa interfaz no debe apropiarse de responsabilidades
globales.

## Decisión

Adoptar dos niveles explícitos:

1. **Hermes + HomeLab Meta-Harness** es el control plane global. Elige repo,
   prioridad, contexto y tratamiento del riesgo inter-repo. Entrega un
   `RepoHandoffRequest`.
2. **`Skilland CRM Ops`** es la front door local de `skilland-crm`. Valida el
   manifest, resuelve `capabilityId`, aplica policy del repo y devuelve contracts
   estructurados.

El nombre local definitivo es `Skilland CRM Ops`. No se utilizará `Skilland
Ops` sin el calificador CRM para describir esta frontera.

El `repo-manifest.json` es la interfaz de descubrimiento. Gate 007 materializa
la front door como `available`, pero la disponibilidad se decide por
`frontDoorReadiness`: solo `report.crm.export` está habilitada en `read_only`.
Gate 007 restringe además esa capability a environment `test`; producción
requiere primero una política ejecutable de retención para el artefacto con
PII. Los entrypoints legacy se conservan como compatibilidad.

HomeLab en el commit revisado no define todavía un `RepoHandoffRequest`
machine-readable. El contrato v0.1 implementado por Gate 007 es por ello
`provisional_local`, con autoridad `skilland-crm-local`; no se considera el
estándar global y deberá mapearse o supersederse cuando HomeLab publique uno.

## Invariantes

- El router global no llama adapters de Twenty, AIKount o Gmail directamente.
- El router local no decide routing o prioridades de otros repos.
- Un handoff no concede permiso de `apply`; aporta contexto e identidad.
- Los IDs globales de correlación se preservan en request, plan y result.
- Un acceso CLI directo durante la migración sigue sujeto a policy local.

## Consecuencias

### Positivas

- HomeLab puede descubrir este repo mediante un contrato pequeño y estable.
- Las capabilities cambian sin reenseñar al meta-harness los scripts internos.
- El riesgo inter-repo y el riesgo del dominio CRM se calculan en el nivel
  adecuado.
- Otros repos pueden adoptar su propia front door sin crear un monolito.

### Costes

- Hay que versionar la interfaz `RepoHandoffRequest` y el repo manifest.
- Correlación y errores deben sobrevivir a dos routers.
- La documentación debe evitar el término ambiguo “orquestador único”.

## Alternativas descartadas

- **CRM Ops como control plane global:** duplica HomeLab y acopla el CRM a toda
  la empresa.
- **Hermes invoca scripts directamente:** obliga a descubrir detalles internos
  y elude el capability registry.
- **Un único superagente para todos los repos:** mezcla policy, credenciales y
  dominios con blast radius innecesario.

## Verificación

Gate 007 prueba offline el slice
`RepoHandoffRequest -> repo manifest -> report.crm.export -> OperationResult`,
incluido alias canónico, artifact local acotado y bloqueo de capabilities
desconocidas, internas, no implementadas o de escritura. Las pruebas usan CRM
fake y filesystem temporal; no constituyen verificación live del workspace.

## Fuentes y evidencia

- HomeLab commit `25cb94b2ed5482ca722cd76c8be71487ddba6aff`, en
  particular el manifiesto MVP 1.0 y semantic intersection de Hermes.
- North Star commit `31c59d14b1802081e8e25026cff5d37a843db735`.
- `shared/knowledge/skilland-ops/target-architecture.md` como decisión Phase 0
  supersedida.
- `shared/contracts/skilland-crm-ops/repo-manifest.json` como materialización
  machine-readable de la frontera.
- `shared/contracts/skilland-crm-ops/repo-handoff.schema.json` como contrato
  inbound provisional.
- `scripts/skilland_crm_ops/router.test.mjs` como evidencia offline de Gate 007.

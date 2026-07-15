# Skilland Ops Phase 0 — Compatibility Pointer

- Status: superseded
- Owner: Skilland CRM Ops architecture
- Canonical for: compatibilidad de enlaces desde el path Phase 0
- Last verified: 2026-07-13
- Supersedes: none
- Superseded by: ../skilland-crm-ops/README.md

## Aviso

Este directorio ya no es la fuente de verdad para el overhaul.

Skilland Ops Orchestrator fue el nombre de trabajo de Phase 0. La revisión
arquitectónica Phase 0.5 lo sustituye por Skilland CRM Ops y distingue dos
niveles:

- Hermes + HomeLab Meta-Harness es el control plane global.
- Skilland CRM Ops es la front door local disponible por capability de este
  repo; Gate 007 solo habilita `report.crm.export/read_only/test`.

Para cualquier decisión o implementación nueva, empezar por:

1. ../../../AGENTS.md
2. ../skilland-crm-ops/README.md
3. ../../contracts/skilland-crm-ops/repo-manifest.json
4. ../../contracts/skilland-crm-ops/capability-registry.json

## Mapa de reemplazo

| Artefacto Phase 0 | Estado | Canon vigente |
| --- | --- | --- |
| target-architecture.md | Evidencia histórica superseded | ../skilland-crm-ops/target-architecture.md y sus ADRs |
| capability-catalog.md | Snapshot humano superseded | ../../contracts/skilland-crm-ops/capability-registry.json y ../skilland-crm-ops/capability-catalog.md |
| Safety Profile único | Modelo superseded | ../skilland-crm-ops/safety-and-approval-model.md |
| Spec 005 | Spec superseded | ../../../03_specs/now/006_skilland_crm_ops_phase0_5_foundation.md |

Los dos documentos Phase 0 se conservan físicamente para trazabilidad. No
deben editarse para incorporar decisiones Phase 0.5 ni usarse como fallback si
el canon nuevo carece de una capability.

## Regla de compatibilidad

Un enlace antiguo puede aterrizar en este directorio, pero ningún agente,
script futuro o decisión arquitectónica debe:

- presentar Skilland Ops Orchestrator como puerta global única;
- autorizar CRUD a partir de metadata descubierta;
- usar el safety profile único como policy;
- asignar side effects a un agente por su rol;
- interpretar statuses Phase 0 como runtime readiness actual.

Ante contradicción, preservar este material como historia y seguir el canon
bajo shared/knowledge/skilland-crm-ops/ y
shared/contracts/skilland-crm-ops/.

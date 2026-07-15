# Gobierno de specs

- Status: active
- Owner: Skilland CRM Ops architecture
- Canonical for: spec lifecycle e índice de trabajo del repositorio
- Last verified: 2026-07-13
- Supersedes: none
- Superseded by: none

## Propósito

Este directorio registra intención, decisiones, alcance y criterios de
aceptación. Una spec no es evidencia suficiente de que algo exista en runtime:
la implementación se demuestra con código inspeccionado, tests y evidencia
fechada.

Durante la transición del overlay legacy al subharness `Skilland CRM Ops`, el
campo `Status` dentro de cada spec es la autoridad. La carpeta `now/` contiene
excepciones históricas y, por sí sola, no significa que una spec siga activa.

## Lifecycle

| Status | Significado | Transición permitida |
| --- | --- | --- |
| `draft` | La intención todavía está incompleta o contiene decisiones abiertas. | `ready_for_implementation`, `superseded` |
| `ready_for_implementation` | Alcance y criterios están cerrados; todavía no se ha iniciado implementación. | `in_progress`, `superseded`, `blocked` |
| `in_progress` | Es la spec activa y existe trabajo de implementación en curso. | `completed`, `blocked`, `superseded` |
| `completed` | Todos los criterios pasaron y existe evidencia de cierre. | `superseded` |
| `blocked` | Una dependencia externa o decisión explícita impide completar el trabajo. | `in_progress`, `superseded` |
| `superseded` | Se conserva como historia, pero otra spec es el canon para decisiones nuevas. | terminal |

Reglas:

- Solo una spec del programa `Skilland CRM Ops` puede estar `in_progress`.
- Cambiar a `completed` exige verificar todos sus acceptance criteria y enlazar
  el implementation report correspondiente.
- `superseded` exige identificar `Superseded by` y conservar el contenido
  histórico; no se reescribe la spec antigua como si hubiera tomado las
  decisiones nuevas.
- Un fichero generado por runtime no debe usarse como tracker activo. Antes de
  moverlo o renombrarlo hay que migrar el consumidor y probar la nueva ruta.
- Las fechas registran verificación o transición, no sustituyen evidencia.

## Índice actual

| Spec | Status autoritativo | Papel actual | Regla física |
| --- | --- | --- | --- |
| `002_ia_mujeres_crm_import.md` | `completed` | Output histórico generado por los imports IA Mujeres. | Retener en `now/`: `ia_mujeres_crm_import.mjs` y su variante v2 escriben esta ruta por defecto. |
| `003_ia_mujeres_crm_workflows.md` | `completed` | Output histórico generado por el implementador legacy de workflows. | Retener en `now/`: `ia_mujeres_crm_workflows_v1.mjs` escribe esta ruta por defecto. |
| `004_ia_mujeres_crm_smoke_test.md` | `completed` | Output histórico generado y consumido por el smoke test legacy. | Retener en `now/`: el script escribe esta ruta y la guía de orquestación la referencia. |
| `005_skilland_ops_phase0_canonical_docs.md` | `superseded` | Fundación Phase 0 y antecedente trazable. | Retener; la Spec 006 sustituye su arquitectura como canon. |
| `006_skilland_crm_ops_phase0_5_foundation.md` | `completed` | Architecture Foundation cerrada con contratos, canon y evidencia de verificación. | Retener como gate 006 trazable; el closure report está bajo `04_outputs/skilland_crm_ops_architecture/`. |
| `007_skilland_crm_ops_thin_local_router.md` | `completed` | Router local fail-closed y vertical `report.crm.export/read_only/test`. | Retener como gate 007 trazable; el closure report está bajo `04_outputs/skilland_crm_ops_router/`. |
| `008_skilland_crm_ops_policy_approval_kernel.md` | `completed` | Hashing, PDP/PEP, approvals e idempotencia sin habilitar writes reales. | Cerrada con 24 tests policy; ninguna readiness de apply fue promocionada. |

No hay una spec `in_progress` tras cerrar Gate 008. Gate 009 permanece
`not_started` y requiere una spec nueva antes de cualquier implementación.

## Excepción legacy 002–004

Las specs 002–004 permanecen en `03_specs/now/` porque scripts legacy las
generan o actualizan en esas rutas exactas. Moverlas ahora rompería defaults y
podría provocar que una ejecución posterior recreara silenciosamente los
ficheros antiguos.

La retirada de esta excepción requiere una spec futura que:

1. cambie los default paths de todos los productores y consumidores;
2. convierta estos outputs generados en artefactos bajo `04_outputs/` o en otra
   ubicación explícitamente gobernada;
3. añada tests de compatibilidad para los nuevos paths;
4. confirme mediante `rg` que no quedan referencias a las rutas anteriores;
5. mueva los documentos solo después de completar esos pasos.

Hasta entonces, `completed` sigue siendo su estado real aunque estén dentro de
`now/`.

## Evidencia de cierre

Cada nueva spec debe definir:

- entregables concretos;
- cambios fuera de alcance;
- interfaces o contratos afectados;
- verificaciones no mutantes y tests relevantes;
- ubicación del implementation report;
- unknowns y trabajo deliberadamente diferido.

El informe de cierre debe distinguir archivos creados, fuentes consultadas,
decisiones, verificaciones ejecutadas y cualquier criterio no satisfecho. Si
queda un criterio requerido sin pasar, el status no puede ser `completed`.

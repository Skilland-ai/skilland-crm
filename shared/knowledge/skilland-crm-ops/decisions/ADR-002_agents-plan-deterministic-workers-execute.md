# ADR-002 — Agents plan; deterministic workers execute

- Status: accepted
- Owner: Skilland CRM Ops architecture
- Canonical for: ownership de side effects y separación agent/worker
- Last verified: 2026-07-13
- Supersedes: concepto Phase 0 de un execution agent como write boundary
- Superseded by: none

## Contexto

El runtime actual usa nombres como planner, safety reviewer, executor u
operator. Algunos componentes agentic son wrappers deterministas; otros pueden
usar razonamiento para entrevistar o preparar planes. Usar el nombre o rol de
un agente como autorización de escritura hace difícil demostrar qué se aprobó,
impide enforcement uniforme y permite que lógica improvisada llegue a sistemas
live.

Las operaciones críticas necesitan flexibilidad para interpretar intención y
determinismo para producir efectos.

## Decisión

Los agentes pueden:

- interpretar intención;
- recabar evidencia y preguntar por datos ausentes;
- seleccionar capabilities candidatas;
- producir o revisar un `OperationPlan`;
- explicar riesgo, policy decisions y resultados.

Los agentes no pueden:

- poseer credenciales de escritura como parte de su envelope;
- ampliar scope durante ejecución;
- ejecutar directamente CRM, ERP, Gmail, workflow o filesystem writes;
- reemplazar una policy decision con razonamiento libre;
- considerar un “sí” conversacional como aprobación no ligada al plan.

Solo un **deterministic worker**, detrás de un **Policy Enforcement Point**,
puede producir side effects. El worker recibe operaciones tipadas y acotadas;
no recibe intención abierta. Los infrastructure adapters obtienen credenciales
por configuración segura, no desde el agente.

## Flujo de autoridad

```text
agent/planner -> immutable OperationPlan
policy engine -> required approval or deny
human -> plan-bound OperationApproval
deterministic PEP -> revalidation
deterministic worker -> exact bounded effect
adapter -> external system
```

La autoridad dura una invocación acotada. Si cambia plan, scope, environment,
precondición o policy, se replanifica y se aprueba de nuevo.

## Consecuencias

### Positivas

- Se puede demostrar `no-write-without-approval` con tests deterministas.
- Los canales conversacionales evolucionan sin multiplicar write paths.
- Policy, idempotencia, redaction y audit evidence se aplican igual a todos los
  dominios.
- Un fallo del agente produce como máximo un plan inválido y bloqueado, no una
  mutación arbitraria.

### Costes

- Hay que diseñar contracts tipados y workers más pequeños.
- Las operaciones no representables deben bloquearse en vez de improvisarse.
- Los entrypoints legacy necesitarán wrappers antes de converger en esta
  frontera.

## Alternativas descartadas

- **Agente executor como única frontera:** su rol no prueba que payload y scope
  sean los aprobados.
- **Cada pack escribe con sus propias reglas:** duplica policy e impide una
  auditoría consistente.
- **Aprobación humana seguida de ejecución libre:** permite plan drift después
  del consentimiento.

## Verificación

Gate 008 implementa el PEP y sus tests adversariales. Approval ausente o
expirada, hash/policy drift, scope ampliado, precondición pendiente/expirada o
drifted, worker ausente e idempotencia conflictiva bloquean con cero
invocaciones. Solo workers fake inyectados llegan a ejecutar; el mapa por
defecto está vacío.

## Fuentes y evidencia

- North Star commit `31c59d14b1802081e8e25026cff5d37a843db735`,
  principios sobre workers deterministas para acciones críticas.
- `scripts/crm_execution_crew/` y `scripts/crm_aikount_ops/`, inspeccionados como
  baseline de separación planner/reviewer/executor.
- `shared/contracts/skilland-crm-ops/operation-envelope.schema.json`.
- `shared/knowledge/skilland-crm-ops/safety-and-approval-model.md`.
- `scripts/skilland_crm_ops/policy/pep.mjs`.
- `scripts/skilland_crm_ops/policy/policy.test.mjs`.

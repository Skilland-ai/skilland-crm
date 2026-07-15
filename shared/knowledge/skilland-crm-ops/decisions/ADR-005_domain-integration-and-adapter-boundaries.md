# ADR-005 — Límites de dominio, integración y adapters

- Status: accepted
- Owner: Skilland CRM Ops architecture
- Canonical for: ownership de CRM, AIKount, campañas, workflows, reporting e infraestructura
- Last verified: 2026-07-13
- Supersedes: clasificación Phase 0 uniforme de todas las áreas como packs equivalentes
- Superseded by: none

## Contexto

Phase 0 enumeró CRM Core, CRM Conversation, Workflows, AIKount, CRM–AIKount,
IA Mujeres y Reporting como packs hermanos. La lista era útil para inventariar,
pero mezclaba tipos distintos:

- canales de interacción;
- use cases de negocio;
- kernels con source of truth propio;
- workflows de integración;
- infraestructura transversal.

Esta mezcla dificulta decidir quién posee reglas, quién puede ejecutar y cómo
extraer componentes. El mayor riesgo es que una vertical o bridge termine con
clientes directos para varios sistemas y cree write paths alternativos.

## Decisión

Adoptar cinco tipos de componente y una capa transversal:

1. **Interaction adapters:** Hermes handoff, CLI y CRM Conversation.
2. **Application/use-case capabilities:** sales ops, manual review, campaign
   ops, document ops y reporting.
3. **Domain kernels:** CRM Core y AIKount ERP.
4. **Integration workflows:** CRM–AIKount y coordinaciones CRM–Gmail.
5. **Infrastructure adapters/workers:** Twenty, AIKount API, Gmail y filesystem.
6. **Policy/observability:** PDP, approval, PEP, correlation y audit evidence.

### CRM

CRM Core posee reglas y operaciones allowlisted sobre records, relations y
activities. Twenty adapter posee el transporte API. Metadata administration y
workflow automation quedan fuera del CRUD ordinario. Metadata mutations
pertenecen a `crm-metadata-admin`, un owner especializado y `denied` en esta
fase; leer metadata para validación sigue siendo responsabilidad de CRM Core.

### AIKount

AIKount es un kernel ERP/accounting separado. Permanece físicamente en este
repo por ahora, pero detrás de un port extraíble que no depende de tipos o
clientes internos CRM. Puede recibir contexto CRM read-only y devolver un
result; nunca escribe CRM.

### CRM–AIKount bridge

El bridge es un integration workflow, no un tercer domain kernel ni un permiso
compartido. Coordina planes independientes:

1. snapshot/read context;
2. AIKount plan/result;
3. optional CRM write-back plan creado desde evidencia del result.

Los planes comparten `correlationId`, pero cada uno conserva policy, approval,
idempotencia y worker. No se promete atomicidad distribuida.

### IA Mujeres y futuras campañas

La vertical conserva selección de batch, reglas de funnel, copy, estados de
campaña y reconciliación. No posee implementaciones genéricas de Gmail o CRM.
Crea requests/planes para esos adapters y procesa sus results.

Draft y send son capabilities distintas. La vertical no puede convertir el
permiso para un draft en permiso de envío ni escribir CRM como compensación
implícita.

### Twenty Workflows

Workflow research/design/implementation/test pertenece a una application
capability especializada con su propio worker y policy. Trigger, activation,
run y blast radius no se reducen a record mutations. CRM Core puede aportar
metadata o reads; no ejecuta workflow changes.

### Reporting

Reporting es read-only respecto a sistemas externos. Generar un artefacto local
declara `local_write`; entregarlo por email o canal externo es una capability
separada con `external_send`.

## Reglas de dependencia

```text
interaction -> application -> domain ports
application -> integration workflow -> domain ports
deterministic workers -> infrastructure adapters
policy/observability -> surrounds every worker invocation
```

- Domain kernels no importan interaction adapters.
- Application capabilities no importan SDK/clientes externos directamente.
- Integration workflows no reciben write clients multi-domain.
- Infrastructure adapters no contienen política de campaña o conversación.
- Policy no depende de narrativa libre; usa contracts y registry.

## Consecuencias

### Positivas

- Ownership y tests se alinean con fuentes de verdad.
- AIKount se puede extraer sin reescribir CRM Ops o el bridge contract.
- Campaign logic sigue siendo especializada sin duplicar infra.
- Partial failures cross-domain se vuelven visibles y compensables mediante
  planes nuevos.
- Reporting no adquiere permisos de envío accidentalmente.

### Costes

- Los use cases cross-domain requieren más de un request/plan/result.
- Hay que mantener ports y mapping layers explícitos.
- Algunas operaciones legacy deberán dividirse antes de migrar.

## Alternativas descartadas

- **Todos los packs al mismo nivel:** oculta dependencias y write ownership.
- **AIKount dentro de CRM Core:** mezcla accounting con CRM y dificulta
  extracción.
- **Bridge con clientes write de ambos dominios:** crea un superworker y una
  falsa transacción distribuida.
- **Campaign runner como dueño de CRM/Gmail:** perpetúa duplicación y policy
  divergente.
- **Reporting con envío implícito:** mezcla generación read-only con external
  effect.

## Verificación

Los Gates 010–012 deben incluir dependency checks o tests arquitectónicos que
impidan clientes de escritura en interaction/application/integration layers.
AIKount debe probarse mediante su port sin CRM runtime; campañas deben producir
planes, no mutaciones directas, para los casos migrados.

## Fuentes y evidencia

- `04_outputs/crm_agents_overhaul_audit/2026-07-06_crm_agents_overhaul_audit.md`.
- `shared/agents/crm-aikount-ops/orchestrator/AGENT.md`.
- `shared/agents/ia-mujeres-crm-operator/AGENT.md`.
- `shared/agents/twenty-workflows/README.md` y
  `shared/knowledge/twenty-workflows/`.
- `shared/orchestration/ia-mujeres-crm-gws/2026-06-08_how_to_use.md`.
- `shared/contracts/skilland-crm-ops/repo-manifest.json`.

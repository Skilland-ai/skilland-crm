# ADR-004 — Riesgo multidimensional y aprobación ligada al plan

- Status: accepted
- Owner: Skilland CRM Ops architecture
- Canonical for: risk classification y semántica de autorización de operaciones
- Last verified: 2026-07-13
- Supersedes: taxonomía Phase 0 de `safetyProfile` único y confirmación de proceso
- Superseded by: none

## Contexto

Las etiquetas Phase 0 (`standard_write`, `external_send`, `cross_domain`, etc.)
se modelaron como alternativas excluyentes. Una operación real puede cruzar
dominios, escribir ERP, enviar al exterior, incluir PII y ser irreversible al
mismo tiempo. Elegir una sola etiqueta oculta riesgo.

Asimismo, una confirmación genérica como `--yes` acredita intención de
continuar, pero no demuestra qué payload, records, destinatarios, workspace o
importe aprobó la persona. Si el plan cambia entre preview y apply, esa
confirmación deja de ser evidencia suficiente.

## Decisión

Clasificar cada plan mediante dimensiones independientes:

- `effects`
- `domainSpan`
- `dataClasses`
- `reversibility`
- `environment`
- `approvalTier`

La policy calcula el tier más restrictivo aplicable. Valores desconocidos,
dimensiones incompletas o una capability no registrada producen `denied`.

Toda aprobación de `apply` se liga a:

- `planId` y `approvedPlanHash`;
- approver e identidad verificable;
- environment/workspace;
- `allowedScope`;
- tier y decisión;
- expiración.

El PEP recalcula el hash y valida scope justo antes de ejecutar. Cualquier
cambio semántico exige un plan y approval nuevos.

El planner entrega operaciones normalizadas; el PDP calcula riesgo y tier; un
finalizer incorpora esa decisión y las versiones de policy/registry al plan
inmutable antes de calcular `planHash`. El planner no puede autoasignarse un
tier menor.

`two_stage` representa dos decisiones explícitas contra el mismo plan: validar
negocio/contenido y validar efecto/target. Mientras la policy no exija separación
de funciones, un mismo owner puede realizar ambas, pero nunca como un único
evento opaco.

## Política inicial

- Read-only y dry-run no autorizan side effects live en sistemas externos. Un
  artefacto local solo puede crearse si `local_write`, path y límites están
  declarados y allowlisted para esa capability.
- Todo write de producción requiere aprobación humana plan-bound.
- Cualquier `erp_write` en la policy inicial, los external sends y el CRM
  write-back cross-domain requieren `two_stage`.
- Metadata mutations, destructive effects y workflow activation permanecen
  `denied` hasta specs dedicadas.
- `scopeLimits` es obligatorio para apply.
- La regla más restrictiva gana; `denied` no puede superarse con más approvals.

Los detalles normativos están en
[`../safety-and-approval-model.md`](../safety-and-approval-model.md).

## Consecuencias

### Positivas

- La policy conserva todos los factores de riesgo relevantes.
- Preview y consentimiento se pueden relacionar criptográficamente.
- Scope expansion, plan drift y approval replay se bloquean de forma
  determinista.
- Es posible endurecer PII, accounting o production sin inventar nuevos perfiles
  combinatorios.

### Costes

- Se necesita canonicalización estable y golden vectors para `planHash`.
- UIs y CLIs deben mostrar y almacenar approvals estructuradas.
- Las migraciones desde `--yes` requieren compatibilidad cuidadosa; no basta con
  renombrar flags.

## Alternativas descartadas

- **Perfil escalar único:** pierde dimensiones y crece de forma combinatoria.
- **Approval por sesión o conversación:** permite reutilización y drift de
  scope.
- **Approval posterior al efecto:** solo crea auditoría, no control preventivo.
- **LLM como policy judge final:** no aporta reproducibilidad ni fail-closed
  verificable.

## Verificación

Gate 008 fija canonical JSON y el domain-separated SHA-256 con golden vectors.
Los tests demuestran hash mismatch, expiry, environment/scope mismatch,
identidad no humana, stages incoherentes, replay, policy drift y outcome
unknown. La verificación de procedencia de identidad y el store durable quedan
explícitamente diferidos.

## Fuentes y evidencia

- `shared/knowledge/skilland-ops/capability-catalog.md`, taxonomía escalar Phase
  0 supersedida.
- `scripts/crm_execution_crew/kernel/contracts.mjs` y
  `scripts/crm_aikount_ops/kernel/contracts.mjs`, confirmación baseline.
- `shared/contracts/skilland-crm-ops/capability-registry.schema.json`.
- `shared/contracts/skilland-crm-ops/operation-envelope.schema.json`.
- `shared/knowledge/skilland-crm-ops/safety-and-approval-model.md`.
- `scripts/skilland_crm_ops/policy/canonical-json.mjs`.
- `scripts/skilland_crm_ops/policy/approval.mjs`.
- `scripts/skilland_crm_ops/policy/policy.test.mjs`.

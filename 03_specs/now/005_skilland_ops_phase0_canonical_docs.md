# 005 - Skilland Ops Phase 0 Canonical Docs

- Status: superseded
- Date: 2026-07-06
- Owner: planning/spec session
- Implementer target: completed as historical Phase 0 documentation
- Last verified: 2026-07-13
- Superseded by: `006_skilland_crm_ops_phase0_5_foundation.md`

## Supersession notice

Esta spec se conserva como registro histórico de la decisión Phase 0 y de los
dos documentos que produjo. Ya no gobierna decisiones nuevas: la Spec 006
redefine el alcance como `Skilland CRM Ops`, separa el control plane global de
la front door local y sustituye los perfiles de seguridad y contratos
conceptuales por un foundation package machine-readable.

Los documentos creados por esta spec siguen siendo inputs trazables. El canon
vigente se encuentra bajo `shared/knowledge/skilland-crm-ops/` y
`shared/contracts/skilland-crm-ops/`. El contenido histórico que sigue a este
aviso no se reescribe retrospectivamente.

## Goal

Create the first canonical documentation layer for the Skilland Ops overhaul.

This phase must not change runtime behavior. It only creates source-of-truth
knowledge documents that future implementation sessions can follow without
rediscovering scripts or improvising architecture.

## Strategic Decision

Use one user-facing operational surface, but keep domain kernels separate.

The target model is:

```text
User / Codex / Hermes iAgent
        |
        v
Skilland Ops Orchestrator
        |
        +-- CRM Core Pack
        +-- CRM Conversation Pack
        +-- Twenty Workflows Pack
        +-- AIKount ERP Pack
        +-- CRM-AIKount Bridge Pack
        +-- IA Mujeres Campaign Pack
        +-- Export / Reporting Pack
```

AIKount must remain separate from CRM Core because it is the ERP/accounting
domain, uses a different API, has its own safety model, and should not be
treated as CRM CRUD. It should be invoked through Skilland Ops and connected to
CRM through a bridge.

## Files To Create

Create this directory if it does not exist:

```text
shared/knowledge/skilland-ops/
```

Create these files:

```text
shared/knowledge/skilland-ops/target-architecture.md
shared/knowledge/skilland-ops/capability-catalog.md
```

## Required Source Inputs

Read these files before writing the canonical docs:

```text
04_outputs/crm_agents_overhaul_audit/2026-07-06_crm_agents_overhaul_audit.md
package.json
scripts/crm_execution_crew/README.md
shared/agents/crm-execution-crew/README.md
shared/agents/crm-manual-update-crew/README.md
shared/agents/crm-aikount-ops/orchestrator/AGENT.md
shared/agents/ia-mujeres-crm-operator/AGENT.md
shared/agents/twenty-workflows/README.md
shared/skills/twenty-workflows/README.md
shared/knowledge/twenty-workflows/2026-06-07_api_mcp_capabilities.md
shared/orchestration/ia-mujeres-crm-gws/2026-06-08_how_to_use.md
```

If a listed file is missing, document that in the implementation summary and
continue with the available sources.

## `target-architecture.md` Requirements

This file must be the high-level architectural source of truth.

Include these sections:

1. Purpose
2. Non-goals
3. Core principles
4. Target topology
5. Pack responsibilities
6. Agent vs skill separation
7. Safety model
8. Runtime compatibility strategy
9. Migration phases
10. Acceptance criteria for the overhaul

Required content:

- Define `Skilland Ops Orchestrator` as the single user-facing operational
  surface for Codex, Hermes iAgent, and humans.
- State explicitly that it must not write directly to CRM, AIKount, Gmail, or
  workflow systems.
- Define CRM Core Pack as the future write boundary for all generic Twenty CRM
  mutations.
- Define CRM Conversation Pack as the future home of manual review, commercial
  interview flows, exports, and natural-language planning.
- Define Twenty Workflows Pack as a specialized CRM capability with separate
  safety gates for trigger blast radius and activation.
- Define AIKount ERP Pack as a separate domain pack.
- Define CRM-AIKount Bridge Pack as the cross-domain adapter that reads CRM
  context, invokes AIKount, and proposes CRM write-back through CRM Core.
- Define IA Mujeres Campaign Pack as a vertical campaign pack, not CRM Core.
- Define Export / Reporting Pack as read-only or report-generation capability.
- State that existing commands remain compatibility entrypoints until replaced
  by aliases or wrappers.
- State that destructive operations and metadata mutations may exist in the
  target capability model but must be disabled by default and require stronger
  confirmation.

## `capability-catalog.md` Requirements

This file must be operational and table-driven.

Include these sections:

1. Purpose
2. Status taxonomy
3. Safety profile taxonomy
4. Capability table
5. Legacy entrypoints
6. Migration notes
7. Open questions

Status taxonomy must include:

- `stable`
- `partial`
- `legacy`
- `target`
- `blocked`

Safety profile taxonomy must include:

- `read_only`
- `standard_write`
- `destructive`
- `metadata`
- `workflow`
- `external_send`
- `cross_domain`

The capability table must include, at minimum, these columns:

```text
Capability ID | Pack | Status | Safety Profile | Current Entrypoint | Current Contract | Target Contract | Notes
```

At minimum, catalog these capabilities:

- `crm.metadata.read`
- `crm.schema.introspect`
- `crm.record.search`
- `crm.record.get`
- `crm.record.create`
- `crm.record.update`
- `crm.record.delete`
- `crm.record.restore`
- `crm.record.destroy`
- `crm.relation.link`
- `crm.relation.unlink`
- `crm.activity.note.create`
- `crm.activity.task.create`
- `crm.activity.task.update`
- `crm.metadata.field.create`
- `crm.metadata.view.manage`
- `crm.workflow.research`
- `crm.workflow.design`
- `crm.workflow.implement`
- `crm.workflow.test`
- `crm.plan.validate`
- `crm.execution.apply`
- `crm.conversation.manual_review`
- `crm.export.chatgpt`
- `aikount.openapi.live`
- `aikount.document.interview`
- `aikount.operation.plan`
- `aikount.execution.apply`
- `aikount.file_container.manage`
- `bridge.crm_aikount.context`
- `bridge.crm_aikount.writeback.plan`
- `campaign.ia_mujeres.status`
- `campaign.ia_mujeres.batch.prepare`
- `campaign.ia_mujeres.drafts.create`
- `campaign.ia_mujeres.batch.send`
- `campaign.ia_mujeres.signals.sync`
- `campaign.ia_mujeres.tasks.reconcile`
- `campaign.ia_mujeres.weekly_report`
- `report.crm.export`

Catalog current commands/scripts where known:

- `yarn crm:execute`
- `yarn crm:review`
- `yarn crm:export`
- `yarn crm:aikount`
- `node scripts/ia_mujeres_operator_harness.mjs --action=...`

Mark capabilities honestly. Do not pretend target capabilities already exist.
For example:

- generic CRM CRUD across every Twenty object is `target` or `partial`, not
  `stable`;
- current `crm_execution_crew` is `partial`;
- current CRM manual review is `legacy` or `partial`;
- AIKount operations covered by current tests can be `stable` or `partial`
  depending on scope;
- workflow authoring should be `partial` unless implementation runtime is
  already wrapped behind a stable command;
- destructive CRM actions should be `target` or `blocked` unless safely
  implemented.

## Constraints

- Do not edit runtime code.
- Do not move existing files.
- Do not rename commands.
- Do not run live CRM, AIKount, Gmail, or workflow mutations.
- Do not add secrets.
- Prefer ASCII in new docs unless copying existing names that already contain
  non-ASCII.
- Keep docs actionable for an implementation agent.

## Verification

Run these checks:

```bash
test -f shared/knowledge/skilland-ops/target-architecture.md
test -f shared/knowledge/skilland-ops/capability-catalog.md
grep -n "Skilland Ops Orchestrator" shared/knowledge/skilland-ops/target-architecture.md
grep -n "CRM-AIKount Bridge" shared/knowledge/skilland-ops/target-architecture.md
grep -n "Capability ID" shared/knowledge/skilland-ops/capability-catalog.md
grep -n "crm.record.create" shared/knowledge/skilland-ops/capability-catalog.md
grep -n "aikount.execution.apply" shared/knowledge/skilland-ops/capability-catalog.md
grep -n "campaign.ia_mujeres.batch.prepare" shared/knowledge/skilland-ops/capability-catalog.md
```

Optional, if useful:

```bash
git diff -- shared/knowledge/skilland-ops/target-architecture.md shared/knowledge/skilland-ops/capability-catalog.md
```

## Deliverable Summary Required From Implementer

The implementer must report:

- files created;
- sources consulted;
- any missing source file;
- important judgement calls in status classification;
- verification commands run;
- confirmation that runtime code was not changed.

## Acceptance Criteria

This spec is complete when:

- both canonical docs exist;
- the architecture doc clearly defines one user-facing surface with separate
  domain packs;
- AIKount is explicitly separate from CRM Core and connected by bridge;
- the capability catalog includes current and target capabilities;
- statuses distinguish current reality from future target;
- old entrypoints are documented as compatibility surfaces;
- no functional runtime files were changed.

# Skilland Ops Target Architecture

> **Historical snapshot — superseded.** This Phase 0 document is preserved as
> evidence only. It is not an active architecture and must not authorize new
> work. The current canon is
> `shared/knowledge/skilland-crm-ops/target-architecture.md` together with its
> ADRs. See `shared/knowledge/skilland-ops/README.md` for the compatibility map.

- Status: `superseded`
- Owner: `Skilland CRM Ops architecture`
- Canonical for: `none; historical Phase 0 snapshot`
- Last verified: `2026-07-13`
- Supersedes: `none`
- Superseded by: `shared/knowledge/skilland-crm-ops/target-architecture.md`

## 1. Purpose

This document is the canonical high-level architecture for the Skilland Ops
overhaul. It freezes the Phase 0 decision: use one user-facing operational
surface for humans, Codex, and Hermes iAgent, while keeping the domain kernels
separate and auditable.

The target model is not a monolithic CRM agent. It is a catalog-driven
orchestrator that routes requests to packs with explicit contracts, safety
profiles, and write boundaries.

Source basis:

- `04_outputs/crm_agents_overhaul_audit/2026-07-06_crm_agents_overhaul_audit.md`
- `package.json`
- CRM execution, manual review, AIKount, IA Mujeres, and Twenty workflow
  repo-local agent and skill docs

## 2. Non-goals

- Do not change runtime behavior in this phase.
- Do not rename commands, move files, or replace existing scripts in this
  phase.
- Do not implement the future `Skilland Ops Orchestrator` runtime in this
  phase.
- Do not claim generic CRM CRUD is complete while current CRM execution is
  still scoped to a subset of Twenty objects and operations.
- Do not merge AIKount into CRM Core. AIKount is an ERP/accounting domain with
  a different API, source of truth, and safety model.
- Do not run live CRM, AIKount, Gmail, or workflow mutations as part of this
  documentation phase.

## 3. Core principles

- One user-facing surface: operational requests enter through the future
  `Skilland Ops Orchestrator` for Codex, Hermes iAgent, and humans.
- Separate domain kernels: CRM, workflows, AIKount, campaign operations, bridge
  logic, and reporting remain separate packs.
- No direct side effects from the top surface: the `Skilland Ops Orchestrator`
  must not write directly to CRM, AIKount, Gmail, or workflow systems.
- Catalog-driven routing: the orchestrator routes by capability id, current
  status, owner pack, safety profile, and allowed mode.
- Dry-run by default: apply requires explicit mode, safety review, and stronger
  confirmation when the operation is destructive, metadata-changing,
  workflow-activating, externally sending, or cross-domain.
- Compatibility first: existing commands remain compatibility entrypoints until replaced by aliases or wrappers.
- No hidden write paths: generic CRM mutations converge on CRM Core, AIKount
  mutations converge on AIKount ERP, and CRM write-back from AIKount goes
  through the CRM-AIKount Bridge and then CRM Core.

## 4. Target topology

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

The `Skilland Ops Orchestrator` is the single user-facing operational surface.
It understands intent, checks the capability catalog, requests missing
information, selects the owner pack, and consolidates the result. It does not
own low-level mutations and it does not bypass pack safety gates.

## 5. Pack responsibilities

### CRM Core Pack

CRM Core Pack is the future write boundary for all generic Twenty CRM mutations.

Responsibilities:

- read CRM metadata, object definitions, fields, options, and relations;
- introspect available GraphQL and REST operations;
- search, get, create, update, delete, restore, and destroy CRM records through
  a generic metadata-driven contract when supported and allowed;
- create and link notes and tasks as activity helpers;
- link and unlink relationships through validated relation helpers;
- manage metadata changes such as custom fields and views only under the
  metadata safety profile;
- expose a single audited CRM execution boundary for apply mode.

Current reality: `crm_execution_crew` is useful but partial. It supports a v1
subset such as opportunity create/update, task update/close, note/task creation,
and note/task target linking. It is not yet generic CRUD for every Twenty
object.

### CRM Conversation Pack

CRM Conversation Pack is the future home of manual review, commercial interview
flows, exports, and natural-language planning.

Responsibilities:

- preserve the useful supervised workflows from `crm_manual_update_crew`;
- interview users deal by deal when commercial context is ambiguous;
- convert natural-language CRM intent into planned CRM Core operations;
- generate read-only CRM exports and planning artifacts when no mutation is
  needed;
- avoid writing directly to CRM in the target architecture.

Current reality: `yarn crm:review` is a useful compatibility surface, but it
duplicates some CRM write behavior that should move behind CRM Core.

### Twenty Workflows Pack

Twenty Workflows Pack is a specialized CRM capability with separate safety gates for trigger blast radius and activation.

It also owns safety gates for workflow runs and external side effects.

Responsibilities:

- research current workflow API and auth constraints;
- design workflow topology, triggers, steps, edges, and isolation fields;
- implement workflow shells, draft versions, steps, edges, and positions
  through API-first paths when available;
- test drafts and runs in controlled scopes;
- block activation unless safety review and explicit approval are present.

Workflows must not be treated as simple CRM record CRUD. They can trigger broad
automation and need a distinct safety path.

### AIKount ERP Pack

AIKount ERP Pack is a separate domain pack, not a submodule of CRM Core.

Responsibilities:

- load live AIKount auth and OpenAPI contracts;
- load taxes, numbering, contacts, and other master data needed for planning;
- interview the user for missing quote or invoice data;
- plan quote, invoice, issue, share, send, and conversion operations;
- manage local registry and idempotency data;
- manage the AIKount file container for pending quote and invoice inputs;
- execute dry-run/apply with AIKount-specific confirmation rules.

AIKount must remain separate from CRM Core because it is the ERP/accounting
domain, uses a different API, has its own safety model, and should not be
treated as CRM CRUD.

### CRM-AIKount Bridge Pack

CRM-AIKount Bridge Pack is the cross-domain adapter between CRM and AIKount.

Responsibilities:

- read CRM context through CRM Core or a strict read-only CRM snapshot;
- build `AikountActionRequest` inputs from CRM context and user interview data;
- invoke AIKount ERP Pack for planning and execution;
- propose CRM write-back as a CRM Core operation plan;
- apply CRM write-back only through CRM Core and only after confirmation.

AIKount does not write CRM directly. CRM Core does not execute AIKount
operations directly. The bridge coordinates the cross-domain flow and keeps the
two sources of truth separate.

### IA Mujeres Campaign Pack

IA Mujeres Campaign Pack is a vertical campaign pack, not CRM Core.

Responsibilities:

- maintain IA Mujeres funnel rules, batch selection, payload generation, and
  campaign reporting;
- coordinate Gmail draft creation, approved sends, replies, bounces, and
  internal weekly report emails under explicit confirmation;
- keep Twenty CRM as the commercial state source;
- reconcile notes and tasks for the IA Mujeres campaign.

In the target architecture, standard CRM updates, notes, tasks, and fields from
IA Mujeres should be emitted as CRM Core operations. Gmail remains an external
channel with its own safeguards.

### Export / Reporting Pack

Export / Reporting Pack is the read-only or report-generation capability
surface.

Responsibilities:

- produce CRM exports for ChatGPT or implementation planning;
- generate campaign reports such as IA Mujeres weekly output;
- write local Markdown, HTML, JSON, or other artifacts under `04_outputs/`;
- avoid CRM, AIKount, Gmail, and workflow mutations unless a future report
  delivery capability explicitly requests an external send with confirmation.

## 6. Agent vs skill separation

Agents are decision and orchestration roles. They gather evidence, choose
capabilities, ask for missing information, review risk, and decide whether a
request can continue. Agents should not become places where runtime logic is
improvised.

Skills are callable capabilities with stable contracts. They perform focused
work such as metadata read, record search, CRM plan validation, AIKount
OpenAPI load, workflow safety review, or report generation.

Target separation:

- `Skilland Ops Orchestrator`: front door for humans, Codex, and Hermes iAgent.
- Capability router agent: classifies domain and selects capability ids.
- CRM planner and safety agents: prepare and gate CRM Core operations.
- CRM execution agent: the only generic CRM side-effect boundary.
- Workflow specialist agents: research, design, implement, and test workflows
  with workflow-specific gates.
- AIKount operator agents: own ERP planning and execution.
- CRM-AIKount bridge agent: coordinates CRM read context, AIKount execution,
  and CRM write-back planning.
- Campaign ops agents: own vertical campaign rules such as IA Mujeres.
- Audit QA agent: validates logs, outputs, and no-write-without-apply rules.

No specialist agent should write directly to a live system unless it is the
explicit execution boundary for its pack and the operation has passed the
relevant safety review.

## 7. Safety model

Default rules:

- dry-run is the default mode;
- apply must be explicit;
- human confirmation is required for writes beyond trivial scoped changes;
- no direct database writes;
- no secrets in logs;
- every apply path writes structured audit logs;
- ambiguous lookups block execution.

Destructive operations and metadata mutations may exist in the target
capability model, but they must be disabled by default and require stronger
confirmation.

Destructive CRM capabilities such as delete, restore, and destroy require:

- exact object and record ids;
- dry-run with proposed effect;
- explicit confirmation;
- strict record limits;
- rollback notes when the API supports recovery.

Metadata capabilities such as field creation, view management, filters, groups,
and workflow changes require the `metadata` or `workflow` safety profile. They
must not pass through the same review gate as a normal opportunity field
update.

External side effects require separate confirmation:

- Gmail draft creation and sends;
- AIKount issue, share, send, and accounting mutations;
- workflow activation or manual run when it can affect production records;
- report emails or other outbound delivery.

Cross-domain operations require two-stage review:

1. approve the external or ERP operation;
2. approve any CRM write-back as a separate CRM Core plan.

## 8. Runtime compatibility strategy

Existing commands remain compatibility entrypoints until replaced by aliases or wrappers.

Current compatibility entrypoints:

- `yarn crm:execute` -> `scripts/crm_execution_crew/harness.mjs`
- `yarn crm:review` -> `scripts/crm_manual_update_crew/harness.mjs`
- `yarn crm:export` -> `scripts/crm_manual_update_crew/export-para-chatgpt.mjs`
- `yarn crm:aikount` -> `scripts/crm_aikount_ops/harness.mjs`
- `node scripts/ia_mujeres_operator_harness.mjs --action=...`

Compatibility strategy:

- keep commands stable while the new pack contracts are introduced;
- wrap existing commands behind Skilland Ops only after equivalent target
  contracts exist;
- preserve dry-run defaults and apply confirmations;
- document capability status before routing new requests to a pack;
- deprecate historical scripts only after aliases and regression coverage prove
  parity.

## 9. Migration phases

### Phase 0 - Canonical docs

Create the target architecture and capability catalog. Do not change runtime.

### Phase 1 - CRM Core v2

Build metadata-driven CRM Core with generic object operations, schema
introspection, activity helpers, relation helpers, safety review, and logs.
Keep `crm_execution_crew` v1 as a compatibility wrapper.

### Phase 2 - Unify CRM writes

Refactor manual review and IA Mujeres CRM writes to emit CRM Core operation
plans. Keep the conversation and campaign logic in their packs.

### Phase 3 - Skilland Ops Orchestrator

Create the user-facing orchestrator, capability router, shared request/result
contract, and pack routing. Publish command aliases only when safe.

### Phase 4 - CRM-AIKount Bridge

Formalize read-only CRM context, AIKount planning/execution, and CRM write-back
planning as a cross-domain bridge with correlated logs.

### Phase 5 - Workflows under Skilland Ops

Route workflow research, design, implementation, testing, and activation
through the Twenty Workflows Pack with explicit blast-radius controls.

### Phase 6 - Controlled deprecation

Mark old docs and direct script entrypoints as legacy only after wrappers,
aliases, and tests prove equivalent behavior.

## 10. Acceptance criteria for the overhaul

The overhaul is complete when:

- a natural-language operational request enters through one user-facing
  `Skilland Ops Orchestrator`;
- the router consults a capability catalog instead of discovering scripts by
  filename;
- generic CRM writes go through CRM Core;
- CRM Core supports metadata-driven operations across supported Twenty objects;
- CRM Conversation does not write directly to CRM;
- AIKount remains a separate ERP pack;
- CRM-AIKount write-back is planned through the bridge and applied through CRM
  Core;
- IA Mujeres keeps campaign-specific logic while standard CRM mutations move to
  CRM Core;
- workflow authoring and activation are routed through the Twenty Workflows
  Pack with workflow-specific safety gates;
- Export / Reporting remains read-only unless an external delivery capability
  is explicitly confirmed;
- destructive, metadata, workflow, external-send, and cross-domain operations
  are disabled by default and require stronger confirmation;
- existing commands either still work or have clear aliases and wrappers;
- regression tests cover no-write-without-apply, metadata validation,
  destructive gates, workflow activation gates, bridge write-back, and routing.

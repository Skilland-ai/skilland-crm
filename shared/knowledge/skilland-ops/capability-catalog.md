# Skilland Ops Capability Catalog

> **Historical snapshot — superseded.** This Phase 0 table is preserved for
> traceability only. It is not a routing or policy source of truth. Use
> `shared/contracts/skilland-crm-ops/capability-registry.json` and its human
> projection at `shared/knowledge/skilland-crm-ops/capability-catalog.md`.

- Status: `superseded`
- Owner: `Skilland CRM Ops architecture`
- Canonical for: `none; historical Phase 0 snapshot`
- Last verified: `2026-07-13`
- Supersedes: `none`
- Superseded by: `shared/contracts/skilland-crm-ops/capability-registry.json`

## 1. Purpose

This catalog is the operational source of truth for Skilland Ops Phase 0. It
maps current scripts and docs to target pack-owned capabilities so future
implementation sessions can route requests without rediscovering entrypoints or
overstating current support.

The catalog intentionally distinguishes current implementation reality from the
target architecture. A capability can be present in a legacy script and still be
`partial` if it is not yet behind the target pack boundary.

## 2. Status taxonomy

| Status | Meaning |
| --- | --- |
| `stable` | Current repo has a maintained entrypoint or documented contract for the stated scope, with safe defaults or read-only behavior where applicable. |
| `partial` | Current repo supports only a subset, uses a non-final contract, is embedded in a legacy pack, or needs manual glue. |
| `legacy` | Current entrypoint is useful compatibility surface but should not remain the target owner. |
| `target` | Desired target capability is defined, but no current implementation should be treated as ready. |
| `blocked` | Current implementation intentionally blocks the capability or the safety contract is not sufficient for use. |

## 3. Safety profile taxonomy

| Safety Profile | Meaning |
| --- | --- |
| `read_only` | Reads live or local state and can write local reports, but must not mutate CRM, AIKount, Gmail, or workflows. |
| `standard_write` | Writes scoped business records after validation, dry-run, apply mode, and confirmation when required. |
| `destructive` | Deletes, restores, destroys, or otherwise reverses durable data. Disabled by default. |
| `metadata` | Creates or changes fields, views, filters, groups, schema, or other structural metadata. Requires stronger confirmation. |
| `workflow` | Creates, edits, runs, activates, or deactivates workflows. Requires blast-radius review and activation gates. |
| `external_send` | Sends or prepares externally visible communication, including Gmail sends, report emails, and AIKount issue/share/send flows. |
| `cross_domain` | Coordinates more than one system or source of truth, such as CRM plus AIKount or CRM plus Gmail. |

## 4. Capability table

| Capability ID | Pack | Status | Safety Profile | Current Entrypoint | Current Contract | Target Contract | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `crm.metadata.read` | CRM Core Pack | `partial` | `read_only` | `yarn crm:execute`; manual crew internals | Reads `/rest/metadata/objects` for validation in current CRM flows. | Pack skill returns object, field, option, and relation metadata for any supported Twenty object. | Current read exists, but it is embedded in v1 crews rather than exposed as a canonical pack capability. |
| `crm.schema.introspect` | CRM Core Pack | `target` | `read_only` | none | No canonical current capability found in required sources. | Introspect GraphQL and REST operations available for each object and action. | Needed before generic CRUD can be claimed. |
| `crm.record.search` | CRM Core Pack | `partial` | `read_only` | `yarn crm:execute`; `yarn crm:review` | Resolves opportunities, people, companies, and tasks for supported flows. | Generic search/list/aggregate contract for supported Twenty objects with ambiguity handling. | Current resolver scope is useful but not fully generic. |
| `crm.record.get` | CRM Core Pack | `partial` | `read_only` | `yarn crm:review`; `yarn crm:execute` | Reads deal and related context for review or execution planning. | Generic get by object/id/select with relation-safe reads. | Current get behavior is deal-centric or v1-operation-centric. |
| `crm.record.create` | CRM Core Pack | `partial` | `standard_write` | `yarn crm:execute --request-file=... --apply`; `yarn crm:review` | Supports `create_opportunity` and some activity creation. | Metadata-driven create for supported Twenty objects through CRM Core. | Generic CRM CRUD across every Twenty object is not stable yet. |
| `crm.record.update` | CRM Core Pack | `partial` | `standard_write` | `yarn crm:execute --request-file=... --apply`; `yarn crm:review` | Supports opportunity updates and task updates/close in current scopes. | Metadata-driven update for supported Twenty objects through CRM Core. | IA Mujeres and manual review should eventually emit CRM Core operations instead of direct writes. |
| `crm.record.delete` | CRM Core Pack | `blocked` | `destructive` | `yarn crm:execute` | `delete_record` exists only as an auditable blocked operation in v1. | Disabled-by-default delete with exact ids, dry-run, strict limits, and explicit confirmation. | Do not treat delete as currently usable. |
| `crm.record.restore` | CRM Core Pack | `target` | `destructive` | none | No current canonical restore capability found. | Disabled-by-default restore with exact ids and explicit confirmation when the API supports it. | Requires API support validation and rollback semantics. |
| `crm.record.destroy` | CRM Core Pack | `blocked` | `destructive` | none | No current canonical destroy capability found. | Disabled-by-default hard destroy with strongest confirmation and narrow record limits. | Must stay blocked until a safety contract and tests exist. |
| `crm.relation.link` | CRM Core Pack | `partial` | `standard_write` | `yarn crm:execute`; `yarn crm:review` | Links notes/tasks to opportunity/person/company targets in supported flows. | Generic validated relation link helper through CRM Core. | Current relation support is activity-target focused. |
| `crm.relation.unlink` | CRM Core Pack | `target` | `standard_write` | none | No current canonical unlink capability found. | Generic validated relation unlink helper through CRM Core. | Needs metadata and relation cardinality checks. |
| `crm.activity.note.create` | CRM Core Pack | `partial` | `standard_write` | `yarn crm:execute`; `yarn crm:review`; IA Mujeres harness | Creates notes and links them in supported CRM and campaign flows. | CRM Core activity helper with target validation and audit log. | Implemented today in multiple places; target owner should be CRM Core. |
| `crm.activity.task.create` | CRM Core Pack | `partial` | `standard_write` | `yarn crm:execute`; `yarn crm:review`; IA Mujeres harness | Creates tasks in supported CRM and campaign flows. | CRM Core activity helper with assignee, due date, target, and audit validation. | Campaign-specific task rules remain in campaign pack, but task creation should route through CRM Core. |
| `crm.activity.task.update` | CRM Core Pack | `partial` | `standard_write` | `yarn crm:execute`; `yarn crm:review`; IA Mujeres harness | Updates and closes tasks in supported flows. | CRM Core task update helper with exact task resolution and dry-run diff. | Current task updates are supported but not generic across all task use cases. |
| `crm.metadata.field.create` | CRM Core Pack | `partial` | `metadata` | IA Mujeres setup scripts; workflow smoke-test scripts | Metadata field creation exists in specialized scripts; CRM execution v1 blocks metadata changes. | CRM Core metadata mutation capability disabled by default with strong confirmation and schema audit. | Current support should not be exposed as generic CRM Core yet. |
| `crm.metadata.view.manage` | CRM Core Pack | `partial` | `metadata` | IA Mujeres setup scripts; workflow smoke-test scripts | View and filter setup exists for specialized campaign/workflow isolation flows. | CRM Core metadata view manager with strong confirmation and rollback notes. | Separate from normal record updates because it changes user-facing CRM structure. |
| `crm.workflow.research` | Twenty Workflows Pack | `partial` | `workflow` | `shared/agents/twenty-workflows`; `shared/skills/twenty-workflows` | Repo-local agents and skills document API/MCP-first workflow research. | Skilland Ops routes workflow research to Twenty Workflows Pack and stores evidence. | No stable user command is documented for end-to-end workflow work. |
| `crm.workflow.design` | Twenty Workflows Pack | `partial` | `workflow` | `shared/agents/twenty-workflows`; `shared/skills/twenty-workflows` | Design is documented as part of the workflow specialist sequence. | Workflow design artifact with trigger, steps, edges, isolation, and safety review. | Keep separate from CRM CRUD because workflows can create broad side effects. |
| `crm.workflow.implement` | Twenty Workflows Pack | `partial` | `workflow` | local workflow scripts and GraphQL/API-first guidance | API-first path is viable, but workflow-specific mutations have auth and safety caveats. | Pack-owned implementation capability with blast-radius gates and apply confirmation. | Marked partial because there is no stable wrapper command in the required sources. |
| `crm.workflow.test` | Twenty Workflows Pack | `partial` | `workflow` | workflow smoke-test scripts; workflow QA skill docs | Smoke-test approach exists for workflow validation and run inspection. | Pack-owned test capability for draft runs, isolated activation, and affected-record checks. | Activation remains gated and must not be implicit. |
| `crm.plan.validate` | CRM Core Pack | `partial` | `read_only` | `yarn crm:execute`; `crm-plan-validation` skill | Validates current v1 CRM operation plans against scope, fields, ambiguity, and constraints. | Generic CRM Core validation over metadata-driven operations. | Strong existing pattern, but current operation vocabulary is limited. |
| `crm.execution.apply` | CRM Core Pack | `partial` | `standard_write` | `yarn crm:execute --request-file=... --apply --yes` | Execution Agent calls deterministic executor only after Safety Reviewer approval. | Single CRM Core apply boundary for all generic CRM writes. | Dry-run default and safety review already exist for v1 scope. |
| `crm.conversation.manual_review` | CRM Conversation Pack | `legacy` | `standard_write` | `yarn crm:review` | Supervised review, interview, planning, confirmation, and direct CRM writes for deals. | Conversation pack produces CRM Core operation plans and does not write directly. | Useful compatibility surface, but it duplicates CRM write behavior. |
| `crm.export.chatgpt` | Export / Reporting Pack | `stable` | `read_only` | `yarn crm:export`; `node scripts/crm_manual_update_crew/export-para-chatgpt.mjs` | Generates one Markdown export under `04_outputs/crm_manual_update_session/` and always excludes IA Mujeres. | Report capability available through Export / Reporting Pack and Skilland Ops alias. | Read-only guarantees are documented in `README_EXPORT.md`. |
| `aikount.openapi.live` | AIKount ERP Pack | `stable` | `read_only` | `yarn crm:aikount` | Verifies auth, fetches live OpenAPI, and loads taxes/numbering for selected action planning. | AIKount ERP capability loads live contract and required master data before plan/apply. | Live OpenAPI wins over stale examples. |
| `aikount.document.interview` | AIKount ERP Pack | `stable` | `read_only` | `yarn crm:aikount` | Interviews for missing quote or invoice data and blocks ambiguity. | AIKount ERP interview capability produces complete billing inputs without guessing. | Structured data controls payloads when present. |
| `aikount.operation.plan` | AIKount ERP Pack | `partial` | `read_only` | `yarn crm:aikount` | Plans explicit AIKount REST operations, payloads, sequencing, document keys, and registry metadata. | AIKount ERP planner for all supported quote, invoice, conversion, issue, share, and send flows. | Current scope is strong for documented flows, but should not be assumed complete for every AIKount endpoint. |
| `aikount.execution.apply` | AIKount ERP Pack | `partial` | `cross_domain` | `yarn crm:aikount --apply --yes` | Applies approved AIKount plans with dry-run default, confirmations, no deletes, and no CRM write-backs. | AIKount ERP apply boundary with external-send escalation and bridge-only CRM write-back. | Sends, shares, and issue flows need external confirmation; CRM write-back remains out of v1. |
| `aikount.file_container.manage` | AIKount ERP Pack | `partial` | `read_only` | `yarn crm:aikount --container-add=...`; `--container-list`; `--container-register` | Manages local pending quote/invoice tray and registers selected items through normal AIKount flow. | Pack-owned container with structured data precedence, dry-run default, and idempotent registration. | Deliverable-only files are reference until enough billing data exists. |
| `bridge.crm_aikount.context` | CRM-AIKount Bridge Pack | `partial` | `cross_domain` | `yarn crm:aikount`; `crm-aikount-context-readonly` skill | Reads CRM deal context in strict read-only mode for AIKount planning. | Bridge reads CRM context through CRM Core or approved read-only snapshot and builds AIKount inputs. | Existing read-only context is useful but lives under AIKount ops, not a formal bridge pack. |
| `bridge.crm_aikount.writeback.plan` | CRM-AIKount Bridge Pack | `target` | `cross_domain` | none | AIKount v1 explicitly forbids CRM write-backs. | Bridge proposes CRM Core write-back plan after AIKount result, then requires separate confirmation. | Do not let AIKount write CRM directly. |
| `campaign.ia_mujeres.status` | IA Mujeres Campaign Pack | `stable` | `read_only` | `node scripts/ia_mujeres_operator_harness.mjs --action=status` | Audits CRM and task state without mutating CRM or Gmail. | Campaign status capability routed through Skilland Ops with local report output. | Safe daily starting point. |
| `campaign.ia_mujeres.batch.prepare` | IA Mujeres Campaign Pack | `stable` | `read_only` | `node scripts/ia_mujeres_operator_harness.mjs --action=prepare-next-batch --limit=5` | Audits, selects next batch, and renders local draft payloads without CRM or Gmail mutation. | Campaign batch preparation with explicit review artifact and no external side effects. | Current harness rejects apply for this action. |
| `campaign.ia_mujeres.drafts.create` | IA Mujeres Campaign Pack | `partial` | `external_send` | `node scripts/ia_mujeres_operator_harness.mjs --action=create-drafts --apply --confirm-create-external-drafts` | Creates Gmail drafts and registers them in CRM when apply and confirmation are present. | Campaign pack creates drafts; standard CRM notes/tasks/fields route through CRM Core. | Partial because CRM writes still live in the campaign runner today. |
| `campaign.ia_mujeres.batch.send` | IA Mujeres Campaign Pack | `partial` | `external_send` | `node scripts/ia_mujeres_operator_harness.mjs --action=send-batch --apply --confirm-send-approved-drafts`; `--action=launch-approved-batch` | Sends approved Gmail drafts and registers email-sent state with confirmation. | Campaign send capability with external-send confirmation and CRM Core write-back. | No external sends without explicit confirmation. |
| `campaign.ia_mujeres.signals.sync` | IA Mujeres Campaign Pack | `partial` | `cross_domain` | `node scripts/ia_mujeres_operator_harness.mjs --action=sync-signals --apply` | Reads Gmail event evidence from local log and syncs replies/bounces into CRM. | Campaign signal sync reads Gmail evidence and emits CRM Core operations for CRM updates. | Crosses Gmail evidence and CRM state. |
| `campaign.ia_mujeres.tasks.reconcile` | IA Mujeres Campaign Pack | `partial` | `standard_write` | `node scripts/ia_mujeres_operator_harness.mjs --action=reconcile-tasks --apply` | Assigns and closes IA Mujeres tasks in CRM under campaign rules. | Campaign pack decides task policy; CRM Core applies task operations. | Target should remove direct task writes from campaign runner. |
| `campaign.ia_mujeres.weekly_report` | IA Mujeres Campaign Pack | `stable` | `read_only` | `node scripts/ia_mujeres_operator_harness.mjs --action=weekly-report`; `node scripts/ia_mujeres_weekly_report.mjs` | Generates local Markdown and HTML weekly reports without CRM mutation or email send. | Campaign report capability emits local artifacts and can optionally hand off email delivery to an external-send capability. | Emailing the weekly report is a separate confirmed action. |
| `report.crm.export` | Export / Reporting Pack | `stable` | `read_only` | `yarn crm:export` | Generates the CRM export Markdown for ChatGPT and excludes IA Mujeres. | Canonical read-only CRM export/report capability under Export / Reporting Pack. | Same current runtime as `crm.export.chatgpt`; target owner is reporting. |

## 5. Legacy entrypoints

| Entrypoint | Current owner | Status | Compatibility rule |
| --- | --- | --- | --- |
| `yarn crm:execute` | `scripts/crm_execution_crew/harness.mjs` | `partial` | Keep as CRM Core v1 compatibility until metadata-driven CRM Core can wrap or replace it. |
| `yarn crm:review` | `scripts/crm_manual_update_crew/harness.mjs` | `legacy` | Keep for supervised manual review, but migrate writes to CRM Core operation plans. |
| `yarn crm:export` | `scripts/crm_manual_update_crew/export-para-chatgpt.mjs` | `stable` | Keep as read-only reporting entrypoint and later expose through Export / Reporting Pack. |
| `yarn crm:aikount` | `scripts/crm_aikount_ops/harness.mjs` | `partial` | Keep as AIKount ERP compatibility entrypoint until Skilland Ops routes AIKount pack requests. |
| `node scripts/ia_mujeres_operator_harness.mjs --action=...` | IA Mujeres campaign scripts | `partial` | Keep as campaign compatibility entrypoint; move generic CRM write-back to CRM Core over time. |

## 6. Migration notes

- CRM execution v1 is not generic CRM Core. Treat it as the seed for CRM Core,
  not proof that all Twenty objects have CRUD.
- Manual review is valuable conversation UX, but target writes belong to CRM
  Core.
- IA Mujeres is a campaign pack. It can own campaign selection, Gmail policy,
  and reporting, but generic notes, tasks, fields, and record updates should be
  emitted to CRM Core.
- AIKount remains ERP/accounting and must not become a CRM Core subcapability.
- CRM-AIKount write-back is target-only until the bridge can produce CRM Core
  plans and require a second confirmation.
- Workflow authoring is API-capable, but it stays partial until a stable
  wrapper command and workflow-specific safety gates exist.
- Destructive and metadata capabilities can be named in the target model, but
  they are disabled by default and require stronger confirmation than standard
  writes.
- Existing commands remain compatibility surfaces until aliases or wrappers
  preserve behavior and logs.

## 7. Open questions

- What exact generic CRM operation contract should replace the current v1
  operation names such as `create_opportunity` and `update_task`?
- Which Twenty objects should be enabled first for metadata-driven CRM Core,
  and which should remain read-only until safety tests exist?
- What GraphQL introspection evidence is required before enabling delete,
  restore, or destroy for any object?
- Should CRM Conversation Pack own `crm.export.chatgpt`, or should every export
  move directly to Export / Reporting Pack with conversation-only aliases?
- What is the first CRM-AIKount write-back shape: note only, task only, stage
  update, document link field, or a richer operation bundle?
- Which workflow actions require user-authenticated GraphQL sessions in the
  production workspace, and how should Skilland Ops store that preflight result?
- Which IA Mujeres CRM writes should migrate first to CRM Core: notes, tasks,
  Gmail ids, stage updates, or setup metadata?

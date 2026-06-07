---
name: twenty-workflow-api-research
description: Research current Twenty workflow capabilities from official docs, local code, generated GraphQL surface, repo scripts, and the current MCP tool surface. Use whenever a task involves Twenty workflows and there is any doubt about whether something is API-capable, what auth it needs, which mutation or endpoint to use, or whether UI is truly unavoidable.
---

# Twenty Workflow API Research

## Purpose

Establish what is actually possible for Twenty workflows before anyone designs or implements anything.

## Use when

- a workflow task sounds UI-heavy and needs to be challenged
- auth or permissions are unclear
- a workflow mutation or endpoint needs to be identified
- docs and local notes disagree
- the team needs a capability matrix or last-resort UI ruling

## Inputs

- business goal
- target objects and fields
- whether the task is authoring, execution, debugging, or cleanup
- current workspace constraints if known

## Outputs

- concise source inventory
- capability matrix with confidence levels
- auth notes
- explicit "proven", "not proven", and "blocked" statements
- UI-last-resort ruling

## Read first

1. `shared/knowledge/twenty-workflows/2026-06-07_sources_inventory.md`
2. `shared/knowledge/twenty-workflows/2026-06-07_workflow_domain_model.md`
3. `shared/knowledge/twenty-workflows/2026-06-07_api_mcp_capabilities.md`
4. `shared/knowledge/twenty-workflows/2026-06-07_ui_last_resort.md`

## Workflow

1. Start from primary sources:
   - official docs
   - server resolvers
   - query hooks
   - shared schemas
   - generated GraphQL surface
2. Check current repo scripts and reports for runtime evidence.
3. Separate:
   - supported now
   - supported with workaround
   - blocked by model guardrails
   - still unknown
4. State auth assumptions explicitly.
5. If UI appears necessary, prove it instead of assuming it.

## API/MCP-first rules

- Prefer `/graphql`, `/metadata`, `/rest/metadata`, repo-local workflow tool code, and current MCP record tools.
- Treat the current `mcp__twenty_crm` connector as record-oriented, not workflow-authoring-oriented, unless new workflow tools are discovered.
- Do not write "UI-only" without code or doc evidence.

## Safety restrictions

- no production writes
- no workflow activation
- no email sending
- no spec changes
- no secrets handling beyond noting auth shape

## Acceptance checklist

- named the exact mutation, endpoint, or tool for each major operation
- distinguished auth requirements from functional capability
- corrected stale local assumptions when contradicted by current evidence
- marked unknowns clearly instead of guessing

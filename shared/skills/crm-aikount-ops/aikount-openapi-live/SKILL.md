---
name: aikount-openapi-live
description: Load AIKount live auth, OpenAPI, taxes, and numbering before planning or executing AIKount actions. Use when building or validating quotes, invoices, send/share/issue flows, or whenever public examples might be stale and the live API contract must win.
---

# AIKount OpenAPI Live

## Workflow

1. Verify `AIKOUNT_TOKEN` via `/auth/me`.
2. Fetch the live `openapi.json`.
3. Confirm the required path and method for the requested action.
4. Load sale taxes and numbering series for interview/planning.

## Rules

- Treat live OpenAPI as the source of truth.
- Treat missing auth or missing paths as blockers.
- Return only the master data needed for the chosen action.

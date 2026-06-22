---
name: aikount-file-container
description: Manage the CRM AIKount Ops file container for pending quotes and invoices. Use when the user wants to drop sent quotes, ready invoices, structured document data, or a mixed bundle and later ask the expert team to register the pending items in AIKount.
---

# AIKount File Container

## Purpose

The file container is a local pending tray for documents to register in AIKount.
It supports mixed inputs:

- structured data only: JSON answers ready for AIKount document creation
- deliverables only: PDFs, spreadsheets, or other files already prepared by the user
- mixed: structured data plus one or more user-made deliverables as evidence/reference

## Workflow

1. Add files and/or structured data to the container.
2. List the container before registration.
3. Register selected pending items through the normal dry-run/apply AIKount workflow.
4. Mark an item registered only after an apply completes.

## Rules

- Do not assume every registration starts from file extraction.
- Structured data controls accounting payloads when present.
- Deliverable-only items are valid as pending inputs, but must not mutate AIKount until enough structured billing data is known through JSON or user interview.
- Treat existing user-made deliverables as support/reference unless the live AIKount API exposes an explicit import/upload capability.
- Never resend an already sent external quote just because its deliverable says it was sent.
- Dry-run remains the default for container registration.

## CLI

- Add deliverable(s): `yarn crm:aikount --container-add=path --container-kind=quote`
- Add mixed input: `yarn crm:aikount --container-add=file.pdf --container-data-file=data.json --container-kind=invoice`
- Add structured-only input: `yarn crm:aikount --container-data-file=data.json --container-kind=quote`
- List tray: `yarn crm:aikount --container-list`
- Register pending quotes: `yarn crm:aikount --container-register --container-kind=quote`
- Apply one item: `yarn crm:aikount --container-register --container-item=aikountfile_... --apply --yes`

---
name: aikount-document-interview
description: Interview the user for missing AIKount document data in an interactive CRM-to-accounting session. Use when creating or updating quotes or invoices, converting quotes to invoices, or deciding send/share/issue follow-ups and the CRM does not contain enough billing detail by itself.
---

# AIKount Document Interview

## Workflow

1. Show the CRM context already available.
2. Ask only for missing billing data.
3. Prefer a minimal valid document over guessing.
4. Offer follow-up actions only after the base document is clear.

## Ask for

- document key
- document dates
- lines
- taxes
- series when needed
- contact overrides such as VAT or billing email
- send/share/issue intent

## Restrictions

- Never invent lines or tax choices.
- If the target document is ambiguous, stop and ask.

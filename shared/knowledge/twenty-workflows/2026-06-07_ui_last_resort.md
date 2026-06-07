# Twenty Workflows UI Last Resort

As of 2026-06-07, no functional workflow-authoring or workflow-execution capability was proven to be inherently UI-only.

| capability | API/MCP investigation | conclusion | UI required? | workaround |
| --- | --- | --- | --- | --- |
| Functional workflow creation, editing, activation, and run inspection | Reviewed official docs, server resolvers, query hooks, shared schemas, local scripts, and 2026-06-07 smoke-test evidence | `createWorkflow`, step/edge mutations, trigger updates, `activateWorkflowVersion`, `runWorkflowVersion`, and run queries cover the functional path | No | Use Core GraphQL, Metadata API, or repo-local internal workflow tools |
| Form handling in automated workflows | Docs say automated forms are surfaced through the workflow-run interface; server exposes `submitFormStep` and `updateWorkflowRunStep` | Poor UX is documented, but UI-only was not proven | No | Use API to inspect the run and submit the form step when necessary |
| Task linking after workflow actions | Data model contains `taskTarget`; current MCP surface exposes `create_task_target` | Not proven UI-only; direct runtime path should still be re-validated per workspace | No | Use MCP/core API to create the task link if the workflow step itself does not create it cleanly |

Not proven UI-only:

- trigger authoring
- step authoring
- branch/filter authoring
- activation/deactivation
- run debugging
- test-record preparation

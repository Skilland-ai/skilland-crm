# Twenty Workflows Skills

These are repo-local skill specs for working on Twenty CRM workflows in an API/MCP-first way.

## Skill set

- `twenty-workflow-api-research`
- `twenty-workflow-design`
- `twenty-workflow-implementation`
- `twenty-workflow-smoke-test`
- `twenty-workflow-safety-review`

## Recommended order

1. `twenty-workflow-api-research`
2. `twenty-workflow-design`
3. `twenty-workflow-safety-review`
4. `twenty-workflow-implementation`
5. `twenty-workflow-smoke-test`

## Shared rules

- Read `shared/knowledge/twenty-workflows/` before acting.
- Prefer Core GraphQL, Metadata API, repo-local scripts, and current MCP tools over UI.
- Treat UI as last resort only if `2026-06-07_ui_last_resort.md` says so.
- Do not activate production workflows or send emails without explicit confirmation.

## Note

These files are the canonical repo-local instructions. They are not auto-installed platform skills by themselves.

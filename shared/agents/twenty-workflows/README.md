# Twenty Workflows Agents

These are repo-local draft agent specs for Twenty workflow work.

## Agent set

- `api-researcher/AGENT.md`
- `architect/AGENT.md`
- `implementer/AGENT.md`
- `qa/AGENT.md`
- `safety-reviewer/AGENT.md`

## Recommended orchestration

1. `api-researcher`
2. `architect`
3. `safety-reviewer`
4. `implementer`
5. `qa`

## Operating rule

Every agent in this set is API/MCP-first and treats UI as last resort only when documented in `shared/knowledge/twenty-workflows/2026-06-07_ui_last_resort.md`.

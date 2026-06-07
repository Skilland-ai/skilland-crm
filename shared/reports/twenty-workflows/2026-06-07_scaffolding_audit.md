# Twenty Workflows Capability Scaffolding Audit

- Date: 2026-06-07
- Repo: `skilland-crm`
- Reference scaffolding: `/home/reboot/Escritorio/Skilland.ai/basic-scaffolding`

## Relevant structure in `basic-scaffolding`

### Root conventions

- `AGENTS.md`
- `CLAUDE.md`
- `01_harness/`
- `03_specs/`
- `04_outputs/`
- `05_scratch/`
- `shared/`

### `shared/` conventions actually present

- `shared/agents/<agent-name>/AGENT.md`
- `shared/skills/<skill-name>/SKILL.md`

### Not present in `basic-scaffolding/shared/`

- No `shared/knowledge/`
- No `shared/orchestration/`
- No `shared/reports/`

## Relevant structure in `skilland-crm`

### Root conventions

- `CLAUDE.md`
- `03_specs/now/`
- `04_outputs/`
- `scripts/`
- `packages/`

### Existing reusable-agent signals

- `.cursor/skills/<skill-name>/SKILL.md`
- local repo instructions in `CLAUDE.md`
- repo contains Twenty source code, docs mirror, and existing project scripts

### Gaps for the requested capability

- No repo-local `shared/` tree
- No repo-local capability index for workflows
- No stable knowledge base for Twenty workflow authoring/testing
- No agent specs dedicated to Twenty workflows

## Architecture decision

Install a new repo-local capability tree:

```text
shared/
├── agents/
├── knowledge/
├── orchestration/
├── reports/
└── skills/
```

Domain root:

```text
shared/knowledge/twenty-workflows/
shared/skills/twenty-workflows/
shared/agents/twenty-workflows/
shared/orchestration/twenty-workflows/
shared/reports/twenty-workflows/
```

## Why these paths were chosen

1. `shared/skills/` and `shared/agents/` intentionally follow the naming shape already used by `basic-scaffolding`.
2. `skilland-crm` already uses `03_specs/` and `04_outputs/` for active workstreams; reusable capability assets do not belong there.
3. This repo needs extra layers that `basic-scaffolding` does not provide:
   - `knowledge/` for distilled Twenty workflow internals
   - `orchestration/` for multi-agent operating procedure
   - `reports/` for installation/audit artifacts
4. The capability must be portable across Codex/Claude usage inside this repo, so repo-local markdown is better than tool-specific hidden config.

## Final routes chosen

- `shared/reports/twenty-workflows/2026-06-07_scaffolding_audit.md`
- `shared/knowledge/twenty-workflows/*`
- `shared/skills/twenty-workflows/*`
- `shared/agents/twenty-workflows/*`
- `shared/orchestration/twenty-workflows/*`

## Notes

- `basic-scaffolding` was used as a structural reference, not copied mechanically.
- The repo's existing `.cursor/skills` were treated as evidence that `SKILL.md` is already a familiar format here.
- No active spec files were modified.

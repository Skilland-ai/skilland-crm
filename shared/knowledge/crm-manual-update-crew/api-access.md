# CRM Manual Update Crew API Access

## Recommended access path

Portable order for this VPS and future hosts:

1. read `TWENTY_API_KEY` and optional `TWENTY_BASE_URL` from environment
2. if `TWENTY_CREDENTIALS_FILE` is set, read that JSON file
3. fall back to `~/.config/skilland/twenty.json`
4. fall back to `~/.claude.json`
5. keep `/home/reboot/.claude.json` only as legacy compatibility fallback
6. call `${TWENTY_BASE_URL}/graphql`
7. call `${TWENTY_BASE_URL}/rest`
8. call `${TWENTY_BASE_URL}/rest/metadata/objects`

Expected JSON shape for file-based bootstrap:

```json
{
  "TWENTY_API_KEY": "<secret>",
  "TWENTY_BASE_URL": "https://crm.skilland.ai"
}
```

## Mutations

- `updateOpportunity(id, data)`
- `updateTask(id, data)`
- `POST /rest/notes`
- `POST /rest/noteTargets`
- `POST /rest/tasks`
- `POST /rest/taskTargets`

## Rejected access paths

- direct Postgres writes
- UI automation
- MCP as primary runtime path


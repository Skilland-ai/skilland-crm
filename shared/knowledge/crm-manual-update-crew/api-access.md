# CRM Manual Update Crew API Access

## Recommended access path

Use the same production-proven pattern as the IA Mujeres scripts:

- read `TWENTY_API_KEY` and `TWENTY_BASE_URL` from environment
- fall back to `/home/reboot/.claude.json`
- call `${TWENTY_BASE_URL}/graphql`
- call `${TWENTY_BASE_URL}/rest`
- call `${TWENTY_BASE_URL}/rest/metadata/objects`

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


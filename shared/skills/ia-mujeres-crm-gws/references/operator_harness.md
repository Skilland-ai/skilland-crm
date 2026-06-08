# IA Mujeres Operator Harness

Use `scripts/ia_mujeres_operator_harness.mjs` as the main operator entrypoint.

## Actions

| Action | Mutates CRM | Touches Gmail | Purpose |
|---|---:|---:|---|
| `status` | No | No | CRM audit and task reconciliation dry-run |
| `prepare-next-batch` | No | No | Audit, select 5, render local draft payloads |
| `create-drafts` | Yes with `--apply` | Creates drafts with confirmation | Create Gmail drafts and register them in CRM |
| `send-batch` | Yes with `--apply` | Sends drafts with confirmation | Send approved drafts and register email sent |
| `launch-approved-batch` | Yes | Creates and sends with confirmations | Execute approved batch end-to-end |
| `sync-signals` | Yes with `--apply` | Reads Gmail events from local log | Sync replies/bounces into CRM |
| `reconcile-tasks` | Yes with `--apply` | No | Assign/close IA Mujeres tasks |
| `weekly-report` | No | No | Generate weekly MD/HTML report |
| `email-weekly-report` | No CRM | Sends internal report with confirmation | Email weekly report |
| `lab-check` | No | Checks internal lab thread | Recheck Experiment 0 |

## Safe Defaults

- `status`, `prepare-next-batch`, `weekly-report`, and `lab-check` reject `--apply`.
- `create-drafts` requires `--apply --confirm-create-external-drafts` to create real drafts.
- `send-batch` requires `--apply --confirm-send-approved-drafts` to send.
- `launch-approved-batch` requires both confirmations.
- `email-weekly-report` requires `--apply --confirm-send-weekly-report`.

## Examples

Prepare the next review batch:

```bash
node scripts/ia_mujeres_operator_harness.mjs --action=prepare-next-batch --limit=5
```

Create and send an already approved batch:

```bash
node scripts/ia_mujeres_operator_harness.mjs \
  --action=launch-approved-batch \
  --batch-id=<id> \
  --apply \
  --confirm-create-external-drafts \
  --confirm-send-approved-drafts
```

Sync replies/bounces and reconcile tasks:

```bash
node scripts/ia_mujeres_operator_harness.mjs --action=sync-signals --apply
```

Send the weekly report internally:

```bash
node scripts/ia_mujeres_operator_harness.mjs \
  --action=email-weekly-report \
  --apply \
  --confirm-send-weekly-report
```

## Outputs

Every harness run writes:

```text
04_outputs/ia_mujeres_crm_execution/operator_harness_<timestamp>_<action>.json
```

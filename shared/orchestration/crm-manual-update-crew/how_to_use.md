# How To Use CRM Manual Update Crew

For a visual, non-technical guide for the commercial team, see
`shared/orchestration/crm-manual-update-crew/guia_comerciales.md`.

## Preferred interaction

Talk to `crm-secretary-lead` and describe what you want to review:

```text
Revisa los deals de Skilland MicroCred.
```

The lead agent will retrieve context, guide the review, propose changes, ask for
confirmation, run the harness if needed, and report the log path.

## Manual terminal mode

```bash
corepack enable --install-directory ~/.local/bin yarn
yarn install --mode=skip-build
yarn crm:review
yarn crm:review --apply
yarn crm:review --business-line="SkilLand IA Mujeres"
yarn crm:review --stage=POSSIBLE_OPPORTUNITY
```

Without `--apply`, the tool is dry-run and will not write CRM data.

## VPS bootstrap for credentials

Choose one of these safe paths:

### Option A — environment

```bash
export TWENTY_API_KEY='<secret>'
export TWENTY_BASE_URL='https://crm.skilland.ai'
```

### Option B — portable local file for user `skilland`

```bash
mkdir -p ~/.config/skilland
cp shared/templates/twenty.credentials.example.json ~/.config/skilland/twenty.json
chmod 600 ~/.config/skilland/twenty.json
```

Then edit `~/.config/skilland/twenty.json` locally with the real secret values.

### Fallback order

1. `TWENTY_API_KEY` / `TWENTY_BASE_URL`
2. `TWENTY_CREDENTIALS_FILE`
3. `~/.config/skilland/twenty.json`
4. `~/.claude.json`
5. `/home/reboot/.claude.json` (legacy only)

## Common commands during review

- `skip`
- `nota: ...`
- `mover a ...`
- `importe 16000`
- `crear tarea ...`
- `cerrar tarea ...`
- `siguiente paso: ...`
- `resumen`
- `confirmar`
- `cancelar`

## Logs

Session logs are saved in:

```text
04_outputs/crm_manual_update_crew/logs/
```

Use the log to see filters, proposed operations, confirmations, execution
results, and errors.

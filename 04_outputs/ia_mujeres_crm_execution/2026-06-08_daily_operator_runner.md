# Daily Operator Runner — IA Mujeres

Fecha: 2026-06-08

## Comando principal

```bash
node scripts/ia_mujeres_daily_operator.mjs --limit=5 --weekly
```

## Qué hace

El operador diario encadena modos seguros:

1. Audita CRM.
2. Selecciona la siguiente tanda revisable.
3. Prepara payloads locales de draft.
4. Busca follow-ups vencidos.
5. Genera reporte semanal si se pasa `--weekly`.

## Qué no hace

- No acepta `--apply`.
- No crea Gmail drafts.
- No envía emails.
- No muta CRM.
- No toca contactos reales fuera de lectura.

## Última ejecución validada

- Comando: `node scripts/ia_mujeres_daily_operator.mjs --limit=5 --weekly`
- Batch generado: `2026-06-08T00-34-36-009Z`
- Output: `04_outputs/ia_mujeres_crm_execution/daily_operator_2026-06-08T00-34-37.381Z.json`
- Payloads locales: `04_outputs/ia_mujeres_crm_execution/batch_2026-06-08T00-34-36-009Z_draft_payloads.json`
- Revisión local: `04_outputs/ia_mujeres_crm_execution/batch_2026-06-08T00-34-36-009Z_draft_review.md`

## Modos específicos del runner CRM

```bash
node scripts/ia_mujeres_batch_runner.mjs --mode=audit
node scripts/ia_mujeres_batch_runner.mjs --mode=select-batch --limit=5
node scripts/ia_mujeres_batch_runner.mjs --mode=prepare-drafts --batch-id=<id>
node scripts/ia_mujeres_batch_runner.mjs --mode=mark-draft-created --batch-id=<id> --draft-map=<json> --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=mark-email-sent --batch-id=<id> --sent-map=<json> --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-replies --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=sync-bounces --apply
node scripts/ia_mujeres_batch_runner.mjs --mode=prepare-followups --limit=5
```

## Safeguards

- `--limit` está capado a 5.
- `send-approved` sigue bloqueado intencionadamente.
- Todo cambio CRM requiere `--apply` en modo específico.
- `mark-draft-created --apply` exige `--draft-map`.
- `mark-email-sent --apply` exige `--sent-map`.
- Los candidatos con revisión manual, duplicados, emails genéricos o envíos previos se excluyen de tanda automática.

## Qué toca en CRM

Solo los modos con `--apply` actualizan:

- campos Gmail;
- `iaMujeresFunnelStage`;
- `outreachStatus`;
- fechas email/follow-up;
- notas;
- tareas.

## Qué toca en Gmail

El operador diario no toca Gmail. El laboratorio interno GWS sigue en `scripts/ia_mujeres_experiment_00_gws_lab.mjs`.

## Siguiente ampliación segura

Crear un modo dedicado de creación de Gmail drafts externos, bloqueado por whitelist de batch aprobado, revisión humana y confirmación explícita. No debe reutilizarse el runner del Experimento 0 para contactos externos.

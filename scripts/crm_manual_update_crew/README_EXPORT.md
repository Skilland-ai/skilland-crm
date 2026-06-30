# CRM Export para ChatGPT

Este export genera un unico Markdown con el estado actual del pipeline comercial del CRM.

## Garantias

- Solo lectura.
- No hace mutations.
- No crea ni actualiza notas.
- No crea ni cierra tareas.
- No mueve stages.
- No actualiza importes.
- Excluye siempre IA Mujeres.

## Salida

El archivo se genera en:

`04_outputs/crm_manual_update_session/crm_export_para_chatgpt_<timestamp>.md`

El script imprime al final:

- ruta del Markdown generado
- total deals leidos
- total deals exportados
- total deals IA Mujeres excluidos

## Como ejecutarlo

Script reusable del repo:

```bash
yarn crm:export
```

Si esta copia del repo no tiene el estado local de Yarn inicializado, puedes ejecutar el mismo flujo directamente con:

```bash
node scripts/crm_manual_update_crew/export-para-chatgpt.mjs
```

Claude Code:

```text
/crm-export
```

Codex:

```text
$crm-export
```

Si prefieres evitar skills, tambien puedes lanzar directamente `yarn crm:export`.

## Credenciales necesarias

El script necesita acceso de lectura a Twenty CRM mediante una de estas opciones:

- `TWENTY_API_KEY` en el entorno
- `TWENTY_API_KEY` en `/home/reboot/.claude.json`

Opcional:

- `TWENTY_BASE_URL` si no se usa `https://crm.skilland.ai`

## Implementacion

El comando reutiliza:

- `scripts/crm_manual_update_crew/export-para-chatgpt.mjs`
- `scripts/crm_manual_update_crew/twenty-client.mjs`
- metadata y queries read-only del crew manual

No escribe nada en CRM.

# CRM Export para ChatGPT

Este export genera un unico Markdown con el estado actual del pipeline comercial del CRM.

## Garantias

- Solo lectura.
- Todas las operaciones GraphQL pasan por un guard `query-only`; una
  `mutation` se bloquea antes de llegar al transporte.
- No crea ni actualiza notas.
- No crea ni cierra tareas.
- No mueve stages.
- No actualiza importes.
- Excluye IA Mujeres solo cuando puede demostrar que leyó completas las
  oportunidades, notas y tareas y que puede consultar las señales relevantes
  de business line, tags y metadata. Ante truncación o una señal no
  consultable, falla cerrado antes de crear el artefacto.
- Lee como máximo 1000 oportunidades. Si el origen contiene más que el límite
  autorizado, no produce un export parcial.
- El Markdown se crea con `wx` (sin overwrite), permisos `0600` y un límite de
  5 MiB.

## Salida

El archivo se genera en:

`04_outputs/crm_manual_update_session/crm_export_para_chatgpt_<timestamp>.md`

El entrypoint de compatibilidad admite otro `--output-dir`, pero conserva
create-only, `0600` y el byte cap. La nueva front door no admite rutas elegidas
por el caller: está confinada al directorio anterior y usa el `requestId` como
parte controlada del basename.

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

El comando legacy necesita acceso de lectura a Twenty CRM mediante una de estas
opciones, mantenidas por compatibilidad:

- `TWENTY_API_KEY` en el entorno
- `TWENTY_API_KEY` en `/home/reboot/.claude.json`

Opcional:

- `TWENTY_BASE_URL` si no se usa `https://crm.skilland.ai`

El adapter de `Skilland CRM Ops` no usa el fallback legacy ni asume producción.
Gate 007 solo lo habilita en environment `test`, hasta disponer de retención
ejecutable para el artefacto con datos comerciales/PII. Exige, al invocarse,
las cuatro variables siguientes:

- `SKILLAND_CRM_OPS_ENVIRONMENT`, idéntica a `request.environment.name`
- `SKILLAND_CRM_OPS_WORKSPACE`, idéntica a
  `request.environment.workspace`
- `TWENTY_API_KEY`
- `TWENTY_BASE_URL`

HTTP solo se admite en `test`; el reader exige HTTPS para cualquier entorno
superior que una gate futura habilite. La resolución es lazy: importar el
módulo o construir el mapa de adapters no lee credenciales ni abre conexiones.

## Implementacion

El comando reutiliza:

- `scripts/crm_manual_update_crew/export-para-chatgpt.mjs`
- `scripts/crm_manual_update_crew/twenty-client.mjs`
- metadata y queries read-only del crew manual

`generateCrmExportMarkdown(...)` es el servicio compartido: obtiene metadata y
datos mediante un reader query-only y devuelve Markdown, conteos, avisos y
completitud, sin escribir archivos. El adapter canónico
`report.crm.export` persiste después un único artefacto mediante el artifact
store confinado. El alias `crm.export.chatgpt` no tiene executor propio.

## Fallo seguro

No se crea ningún artefacto cuando falta `pageInfo`, se alcanza el límite de
páginas o records, hay notas o tareas truncadas, no puede consultarse la
business line primaria, una señal IA Mujeres/tags no es scalar queryable, el
scope no coincide con el contrato fijo o el path/byte policy falla. Una
escritura local parcialmente fallida se limpia antes de devolver error.

Las pruebas del adapter usan readers falsos y directorios temporales. No
requieren red, no hacen writes en CRM y no inspeccionan exports reales con PII.

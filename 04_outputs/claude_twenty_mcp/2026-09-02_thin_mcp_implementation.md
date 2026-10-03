# Implementación — Skilland Twenty Remote MCP

- Fecha: 2026-09-02
- Estado: runtime local preparado; publicación pendiente
- Twenty actualizado: no
- Writes live durante la implementación: cero

## Resultado

Se ha construido un MCP overlay remoto para sustituir el paquete local
`twenty-crm-mcp-server` sin modificar el Twenty desplegado.

La separación aplicada es:

- Claude interpreta el lenguaje natural, resuelve erratas y pregunta solo ante
  ambigüedad real.
- El MCP autentica, publica herramientas allowlisted y transporta operaciones
  exactas hacia Twenty.
- Twenty sigue gobernando datos, permisos y OAuth.

## Runtime

Archivos principales:

- `scripts/skilland_twenty_mcp/server.mjs`
- `scripts/skilland_twenty_mcp/policy.mjs`
- `scripts/skilland_twenty_mcp/server.test.mjs`
- `scripts/skilland_twenty_mcp/Dockerfile`
- `scripts/skilland_twenty_mcp/compose.example.yml`
- `scripts/skilland_twenty_mcp/Caddyfile.example`

La superficie expone 30 herramientas CRM correspondientes a búsqueda,
lectura, creación y actualización individual de Companies, People,
Opportunities, Projects, Tasks y Notes, más búsqueda/lectura/creación de
NoteTargets y TaskTargets.

No expone borrados, bulk, metadata, workflows, archivos, envíos ni API
arbitraria.

## Correcciones técnicas

- `tools/list` queda reducido a `get_tool_catalog`, `learn_tools` y
  `execute_tool`.
- `get_tool_catalog` filtra el catálogo dinámico al alcance Skilland.
- `learn_tools` transforma los targets morph defectuosos a campos UUID
  `target*Id`.
- `execute_tool` crea NoteTarget y TaskTarget por los endpoints REST reales.
- Todas las demás operaciones se delegan al MCP oficial de Twenty con el
  bearer token de la usuaria.
- Los logs solo incluyen método, ruta, nombre de herramienta, status y
  duración.

## Verificación

### Tests offline

```text
11 tests · 11 pass · 0 fail
```

Cubren discovery, challenge OAuth, catálogo, schemas, allowlist, creación de
targets, payload ambiguo, passthrough del token, minimización de logs y fallos
de autenticación upstream.

### Smoke live read-only

El proxy se ejecutó localmente contra `https://crm.skilland.ai` usando las
credenciales ya configuradas en el entorno, sin mutations.

Resultado:

- servidor: `Skilland Twenty CRM Connector` v1.0.0;
- herramientas MCP visibles: 3;
- herramientas CRM visibles: 30;
- Companies, People, Opportunities, Projects, Tasks y Notes: presentes;
- `create_note` y `create_task`: `bodyV2` presente como objeto rich-text;
- `create_note_target`: IDs correctos para Project, Company, Person,
  Opportunity y Business Line;
- `create_task_target`: IDs correctos para los mismos targets.

### Contenedor

`docker compose config` validó el fichero de composición. No se pudo construir
la imagen local porque el daemon Docker no está activo en este equipo; no es un
fallo del Dockerfile demostrado, pero su build real queda pendiente en el host
de despliegue.

## Pendiente para producción

1. Publicar el contenedor bajo `https://mcp.crm.skilland.ai/mcp`.
2. Crear una Application Registration de Twenty para Claude y configurar su
   redirect URI.
3. Añadir el Client ID y Client Secret en las opciones avanzadas del conector
   Claude.
4. Ejecutar un smoke test autenticado sobre registros de prueba y verificar
   las escrituras mediante relectura.

Hasta completar esos pasos, la Spec 011 permanece `in_progress` y el conector
no se declara productivo.

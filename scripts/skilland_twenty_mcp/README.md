# Skilland Twenty MCP

Conector MCP remoto y fino para Claude sobre el Twenty que ya está desplegado
en `crm.skilland.ai`. No modifica ni sustituye Twenty.

## Responsabilidad

El servicio:

- reutiliza el MCP y el OAuth actuales de Twenty;
- limita el catálogo a Companies, People, Opportunities, Projects, Tasks y
  Notes;
- expone búsqueda, lectura, creación y actualización individual;
- crea y actualiza los registros por el Core REST API (`POST /rest/<objeto>`,
  `PATCH /rest/<objeto>/<id>`), no por el MCP oficial: el MCP oficial escribe con
  su motor de workflows y todo queda firmado como "Workflow"; por REST queda
  firmado con la credencial que llama (el usuario OAuth o la API key);
- rechaza en las escrituras `deletedAt` (sería un borrado) y los campos de
  auditoría;
- permite listar y crear relaciones de Notes y Tasks;
- corrige `targetProject`/`targetCompany`/`targetOpportunity`/`targetPerson`
  para usar los campos UUID reales terminados en `Id`;
- transmite a Twenty el Bearer de cada cliente (token OAuth de cada usuaria o
  API key propia de un agente), respetando sus permisos;
- no guarda API keys, client secrets ni tokens;
- no registra argumentos, cuerpos, PII ni resultados CRM.

Claude conserva toda la responsabilidad conversacional: interpretar erratas,
buscar candidatos y preguntar únicamente cuando no pueda elegir un registro de
forma inequívoca.

## Superficie expuesta

Para cada uno de los seis objetos se publican las operaciones oficiales
`find_*`, `find_one_*`, `create_*` y `update_*`. Para `NoteTarget` y
`TaskTarget` se publican búsqueda, lectura y creación.

Catálogo, esquemas (`learn_tools`) y lecturas siguen pasando por el MCP oficial;
`create_*`, `update_*` y `create_*_target` se ejecutan por REST con los mismos
argumentos y devuelven `{toolName, result: <registro>}`, o
`{toolName, error: {message, suggestion}}` con `isError: true` si Twenty rechaza
la escritura (el mensaje incluye su motivo de validación).

Quedan fuera deliberadamente:

- borrados y desvinculaciones;
- operaciones masivas;
- metadata y cambios del modelo de datos;
- Workflows, archivos y envíos externos;
- GraphQL o REST arbitrarios.

## Ejecución local

Por defecto escucha solo en `127.0.0.1:3100` y, sin `SKILLAND_MCP_PUBLIC_URL`,
su origen es `http://127.0.0.1:3100` (HTTP solo se acepta en loopback). Así lo
usan los coworkers de Skilland (Hermes, en el mismo VPS), cada uno con su
propia API key de Twenty en la cabecera `Authorization: Bearer …`:

```bash
yarn crm:mcp            # http://127.0.0.1:3100/mcp
```

Publicado para Claude con OAuth (ver más abajo):

```bash
SKILLAND_MCP_HOST=0.0.0.0 \
SKILLAND_MCP_PUBLIC_URL=https://mcp.crm.skilland.ai \
SKILLAND_MCP_ALLOWED_HOSTS=mcp.crm.skilland.ai,localhost:3100 \
TWENTY_BASE_URL=https://crm.skilland.ai \
yarn crm:mcp
```

Tests offline:

```bash
yarn crm:mcp:test
```

## Variables

| Variable | Obligatoria | Uso |
| --- | --- | --- |
| `SKILLAND_MCP_PUBLIC_URL` | no | Origen público del conector, sin `/mcp`. HTTPS salvo en loopback; por defecto `http://127.0.0.1:<PORT>`. |
| `SKILLAND_MCP_HOST` | no | Interfaz de escucha; por defecto `127.0.0.1`. El contenedor usa `0.0.0.0`. |
| `TWENTY_BASE_URL` | no | Origen de Twenty; por defecto `https://crm.skilland.ai`. |
| `SKILLAND_MCP_ALLOWED_HOSTS` | no | Hosts HTTP aceptados; por defecto el host público. |
| `SKILLAND_MCP_UPSTREAM_TIMEOUT_MS` | no | Timeout hacia Twenty; por defecto 20 segundos. |
| `PORT` | no | Puerto local; por defecto `3100`. |

## OAuth para Claude

No se instala un segundo sistema de usuarios. El conector anuncia Twenty como
servidor OAuth y reenvía a Twenty el token de la persona conectada.

1. Crear en Twenty una Application Registration para `Skilland CRM Claude`.
2. Añadir a esa aplicación la redirect URI que indique Claude al configurar el
   conector.
3. En Claude, añadir el conector Web con la URL pública terminada en `/mcp`.
4. En opciones avanzadas, introducir el Client ID y Client Secret de esa
   Application Registration.
5. Cada usuaria pulsa **Conectar** e inicia sesión en Twenty una sola vez.

El servicio nunca recibe ni almacena el Client Secret de Claude. Claude lo usa
directamente con el OAuth de Twenty.

## Despliegue

El `Dockerfile` ejecuta únicamente Node y estos dos módulos, sin copiar el CRM
ni sus credenciales. El ejemplo de Caddy publica el conector en un subdominio
separado, por lo que no cambia el tráfico actual de `crm.skilland.ai`.

Antes de habilitar writes, probar:

1. discovery OAuth y respuesta `401` con `WWW-Authenticate`;
2. login de una cuenta Twenty de prueba;
3. búsqueda de Company, Opportunity y Project;
4. creación y actualización de una Task de prueba;
5. creación de una Note de prueba y relación con un Project de prueba;
6. relectura de todos los registros creados.

No usar registros comerciales reales en el smoke test.

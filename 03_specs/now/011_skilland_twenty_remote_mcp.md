# 011 — Skilland Twenty Remote MCP

- Status: in_progress
- Date: 2026-09-02
- Owner: Skilland CRM Ops architecture
- Implementer target: `scripts/skilland_twenty_mcp`
- Canonical for: sustitución del conector local de Claude por un MCP remoto fino
- Last verified: 2026-10-03 (SKI-353: escrituras por REST y uso local con API key)
- Supersedes: none
- Superseded by: none
- Depends on: Twenty OAuth y Core API existentes
- Implementation report:
  `04_outputs/claude_twenty_mcp/2026-09-02_thin_mcp_implementation.md`

## Objetivo

Publicar un conector MCP remoto para Claude web y móvil sin actualizar Twenty y
sin trasladar interpretación conversacional al servidor. Claude resuelve
lenguaje natural; el MCP limita, autentica y ejecuta operaciones técnicas sobre
el CRM actual.

## Alcance

- OAuth delegado por usuario contra el authorization server de Twenty.
- MCP Streamable HTTP stateless sobre `/mcp`.
- Catálogo dinámico acotado a Company, Person, Opportunity, Project, Task y
  Note.
- Búsqueda, lectura, creación y actualización individual.
- Búsqueda y creación de NoteTarget y TaskTarget.
- Creación y actualización de registros por el Core REST API, para que lo
  escrito quede firmado por la credencial que llama y no como "Workflow".
- Uso local junto a los coworkers de Skilland (Hermes, P-SKI-85): escucha en
  `127.0.0.1` por defecto y acepta como Bearer la API key propia de cada
  coworker, que el conector no guarda.
- Corrección de schemas morph a `target*Id` y creación por `/rest/noteTargets`
  o `/rest/taskTargets`.
- Logs sin argumentos, cuerpos, tokens ni PII.
- Contenedor y configuración de reverse proxy separados del dominio actual de
  Twenty.

## Fuera de alcance

- interpretación de nombres, erratas o intención del usuario;
- borrados, desvinculaciones y operaciones masivas;
- metadata, workflows, archivos y envíos externos;
- GraphQL/REST arbitrario;
- API key global compartida;
- cambios de código, imagen o base de datos de Twenty.

## Frontera

El conector es una superficie de compatibilidad que delega el catálogo, los
esquemas y las lecturas al MCP oficial de Twenty con el Bearer del cliente.
Las escrituras (creación y actualización de los seis objetos y de las
relaciones NoteTarget/TaskTarget) emplean el Core REST API ya probado por
`crm_execution_crew`: el MCP oficial las ejecuta con su motor de workflows, que
no puede crear NoteTarget/TaskTarget ("Object cannot be created by workflow") y
firma todo como "Workflow" (comprobado el 3/10/2026, SKI-353). No existe acceso
directo a base de datos.

El servicio no se añade a la front door `crm:ops` ni cambia la readiness de sus
capabilities. Su publicación productiva requiere una revisión separada del
subdominio, OAuth client y smoke test.

## Criterios de aceptación

- [x] No se modifica ni actualiza Twenty.
- [x] El MCP no contiene resolución semántica de nombres.
- [x] Discovery OAuth RFC 9728 y challenge `WWW-Authenticate` están cubiertos
      por tests.
- [x] Solo se publican las operaciones y objetos allowlisted.
- [x] `learn_tools` devuelve UUIDs `target*Id` para NoteTarget y TaskTarget.
- [x] Los targets se crean con el token delegado y los campos REST correctos.
- [x] Tests offline cubren auth, catálogo, schemas, allowlist, relaciones y
      ausencia de datos sensibles en logs.
- [x] Las escrituras de registros van por REST, rechazan `deletedAt` y campos
      de auditoría, y quedan firmadas por la credencial que llama.
- [x] Escucha en `127.0.0.1` por defecto; HTTP solo en loopback.
- [ ] El contenedor está publicado en una URL HTTPS.
- [ ] Existe un OAuth Client de Twenty para Claude con redirect URI correcta.
- [ ] Un smoke test autenticado de escritura sobre registros de prueba ha sido
      verificado mediante relectura.

La spec permanece `in_progress` mientras falten los tres criterios de
despliegue; el runtime local no se presenta como productivo antes de ellos.

## Rollback

Deshabilitar el conector en Claude y retirar el subdominio/contenedor. No hay
migración ni cambio de Twenty que revertir.

# 011 — Skilland Twenty Remote MCP

- Status: in_progress
- Date: 2026-09-02
- Owner: Skilland CRM Ops architecture
- Implementer target: `scripts/skilland_twenty_mcp`
- Canonical for: sustitución del conector local de Claude por un MCP remoto fino
- Last verified: 2026-09-02
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

El conector es una superficie de compatibilidad que delega las operaciones
ordinarias al MCP oficial de Twenty usando el token OAuth del usuario. Solo las
dos creaciones de relaciones defectuosas emplean el Core REST API ya probado
por `crm_execution_crew`; no existe acceso directo a base de datos.

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
- [ ] El contenedor está publicado en una URL HTTPS.
- [ ] Existe un OAuth Client de Twenty para Claude con redirect URI correcta.
- [ ] Un smoke test autenticado de escritura sobre registros de prueba ha sido
      verificado mediante relectura.

La spec permanece `in_progress` mientras falten los tres criterios de
despliegue; el runtime local no se presenta como productivo antes de ellos.

## Rollback

Deshabilitar el conector en Claude y retirar el subdominio/contenedor. No hay
migración ni cambio de Twenty que revertir.

# Sustitución del conector Twenty CRM para Claude

## Decisión corregida

No se actualiza Twenty y tampoco se reimplementa el CRM. Se publica un MCP
overlay fino en una URL separada:

```text
https://mcp.crm.skilland.ai/mcp
```

El servicio reutiliza el OAuth, los permisos, el MCP dinámico y el API del
Twenty actual. Su única adaptación funcional es corregir las relaciones de
Notes y Tasks para que empleen los campos UUID reales terminados en `Id`.

Claude interpreta lenguaje natural, erratas y nombres aproximados. El MCP no
elige personas, empresas, deals o proyectos: devuelve candidatos y realiza la
operación cuando Claude ya dispone del ID inequívoco.

## Por qué se sustituye el conector actual

El conector local `twenty-crm-mcp-server`:

- publica un catálogo fijo y no incluye Projects;
- usa consultas de relaciones desfasadas para este workspace;
- depende de un proceso local, por lo que no sirve como conector remoto común
  para Claude web y móvil.

El Twenty actual ya dispone de un MCP dinámico con Companies, People,
Opportunities, Projects, Tasks, Notes y sus targets. También usa correctamente
`bodyV2`. El defecto observado está acotado a los schemas de creación de
`NoteTarget` y `TaskTarget`, que anuncian nombres de relación en lugar de los
campos UUID que acepta el API.

## Qué hace el nuevo servicio

- reenvía el protocolo MCP y el token OAuth individual hacia Twenty;
- reduce el catálogo a los seis objetos solicitados;
- permite buscar, leer, crear y actualizar registros individuales;
- permite buscar y crear relaciones de Notes y Tasks;
- traduce las relaciones a `targetCompanyId`, `targetPersonId`,
  `targetOpportunityId`, `targetProjectId` o `targetBusinessLineId`;
- bloquea operaciones masivas, borrados, metadata, workflows y herramientas
  ajenas al CRM solicitado;
- no guarda secretos ni registra cuerpos, argumentos o datos CRM.

La implementación está en:

```text
scripts/skilland_twenty_mcp/
```

## Autenticación sin cambiar Twenty

Twenty sigue siendo el servidor de identidad:

1. Se crea una Application Registration `Skilland CRM Claude` en Twenty.
2. Se configura la redirect URI facilitada por Claude.
3. El Owner añade en Claude el conector Web y, en opciones avanzadas, el Client
   ID y Client Secret de esa aplicación.
4. Cada usuaria conecta su propia cuenta Twenty.

El nuevo MCP recibe el token delegado y lo transmite a Twenty. Por tanto, cada
persona conserva los permisos de su cuenta y no se introduce una API key global
compartida.

## Sustitución reversible

1. Publicar el contenedor en `mcp.crm.skilland.ai` sin cambiar el dominio del
   CRM.
2. Registrar el cliente OAuth de Claude en Twenty.
3. Añadir el nuevo conector en Claude manteniendo el anterior desactivado.
4. Probar lectura sobre Company, Opportunity y Project de prueba.
5. Probar Task, Note y relaciones en registros de prueba.
6. Releer en Twenty y comprobar cuerpos, estados y enlaces.
7. Retirar el conector antiguo únicamente después del smoke test.

El rollback consiste en desactivar el conector nuevo y retirar el subdominio;
Twenty no cambia.

## Estado

El servicio, tests offline, contenedor e instrucciones de Claude están
preparados. No se ha publicado el subdominio, creado el cliente OAuth ni
realizado ninguna escritura live.

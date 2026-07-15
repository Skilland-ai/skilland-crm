# Skilland CRM Ops — Gate 008 policy kernel

## Estado y alcance

Esta es la front door local de `skilland-crm`. El slice enrutable sigue siendo
el de Gate 007: solo la
capability canónica `report.crm.export` en mode `read_only`. El alias exacto
`crm.export.chatgpt` resuelve al mismo adapter; no tiene executor propio.
Gate 007 limita este vertical a environment `test`: sandbox y production no
son todavía front-door ready porque el artefacto puede contener PII y no existe
una política de retención ejecutable.

El router no es el control plane global y no descubre scripts. Gate 008 añade
como librería interna canonical JSON/hash, finalización inmutable de planes,
PDP, approvals estructuradas, PEP, precondition verification y un store de
idempotencia in-memory de referencia. El mapa de workers del kernel está vacío
por defecto y el registry real no contiene ninguna capability
`apply_guarded`: ningún `apply` real queda habilitado.

Los módulos están en `scripts/skilland_crm_ops/policy/`. Los workers usados por
la suite son fakes inyectados, sin red ni filesystem del repo. El store
in-memory demuestra semántica, pero no es durable ni apto para producción;
Gate 009 deberá aportar el primer worker y adapter durable antes de promover
una capability de escritura.

El contrato inbound actual es provisional y local al repo:

- schema:
  `shared/contracts/skilland-crm-ops/repo-handoff.schema.json`
- versión: `0.1.0`
- autoridad: `skilland-crm-local`
- ejemplo:
  `shared/contracts/skilland-crm-ops/examples/repo-handoff-report-crm-export.json`

HomeLab/Hermes todavía no ha publicado un contrato global equivalente. Este
payload prueba la frontera y requerirá migración explícita cuando exista ese
canon global.

## Uso

~~~bash
yarn crm:ops --handoff-file=/ruta/al/handoff.json
~~~

Equivalente sin Yarn:

~~~bash
node scripts/skilland_crm_ops/harness.mjs \
  --handoff-file=/ruta/al/handoff.json
~~~

El harness acepta exactamente un fichero JSON regular de hasta 256 KiB. Emite
un único `OperationResult` JSON por stdout y eventos JSON redactados por
stderr. Exit codes:

- `0`: `succeeded` o `simulated`;
- `2`: petición bloqueada por contrato/policy/configuración;
- `1`: fallo seguro después de autorizar la ejecución.

No ejecutes el ejemplo versionado como prueba rutinaria: aun declarando `test`,
con configuración real coincidente iniciaría lecturas CRM y crearía un
artefacto local. La suite E2E usa un reader fake y un root temporal.

## Binding live obligatorio

El adapter resuelve configuración solo después de superar routing y antes de
la primera lectura. La policy Gate 007 exige `environment.name=test` y bloquea
sandbox/production antes del adapter. No usa los defaults ni el fichero de
credenciales del CLI legacy. Requiere:

- `SKILLAND_CRM_OPS_ENVIRONMENT`, igual al environment del request;
- `SKILLAND_CRM_OPS_WORKSPACE`, igual al workspace del request;
- `TWENTY_API_KEY`;
- `TWENTY_BASE_URL`.

En `test` puede usarse HTTP(S); el reader ya exige HTTPS para cualquier entorno
superior que una gate futura habilite. La ausencia o discrepancia devuelve un
resultado bloqueado; no existe fallback implícito a production.

## Política del export

El request debe declarar exactamente Markdown, exclusión `IA Mujeres`, entre
1 y 1000 records, un artefacto, el prefix
`04_outputs/crm_manual_update_session`, no overwrite, un byte cap de hasta
5 MiB y todos los flags externos/destructivos en `false`.

El reader solo expone metadata GET y GraphQL query. El worker bloquea antes de
persistir si no puede demostrar completitud de opportunities, notes, tasks,
business line y señales IA Mujeres/tags. El artifact store crea un basename
controlado por `requestId`, usa `wx`, verifica modo `0600`, bytes y SHA-256 y
limpia un fichero parcial ante fallo.

El result registra únicamente path relativo, media type, SHA, bytes, conteos y
completitud. Nunca incluye el Markdown ni datos CRM.

## Tests offline

~~~bash
yarn crm:ops:test
~~~

O directamente:

~~~bash
node --test \
  scripts/skilland_crm_ops/router.test.mjs \
  scripts/skilland_crm_ops/adapters/adapters.test.mjs \
  scripts/skilland_crm_ops/policy/policy.test.mjs
~~~

La suite del kernel puede ejecutarse aisladamente con
`npm run crm:ops:policy:test`. No existe un comando `apply` nuevo.

Las pruebas normales reemplazan el CRM reader, bloquean cualquier uso de
`globalThis.fetch` y escriben únicamente en directorios temporales. Una prueba
live futura deberá ser opt-in y autorizada de forma separada.

## Compatibilidad y fallback

`yarn crm:export` permanece como entrypoint legacy explícito y comparte el
servicio query-only endurecido. No es un fallback automático: si `crm:ops`
bloquea una petición, el caller debe corregirla o seleccionar conscientemente
la superficie legacy con sus reglas documentadas en
`scripts/crm_manual_update_crew/README_EXPORT.md`.

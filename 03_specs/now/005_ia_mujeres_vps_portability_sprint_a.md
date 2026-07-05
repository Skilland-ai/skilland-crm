# 005 · IA Mujeres VPS Portability Sprint A

- Status: active
- Date: 2026-07-04
- Owner: arquitectura/spec
- Executor esperado: sesión implementadora separada

## Objetivo

Portar al VPS `skilland` el frente **IA Mujeres operativo sobre CRM** que todavía depende de rutas legacy de credenciales y auth local, sin abrir todavía el frente de repos/datasets externos ambiguos.

En esta spec, **portar** significa:
- eliminar dependencia rígida de `/home/reboot/.claude.json`;
- eliminar dependencia rígida de `scripts/.env` para auth de usuario;
- introducir bootstrap portable y explícito para credenciales;
- mantener comportamiento funcional del script;
- verificar en este VPS, con salidas reales, que cada script arranca o ejecuta su caso mínimo esperado.

No significa todavía:
- resolver repos fuente externos no presentes en este VPS;
- rediseñar imports históricos de datasets;
- rehacer la arquitectura del repo;
- conectar Hermes, MCP, WhatsApp o canales externos.

---

## Contexto estratégico

Ya quedó demostrado en este VPS que el patrón portable funciona para `crm_manual_update_crew`:
- `yarn crm:export` funciona con credenciales locales portables;
- `yarn crm:review --dry-run` funciona con credenciales locales portables;
- el problema ya no es conceptual: es extender el patrón al legacy útil.

El inventario previo separó cuatro clases:
- portable ya;
- portable si clonamos/replicamos fuente;
- portable si redefinimos origen;
- mejor congelar / decidir antes.

Esta spec ataca **solo la clase portable ya** del frente IA Mujeres.

---

## Alcance

### Scripts dentro de alcance

1. `scripts/ia_mujeres_batch_runner.mjs`
2. `scripts/ia_mujeres_authorized_bulk_batch.mjs`
3. `scripts/ia_mujeres_reset_crm_views.mjs`
4. `scripts/ia_mujeres_crm_smoke_test_v1.mjs`
5. `scripts/ia_mujeres_crm_workflows_v1.mjs`
6. `scripts/ia_mujeres_crm_test_workflows_v1.mjs`

### Patrones a eliminar dentro de alcance

- lectura directa de `/home/reboot/.claude.json`
- lectura rígida de `scripts/.env` para `TWENTY_CRM_PASSWORD`
- mensajes de error que asumen solo el host/usuario `reboot`

### Fuera de alcance

1. `scripts/ia_mujeres_crm_import.mjs`
2. `scripts/ia_mujeres_crm_import_v2.mjs`
3. `scripts/reboot_orientation_crm_import.mjs`
4. `scripts/reboot_orientation_import_single_lead.mjs`
5. cualquier repo externo en `/home/reboot/Escritorio/...`
6. cualquier secreto real embebido en código o en documentación versionada
7. automatizaciones externas, cron, Hermes gateway, MCP, WhatsApp, Gmail productivo

---

## Resultado esperado

Al terminar:

1. Los 6 scripts dentro de alcance ya no dependerán de `/home/reboot/.claude.json`.
2. Los scripts que solo necesitan API key/base URL resolverán credenciales con el mismo patrón ya validado en `scripts/crm_manual_update_crew/twenty-client.mjs`.
3. El script que requiere auth de usuario (`ia_mujeres_crm_test_workflows_v1.mjs`) usará un patrón local portable y explícito para password/token, sin `scripts/.env` rígido.
4. Quedará documentación mínima en el repo CRM para bootstrap seguro.
5. Habrá evidencia real de ejecución en este VPS para cada pieza tocada.

---

## Decisiones de diseño

### D1. Reutilizar patrón ya probado en vez de inventar otro

La fuente de verdad para credenciales Twenty en este repo debe converger hacia el patrón ya validado:
- `TWENTY_API_KEY`
- `TWENTY_BASE_URL`
- `TWENTY_CREDENTIALS_FILE`
- `~/.config/skilland/twenty.json`
- `~/.claude.json`
- `/home/reboot/.claude.json` solo como fallback legacy cuando proceda

La implementación puede:
- importar `readTwentyCredentials` desde `scripts/crm_manual_update_crew/twenty-client.mjs`, o
- extraer un helper común reusable si mejora claridad sin dispersar más deuda.

Preferencia: **KISS**. No crear una capa nueva grande si basta con reutilizar el helper existente o extraer uno pequeño compartido.

### D2. Separar auth de servicio y auth de usuario

`ia_mujeres_crm_test_workflows_v1.mjs` no debe seguir leyendo `TWENTY_CRM_PASSWORD` desde `scripts/.env`.

Debe pasar a un mecanismo portable y explícito, por ejemplo:
- `TWENTY_CRM_PASSWORD` por env var, y/o
- fichero local no versionado tipo `~/.config/skilland/twenty-user.json`

La spec no obliga el nombre exacto del fichero si el implementador encuentra uno más claro, pero sí obliga:
- que sea local al host;
- que no quede versionado;
- que esté documentado;
- que falle con mensaje claro si falta.

### D3. No rediseñar la lógica de negocio

La spec es de **portabilidad**, no de reescritura funcional.

No cambiar salvo necesidad mínima:
- queries CRM
- reglas de selección
- stages
- semantics del smoke test
- estructura de outputs

### D4. Fallo honesto antes que defaults falsos

Si un script requiere password/JWT humano y no está montado, debe fallar así:
- con error explícito;
- diciendo qué variable o fichero local falta;
- sin volver a rutas legacy silenciosas raras.

---

## Cambios esperados por archivo

## 1) `scripts/ia_mujeres_batch_runner.mjs`

### Cambio esperado
- reemplazar `readCredentials()` legacy por resolver portable.

### Verificación mínima
- `node scripts/ia_mujeres_batch_runner.mjs --help`
- al menos un modo read-only o dry-run que no haga mutations peligrosas si existe uno razonable

## 2) `scripts/ia_mujeres_authorized_bulk_batch.mjs`

### Cambio esperado
- reemplazar `readCredentials()` legacy por resolver portable.

### Verificación mínima
- `node scripts/ia_mujeres_authorized_bulk_batch.mjs --help`
- una ejecución de planner no destructiva, por ejemplo con `--limit=1` o equivalente seguro

## 3) `scripts/ia_mujeres_reset_crm_views.mjs`

### Cambio esperado
- reemplazar `readCredentials()` legacy por resolver portable.

### Verificación mínima
- `node scripts/ia_mujeres_reset_crm_views.mjs --help`
- si dry-run por defecto sigue siendo seguro, ejecutar sin `--apply`

## 4) `scripts/ia_mujeres_crm_smoke_test_v1.mjs`

### Cambio esperado
- reemplazar `readCredentials()` legacy por resolver portable.

### Verificación mínima
- si el script soporta dry-run o una fase segura, usar esa vía
- si no existe dry-run claro, al menos validar resolución de credenciales con script temporal de verificación y documentar el límite

## 5) `scripts/ia_mujeres_crm_workflows_v1.mjs`

### Cambio esperado
- reemplazar `readCredentials()` legacy por resolver portable.

### Verificación mínima
- ejecución segura sin `--apply` si el script ya es dry-run por defecto
- o `--help` + validación ad-hoc del resolver si no hay un path seguro mejor

## 6) `scripts/ia_mujeres_crm_test_workflows_v1.mjs`

### Cambio esperado
- separar `TWENTY_API_KEY`/`TWENTY_BASE_URL` del secreto de usuario
- eliminar dependencia rígida de `scripts/.env`
- soportar env var o fichero local portable para `TWENTY_CRM_PASSWORD`
- mantener `--password` como override puntual si ya existe y sigue siendo útil

### Verificación mínima
- `node ... --help` si aplica
- verificación ad-hoc del resolver de password/credenciales
- si existe camino seguro de dry-run, usarlo; si no, documentar por qué no se ejecuta el apply

---

## Documentación esperada

Actualizar en el repo CRM lo mínimo necesario para que otro operador entienda el bootstrap:

### Candidatos mínimos
- `shared/knowledge/...` o `shared/orchestration/...` donde encaje mejor el frente IA Mujeres
- o una nota corta nueva si no existe sitio claro

### Debe quedar explicado
1. dónde va `TWENTY_API_KEY`
2. dónde va `TWENTY_BASE_URL`
3. si hace falta auth de usuario, dónde va `TWENTY_CRM_PASSWORD` o equivalente
4. qué scripts quedan ya portables en VPS
5. qué scripts siguen fuera de alcance por depender de repos/datasets externos

No escribir documentación teatral ni larga. Solo bootstrap y límites reales.

---

## Evidencia requerida

El implementador debe dejar evidencia repo-backed en `skilland-crm`, no en HomeLab.

### Mínimo requerido
1. spec actualizada solo si necesita estado final
2. output o run note en el repo CRM con:
   - archivos tocados
   - comandos ejecutados
   - qué pasó de verdad
   - qué quedó verificado y qué no
   - bloqueos reales si aparecen

Si el repo ya tiene un lugar natural de reportes para este frente, usarlo. Si no, crear un output markdown corto y sobrio bajo `04_outputs/`.

---

## Criterios de aceptación

La spec se considera cumplida solo si se cumplen **todos**:

1. búsqueda en scripts de alcance no devuelve nuevas dependencias activas a `/home/reboot/.claude.json`
2. `ia_mujeres_crm_test_workflows_v1.mjs` ya no depende rígidamente de `scripts/.env`
3. los scripts tocados conservan `--help` o comportamiento seguro esperado
4. existe verificación real por comando o verificación ad-hoc cuando no haya suite/dry-run canónica
5. la documentación mínima de bootstrap quedó en el repo CRM
6. no se tocaron scripts fuera de alcance salvo ajuste trivial imprescindible y justificado

---

## No-alcance explícito

No hacer en esta spec:
- portar imports que dependen de `data_prep`
- clonar repos externos
- redefinir Supabase/orígenes de datasets
- limpiar todo el legacy IA Mujeres
- introducir MCP
- rediseñar el repo alrededor de un meta-harness
- convertir esto en gran refactor de utilidades compartidas

---

## Riesgos conocidos

1. algunos scripts pueden no tener dry-run real aunque conceptualmente sean seguros;
2. `ia_mujeres_crm_test_workflows_v1.mjs` toca auth de usuario y puede requerir un patrón más fino que el resto;
3. puede aparecer una tensión entre reutilizar `twenty-client.mjs` y no arrastrar dependencias innecesarias del crew manual;
4. si un script solo se valida por `--help` más resolver ad-hoc, eso es verificación parcial y debe llamarse así.

---

## Estrategia recomendada de implementación

Orden sugerido:
1. resolver helper portable común o reutilización directa
2. portar scripts de solo API key/base URL
3. portar script con password/JWT humano
4. actualizar documentación
5. ejecutar verificación real y dejar run note/output

No hacer seis refactors desordenados y luego intentar entender qué rompió qué.

---

## Prompt /goal para la sesión implementadora

```text
/goal Ejecuta la spec activa del repo CRM en `/home/skilland/workspaces/skilland-crm/03_specs/now/005_ia_mujeres_vps_portability_sprint_a.md`.

Trabaja como implementador disciplinado, no como estratega: la spec manda. Lee primero la spec y los archivos afectados, haz solo los cambios dentro de alcance, verifica con comandos reales o verificación ad-hoc honesta cuando no exista suite/dry-run canónica, y deja la evidencia final dentro del repo `skilland-crm`, no en HomeLab.

Reglas clave:
- no tocar scripts fuera de alcance salvo ajuste trivial imprescindible y justificado;
- no introducir secretos en código o docs versionadas;
- no abrir frentes de repos externos, Supabase, MCP, WhatsApp o arquitectura nueva;
- si encuentras una contradicción real en la spec o un bloqueo técnico no trivial, paras y la reportas con evidencia.
```

---

## Qué validaré al volver del implementador

1. `git status --short --branch`
2. diff de los scripts de alcance
3. ausencia de dependencias activas a `/home/reboot/.claude.json` y `scripts/.env` en el alcance
4. documentación mínima creada/actualizada en CRM
5. evidencia real de verificación
6. clasificación de restos pendientes para la siguiente spec

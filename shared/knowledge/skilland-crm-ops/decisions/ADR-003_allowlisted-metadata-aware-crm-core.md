# ADR-003 — CRM Core metadata-aware y allowlisted

- Status: accepted
- Owner: Skilland CRM Ops architecture
- Canonical for: criterio de habilitación de objetos y operaciones CRM
- Last verified: 2026-07-13
- Supersedes: propuesta Phase 0 de CRUD metadata-driven para cualquier objeto soportado
- Superseded by: none

## Contexto

Twenty expone metadata e interfaces que permiten descubrir objetos, fields,
relaciones y mutations. Esa información es valiosa para evitar payloads
obsoletos, pero no contiene la intención de negocio, blast radius, madurez de
tests ni autorización de Skilland.

Un CRUD universal que habilite automáticamente todo lo descubierto confundiría
capacidad técnica con permiso operativo. También expondría objetos nuevos,
deletes o metadata changes sin revisión específica.

## Decisión

CRM Core será **metadata-aware** y **allowlisted**:

- metadata e introspección sirven para descubrir y validar schema live;
- el capability registry y allowlists versionadas autorizan objeto, operación,
  fields, environment, mode y scope;
- toda combinación no allowlisted queda read-only o `denied`;
- los objetos descubiertos después de publicar la policy no heredan writes;
- contract y tests se crean por capability de negocio, no por endpoint genérico.

El primer allowlist de Gate 009 se limita a notes, tasks y subsets concretos de
Opportunity. La spec de ese gate debe enumerar operations y fields exactos a
partir de evidencia actualizada.

Delete, destroy, metadata mutations y workflow activation permanecen `denied`.
Restore tampoco se habilita hasta probar semántica, precondiciones y recovery en
el entorno objetivo.

## Separación adicional

- **Record operations:** pertenecen a CRM Core cuando están allowlisted.
- **Metadata administration:** usa el owner especializado
  `crm-metadata-admin`, con capabilities, policy y worker propios; CRM Core
  puede leer metadata para validar, pero no posee sus mutations.
- **Workflow automation:** no es CRUD; requiere modelado de trigger, blast
  radius, test isolation, activation y kill switch.
- **Activity helpers:** notes/tasks siguen contratos de target linking y
  ambiguity handling, no mutations abiertas.

## Consecuencias

### Positivas

- Un cambio del schema live puede bloquear un plan sin ampliar autoridad.
- Cada write tiene un caso de uso, owner, límites y tests conocidos.
- Es posible avanzar incrementalmente sin diseñar un kernel universal antes de
  obtener valor.
- Los nuevos objetos Twenty nacen seguros por defecto.

### Costes

- Ampliar cobertura requiere actualizar registry, contracts, policy y tests.
- Habrá más adapters/operations tipadas que en un wrapper GraphQL genérico.
- La introspección por sí sola no reduce todo el trabajo de integración.

## Alternativas descartadas

- **Habilitar todas las mutations introspectadas:** demasiado privilegio y
  sensibilidad a cambios upstream.
- **Hardcodear schema sin metadata:** se degrada ante custom fields y opciones
  live.
- **Mantener múltiples write crews permanentes:** conserva divergencia de
  validación, safety y auditoría.

## Verificación

Los tests deben demostrar que un objeto/field/mutation visible en metadata pero
ausente del allowlist no puede producir un plan aplicable. También deben
bloquear metadata drift entre plan y execution.

## Fuentes y evidencia

- `04_outputs/crm_agents_overhaul_audit/2026-07-06_crm_agents_overhaul_audit.md`,
  inventario del alcance parcial de CRM Execution v1.
- `scripts/crm_execution_crew/`, metadata validation y operaciones soportadas.
- `shared/knowledge/twenty-workflows/2026-06-07_api_mcp_capabilities.md`.
- `shared/contracts/skilland-crm-ops/capability-registry.json` y su schema.

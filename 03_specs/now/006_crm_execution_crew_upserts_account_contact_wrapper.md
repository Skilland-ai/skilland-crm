# 006 · CRM Execution Crew Upserts + Account/Contact/Deal Wrapper

- Status: implemented
- Date: 2026-07-05
- Owner: crm-execution-crew

## Objetivo

Extender `crm_execution_crew` para soportar altas y actualizaciones idempotentes
de companies/accounts, people/contacts, opportunities/deals, notes y tasks desde
un unico `CrmActionRequest`.

El objetivo operativo es que Hermes solo tenga que generar un JSON y ejecutar
`yarn crm:execute --request-file=<json>`, sin crear scripts live ad-hoc en
`04_outputs/`.

## Contrato JSON

Operation types nuevos:

- `create_company`
- `update_company`
- `upsert_company`
- `create_person`
- `update_person`
- `upsert_person`
- `upsert_account_contact_opportunity`

Los operation types previos siguen vigentes sin cambios.

## Reglas De Upsert

- `create_*`: si el lookup encuentra un record existente, bloquea y recomienda
  usar upsert.
- `update_*`: requiere un unico record existente.
- `upsert_*`: si hay un unico match, actualiza; si no hay match, crea; si hay
  multiples matches, bloquea.
- `create_company` requiere `data.name`.
- `create_person` requiere `data.emails.primaryEmail` y `data.name`.
- Ambiguedad siempre bloquea. No se permite elegir el primer resultado.

## Wrapper Compuesto

`upsert_account_contact_opportunity` recibe:

- `lookup.companyId`, `lookup.companyDomain` o `lookup.companyName`
- `lookup.personId` o `lookup.personEmail`
- `lookup.opportunityId` o `lookup.opportunityName`
- `company.data`
- `person.data`
- `opportunity.data`
- `note`
- `task`

El planner expande el wrapper en este orden:

1. upsert company
2. upsert person, enlazada a la company
3. upsert opportunity, enlazada a company/person
4. create note y link a opportunity/person/company
5. create task y link a opportunity/person/company

Si company/person/opportunity se crean en la misma ejecucion, el plan usa temp
IDs internos y el executor los resuelve antes de llamar a GraphQL/REST.

## Reglas Para Hermes

Hermes debe usar este flujo para altas CRM compuestas:

```bash
yarn crm:execute --request-file=<path>
yarn crm:execute --request-file=<path> --apply --yes
```

No debe crear scripts `.mjs` ad-hoc para aplicar cambios CRM live cuando el caso
encaje en este contrato.

## Aceptacion

- El wrapper permite cubrir casos tipo FIFEDE con un unico request JSON.
- Dry-run no escribe en CRM y muestra el plan completo.
- Apply mantiene Safety Reviewer, `--apply`, `--yes` y logs auditados.
- El test canonico pasa:

```bash
node --test scripts/crm_execution_crew/crm-execution-crew.test.mjs
```

## Prompt /goal Para Hermes

Para futuras sesiones de implementacion o mantenimiento, usar:

```text
/goal Implementa o mantiene la spec `03_specs/now/006_crm_execution_crew_upserts_account_contact_wrapper.md`.

Restricciones:
- No crees scripts ad-hoc para aplicar cambios CRM live.
- No ejecutes `--apply` contra el CRM real salvo instruccion explicita del usuario.
- Usa el entrypoint existente `yarn crm:execute` y el kernel de `scripts/crm_execution_crew`.
- Mantén dry-run por defecto, Safety Reviewer y logs auditados.
- Añade o actualiza tests unitarios/fake-client y ejecuta `node --test scripts/crm_execution_crew/crm-execution-crew.test.mjs`.
- Actualiza README y ejemplos JSON cuando cambie el contrato.
- Al terminar, reporta archivos modificados, tests ejecutados y cualquier limite fuera de contrato.
```

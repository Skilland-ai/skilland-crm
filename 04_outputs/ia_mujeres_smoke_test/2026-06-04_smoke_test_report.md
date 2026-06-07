# IA Mujeres Smoke Test Report

- Date: 2026-06-04
- Mode: dry-run
- Prefijo: `TEST —`

## 1. Registros creados

| Tipo | Nombre | Estado |
|------|--------|--------|
| Business Line | TEST — SkilLand IA Mujeres | ⚠️ planned |
| Company | TEST — Remote Academy Internal | ⚠️ planned |
| Person | TEST — Raúl Recipient | ⚠️ planned |
| Deal | TEST — Remote Academy — IA Mujeres 2026 | ⚠️ planned |
| Campo testMode | Opportunity.testMode | ⚠️ planned |
| Vista | TEST — IA Mujeres Smoke Test | ⚠️ planned  |
| Workflow | TEST — WF-2 Primer email enviado | ⚠️ planned  |

## 2. Simulación de transiciones

| Transición | Resultado | Notas |
|------------|-----------|-------|
| (dry-run) | skipped | Ejecutar con --apply |

## 3. Email test

**Estado**: pendiente confirmación del usuario.

Para enviar el email de prueba, el usuario debe confirmar:
- Cuenta emisora (Remote Academy)
- Cuenta receptora (del propio usuario)

Asunto preparado:
```
[TEST IA Mujeres] Primera conversación sobre IA, mujeres y futuro del trabajo
```

Cuerpo preparado:
```
Hola,

Este es un correo de prueba interno para validar el flujo CRM + email de la campaña SkilLand IA Mujeres.

El objetivo es comprobar que podemos:
1. Enviar un primer email
2. Registrar el envío en el CRM
3. Actualizar el estado del deal
4. Crear una tarea de seguimiento
5. Detectar o registrar una respuesta

No es un envío real de campaña.

Un saludo,
TEST — SkilLand IA Mujeres
```

Una vez confirmadas las cuentas, ejecutar:
```bash
# Fase 5 — Google Workspace CLI
# (conectar Gmail y crear borrador)
```

## 4. Limitaciones detectadas

### Twenty CRM
- Los workflows en DRAFT no se disparan automáticamente — validación real requiere activarlos manualmente en UI
- Los steps IF_ELSE creados por API pueden necesitar ajuste en el editor visual (outputSchema, conexión de ramas)
- El campo `testMode` no aparece en las vistas por defecto — añadir manualmente a la vista TEST

### MCP / API
- No hay endpoint directo para activar/desactivar workflows con condición granular de campo
- Las task targets (relación task ↔ opportunity) no se pueden configurar en CREATE_RECORD via API fácilmente

### GWS CLI
- No conectado todavía — email test queda pendiente hasta Fase 5
- Sin GWS, el cambio de outreachStatus tras envío de email debe hacerse manualmente via API

## 5. Cómo limpiar los registros de test

```javascript
// Borrar en este orden (para evitar FK conflicts):
// 1. Deal: deleteOpportunity(id: "ID_DEAL")
// 2. Person: deletePerson(id: "ID_PERSON")
// 3. Company: deleteCompany(id: "ID_COMPANY")
// 4. Business Line: deleteBusinessLine(id: "ID_BL")
// 5. Workflow: deleteWorkflow(id: "ID_WF")
// 6. Vista: deleteCoreView(input: {id: "ID_VIEW"})
```

## 6. Recomendación para campaña real

_(dry-run — ejecutar con --apply para ver resultados reales)_

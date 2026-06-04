# IA Mujeres Smoke Test Report

- Date: 2026-06-04
- Mode: apply
- Prefijo: `TEST —`

## 1. Registros creados

| Tipo | Nombre | Estado |
|------|--------|--------|
| Business Line | TEST — SkilLand IA Mujeres | ♻️ reutilizado |
| Company | TEST — Remote Academy Internal | ♻️ reutilizado |
| Person | TEST — Raúl Recipient | ♻️ reutilizado |
| Deal | TEST — Remote Academy — IA Mujeres 2026 | ♻️ reutilizado |
| Campo testMode | Opportunity.testMode | ♻️ reutilizado |
| Vista | TEST — IA Mujeres Smoke Test | ♻️ reutilizado  |
| Workflow | TEST — WF-2 Primer email enviado | ♻️ reutilizado  |

## 2. Simulación de transiciones

| Transición | Resultado | Notas |
|------------|-----------|-------|
| pending_first_email → first_email_sent | ok |  |
| check tasks created | no tasks (workflow is DRAFT — expected) | Workflows en DRAFT no disparan automáticamente |
| first_email_sent → replied | ok |  |
| final state read | ok | {"id":"91206aa3-d290-4501-9c15-3b8064908fdd","name":"TEST — Remote Academy — IA Mujeres 2026","stage":"POSSIBLE_OPPORTUNITY","outreachStatus":"replied","campaignName":"TEST — IA Mujeres 2026","testMode":true} |
| reset → pending_first_email | ok |  |

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
// 1. Deal: deleteOpportunity(id: "91206aa3-d290-4501-9c15-3b8064908fdd")
// 2. Person: deletePerson(id: "06a7d1ea-a295-4260-9c31-ee73037b27c6")
// 3. Company: deleteCompany(id: "26c3191b-2f69-4a9e-8352-a86c3176fbcb")
// 4. Business Line: deleteBusinessLine(id: "edf00ea0-3cb6-4df9-92f1-4641fb9b1210")
// 5. Workflow: deleteWorkflow(id: "9de550ec-626e-421f-bc61-300dfe7ffa19")
// 6. Vista: deleteCoreView(input: {id: "c50c6c82-1085-436e-a6fd-0f345bea4f7b"})
```

## 6. Recomendación para campaña real


### Qué se puede automatizar ya
- ✅ Cambios de `outreachStatus` vía API/script
- ✅ Creación de deals y actualización de campos vía API
- ✅ Workflows en DRAFT configurados con trigger correcto
- ✅ Vista de filtrado por campaña

### Qué debe seguir manual
- ⏳ Activar workflows (requiere validación UI de steps IF_ELSE)
- ⏳ Envío de emails (requiere Fase 5 GWS CLI)
- ⏳ Detección de respuestas (requiere GWS + webhook o polling)

### Antes de enviar correos reales
1. Completar steps en UI (especialmente IF_ELSE y taskTarget)
2. Activar WF-1 (solo opportunity.created) y validar
3. Conectar GWS en Fase 5
4. Preparar lote inicial desde vista "IA Mujeres — Todos"
5. Confirmar con el usuario antes de cada envío masivo

### ¿Se puede pasar a Fase 5?
**Sí** — el smoke test confirma que:
- El CRM tiene los campos necesarios
- Las transiciones de estado funcionan via API
- Los workflows existen en DRAFT listos para completar en UI
- No se ha enviado ningún email real


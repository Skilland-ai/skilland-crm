---
name: crm-export
description: Genera el export read-only del CRM para ChatGPT, excluyendo siempre IA Mujeres, y deja el Markdown en 04_outputs/crm_manual_update_session.
---

Usa este skill cuando el usuario quiera sacar un export actualizado del CRM para compartirlo fuera del sistema.

## Reglas

- Mantener modo solo lectura.
- No ejecutar mutations.
- No crear, editar o cerrar registros en CRM.
- No mostrar secretos ni API keys.
- Excluir siempre IA Mujeres.

Excluir un deal si hay cualquier senal clara de IA Mujeres, incluyendo:

- `businessLine` o `businessLineName` con `IA Mujeres` o `SkilLand IA Mujeres`
- nombre del deal con `IA Mujeres`
- `campaignName` con `IA Mujeres`
- `iaMujeresFunnelStage` con valor
- notas, tareas, tags o custom fields que indiquen el funnel dedicado de IA
  Mujeres

## Ejecucion

1. Ejecuta `node scripts/crm_manual_update_crew/export-para-chatgpt.mjs`.
2. Reutiliza el exportador existente y no reimplementes ni sustituyas el flujo.
   Si el script no existe, bloquea e informa del hueco.
3. Al terminar, devuelve:
   - comando ejecutado
   - ruta del Markdown generado
   - total deals leidos
   - total deals exportados
   - total deals IA Mujeres excluidos
   - confirmacion de que no se escribio nada en CRM

`yarn crm:export` es un alias equivalente del repo cuando Yarn esta inicializado.

## Salida esperada

El script debe generar:

`04_outputs/crm_manual_update_session/crm_export_para_chatgpt_<timestamp>.md`

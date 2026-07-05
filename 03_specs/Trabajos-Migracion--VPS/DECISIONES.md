# Decisiones — Migración VPS CRM

Fecha: 2026-07-04
Rama: `vps-hermes-1`

## Decisiones tomadas

1. **Spec 005 aceptada**
   - Se da por buena la portabilidad Sprint A de IA Mujeres.
   - Las reservas detectadas son de higiene/trazabilidad, no bloqueantes.

2. **Hacer limpieza ligera**
   - Hay que ordenar outputs históricos tocados durante verificación.
   - No debe convertirse en gran refactor.

3. **Imports IA Mujeres: pendiente de descubrimiento**
   - Raúl no puede decidir todavía sobre fuente canónica porque no está claro qué hacen exactamente `ia_mujeres_crm_import.mjs` y `ia_mujeres_crm_import_v2.mjs`.
   - Antes de portar, hay que explicar en cristiano qué importan, de dónde sacan datos, qué diferencia hay entre ambos y cuál debería sobrevivir.

4. **No decidir aún `v1` vs `v2`**
   - La decisión queda bloqueada hasta que exista diagnóstico comprensible de ambos scripts.

5. **Reboot Orientation fuera por ahora**
   - Scripts afectados:
     - `scripts/reboot_orientation_crm_import.mjs`
     - `scripts/reboot_orientation_import_single_lead.mjs`
   - Motivo: pertenecen a otro frente y dependen de repo/fuente externa.
   - Se retoma más adelante si ese frente vuelve a ser prioritario.

6. **Cola IA Mujeres con `0 eligible opportunities` sin acción**
   - No se considera bug de migración.
   - El planner está actuando como guardarraíl: los pendientes actuales tienen datos malos o exclusiones duras.
   - No tocar por ahora.

## Decisión de rama

Todo este trabajo continúa en rama:

```bash
vps-hermes-1
```

No continuar estos cambios en `main`.

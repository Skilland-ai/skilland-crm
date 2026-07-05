# Backlog — Migración VPS CRM

## Siguiente trabajo recomendado

### 006 · Cierre ligero de Spec 005

Objetivo:
- cerrar formalmente la spec 005 como aceptada;
- documentar verificación final;
- separar o registrar outputs históricos modificados;
- dejar claro qué quedó migrado y qué queda pendiente.

No-alcance:
- no tocar imports legacy;
- no tocar Reboot Orientation;
- no rediseñar helpers;
- no conectar sistemas externos.

## Después

### 007 · Descubrimiento de imports IA Mujeres

Objetivo:
- explicar qué hacen:
  - `scripts/ia_mujeres_crm_import.mjs`
  - `scripts/ia_mujeres_crm_import_v2.mjs`
- identificar diferencias reales entre ambos;
- identificar fuente actual del dato;
- proponer cuál sobrevive o si ambos se congelan;
- traducirlo a una decisión que Raúl sí pueda tomar.

Resultado esperado:
- diagnóstico en cristiano;
- tabla de inputs/outputs;
- riesgos;
- recomendación de fuente canónica;
- siguiente spec de portabilidad si procede.

## Dejados para luego

### Reboot Orientation

Scripts:
- `scripts/reboot_orientation_crm_import.mjs`
- `scripts/reboot_orientation_import_single_lead.mjs`

Estado:
- fuera de foco por ahora;
- depende de repo/funnel externo y `.env.local`;
- no tocar hasta que Raúl priorice ese frente.

### Limpieza operativa de datos IA Mujeres

Tema:
- `ia_mujeres_authorized_bulk_batch.mjs` devuelve `0 eligible opportunities` porque los pendientes actuales están excluidos o tienen datos malos.

Estado:
- no es bug de migración;
- no actuar por ahora.

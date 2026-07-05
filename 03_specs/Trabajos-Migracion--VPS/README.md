# Trabajos Migración VPS

Rama de trabajo: `vps-hermes-1`

## Propósito

Carpeta de planificación para la migración operativa del repo CRM al VPS `skilland`.

Aquí se dejan las decisiones, specs y backlog de migración sin mezclarlo con HomeLab. HomeLab puede seguir actuando como contexto/orquestación, pero las specs de este repo viven aquí.

## Estado actual

- La spec `005 · IA Mujeres VPS Portability Sprint A` queda aceptada funcionalmente.
- El frente de credenciales/runtime CRM ya está probado en VPS.
- El bloque IA Mujeres portable por credenciales ya está migrado en lo esencial.
- Queda una limpieza ligera de artefactos y specs históricas tocadas por verificación.
- Los imports legacy de IA Mujeres requieren descubrimiento previo: todavía no está claro qué import sigue vivo ni cuál es la fuente canónica del dato.
- El frente Reboot Orientation queda explícitamente fuera por ahora.

## Regla operativa

A partir de ahora, los trabajos de migración del CRM al VPS se planifican en esta rama y en esta carpeta, salvo que Raúl indique otra cosa.

No trabajar en `main` para estos cambios.

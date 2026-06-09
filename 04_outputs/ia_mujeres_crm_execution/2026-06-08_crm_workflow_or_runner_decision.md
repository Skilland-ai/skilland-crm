# CRM Workflow Or Runner Decision — IA Mujeres

Fecha: 2026-06-08

## Decisión

Usar runners/scripts como motor operativo inicial y dejar Twenty Workflows nativos para una fase posterior.

Motivo: los eventos críticos vienen de Gmail, requieren IDs de hilo, validación de adjuntos/firma y autorización humana. Un workflow nativo de CRM puede reaccionar bien a campos ya consolidados, pero no debe decidir envíos ni interpretar Gmail en esta fase.

## Implementado ahora por runner

| Caso | Mecanismo | Estado |
|---|---|---|
| Auditar campaña | `ia_mujeres_batch_runner --mode=audit` | Implementado |
| Crear campos/vistas | `--mode=setup-crm --apply` | Aplicado |
| Seleccionar tanda | `--mode=select-batch` | Implementado dry-run |
| Preparar payloads locales | `--mode=prepare-drafts` | Implementado, no Gmail draft |
| Registrar draft creado | `--mode=mark-draft-created --apply` | Implementado, no ejecutado en externos |
| Registrar email enviado | `--mode=mark-email-sent --apply` | Implementado, no ejecutado en externos |
| Detectar replies desde eventos | `--mode=sync-replies` | Implementado |
| Detectar bounces desde eventos | `--mode=sync-bounces` | Implementado |
| Preparar follow-ups vencidos | `--mode=prepare-followups` | Implementado dry-run |
| Operador diario | `scripts/ia_mujeres_daily_operator.mjs` | Implementado dry-run |

## Workflows nativos recomendados después

| Workflow | Cuándo activarlo | Motivo |
|---|---|---|
| Al pasar a `EMAIL_1_SENT`, crear task follow-up | Después de validar 1 tanda externa | Puede duplicar tareas si se mezcla con runner |
| Al pasar a `REPLY_RECEIVED`, crear task comercial | Después de validar sync replies | El runner ya lo cubre; workflow sería redundancia controlada |
| Al pasar a `WRONG_CONTACT_MANUAL_REVIEW`, crear task de revisión | Después de validar bounces | Útil cuando haya volumen |
| Al pasar a `MEETING_SCHEDULED`, task de preparación | Cuando reuniones se registren de forma consistente | Depende del proceso comercial humano |

## Workflows descartados ahora

| Workflow | Razón |
|---|---|
| Enviar email automáticamente desde CRM | Riesgo alto; todo envío externo requiere autorización explícita |
| Crear drafts externos por cambio de stage | Riesgo de borrador accidental para contacto real |
| Tracking de aperturas como trigger principal | Señal poco fiable por proxies, clientes de correo y privacidad |
| Reescritura automática de links para clicks | Cambia links aprobados y puede afectar confianza/entregabilidad |

## Qué queda manual

- Revisión de cada draft externo.
- Autorización de tanda.
- Respuesta comercial a replies.
- Decisión de reunión y propuesta.
- Corrección de contactos con `needsManualReview`, `genericEmail` o `duplicatePossible`.
- Confirmación previa de Email 1 v3: asunto, variables minimas, derivacion para buzones genericos, adjunto v2 y firma Gmail/GWS segun `04_outputs/ia_mujeres_crm_execution/2026-06-09_email_01_v3_crm_sync.md`.

## Señales medibles

- Enviado: fiable si Gmail devuelve `messageId` y `threadId`.
- Recibido: viable en cuentas internas; en externos no siempre confirmable.
- Reply: fiable por `threadId`.
- Bounce: viable por búsqueda/labels DSN, pero requiere heurística.
- Apertura: no fiable como KPI principal.
- Click: no instrumentado porque no se reescriben links aprobados.

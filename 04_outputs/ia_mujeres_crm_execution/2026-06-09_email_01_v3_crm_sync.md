# Email 1 v3 CRM Sync — IA Mujeres

Fecha: 2026-06-09

## Estado

Documento operativo vigente para sincronizar CRM/GWS con el handoff de Funnel Academy de Email 1 v3.

Estado actualizado tras implementacion operativa:

- `shared/templates/ia-mujeres/email_01.html` genera Email 1 v3.
- `shared/templates/ia-mujeres/template_metadata.json` apunta a `2026-06-09_email_01_v3`.
- El dosier v2 queda copiado localmente en `shared/templates/ia-mujeres/assets/Mujeres, IA y el Futuro del Trabajo · Dossier — SkilLand v2.pdf`.
- Se creo un deal interno de validacion en CRM para `sales@reboot.academy`.
- Tras reautenticar GWS, se creo y envio el email interno con Email 1 v3 y adjunto v2.

Fuente Funnel Academy:

- `RaulAM7/funnel-and-offer-academy/04_outputs/ia-mujeres-funnel/04_email_sequence/2026-06-09_email_01_v3.md`
- `RaulAM7/funnel-and-offer-academy/04_outputs/ia-mujeres-funnel/06_outputs_ready_for_execution/2026-06-07_crm_gws_execution_handoff.md`

## Identidad vigente

| Campo | Valor |
|---|---|
| Campaña | `IA Mujeres 2026` |
| Template operativo | `email_01` sincronizado con Email 1 v3 |
| Referencia de version | `2026-06-09_email_01_v3` |
| Asunto | `Una preocupación que quería compartir con usted` |
| Remitente operativo | `gerencia@skilland.ai` |
| Firma | No hardcodear en template ni cuerpo |

## Variables minimas

- `[nombre]`
- `[entidad]`
- `[territorio]`
- `[derivacion_si_corresponde]`

Si faltan `[entidad]` o `[territorio]`, revisar antes de generar o enviar. No inventar entidad, territorio, cargo, area ni contexto.

## Derivacion

Texto exacto de `[derivacion_si_corresponde]` cuando aplique:

```text
Si no es la persona adecuada, agradecería que pudiera derivarlo al área responsable de igualdad, empleo, mujer, políticas sociales o desarrollo local.
```

Regla:

- Contacto nominal fiable: `[derivacion_si_corresponde]` vacio.
- Buzon generico, email de area o interlocutor dudoso: insertar derivacion.
- Si el proceso excluye automaticamente ciertos buzones genericos, mantener esa salvaguarda salvo autorizacion humana explicita; si se autoriza el envio a buzon generico, la derivacion es obligatoria.

## Adjunto vigente

Email 1 debe usar:

```text
Mujeres, IA y el Futuro del Trabajo · Dossier — SkilLand v2.pdf
```

Reglas de assets:

- Email 1: dosier breve azul v2.
- Follow-up 1: sin dossier largo.
- Follow-up 2 / nurturing: white paper o material largo, si aplica.
- No usar el asset anterior de resumen comercial como asset vigente de Email 1.
- No adjuntar white paper ni dossier largo en Email 1.

Estado del PDF en esta iteracion: localizado en Funnel Academy y copiado al repo CRM en:

```text
shared/templates/ia-mujeres/assets/Mujeres, IA y el Futuro del Trabajo · Dossier — SkilLand v2.pdf
```

Validacion local: PDF 1.4, 8 paginas, 2.7 MB.

## Firma Gmail/GWS

No hardcodear firma en templates ni cuerpos de email.

Validacion operativa realizada:

- GWS reautenticado para `gerencia@skilland.ai`.
- El runner lee la firma `sendAs` de `gerencia@skilland.ai`.
- El runner no hardcodea firma en template ni cuerpo: toma la firma configurada en Gmail y la inyecta en el MIME.
- Draft interno creado y enviado a `sales@reboot.academy`.

## Copy vigente

```text
Estimado/a [nombre],

Me llamo Romina Ojeda Brito. Durante los últimos años he liderado Reboot Academy, un proyecto que nació en Canarias con una idea muy concreta: ayudar a personas que necesitaban reiniciar su trayectoria profesional, muchas de ellas en situaciones de desempleo, vulnerabilidad o falta de acceso a oportunidades tecnológicas, a formarse en habilidades realmente demandadas por el mercado.

Desde ahí hemos formado a más de 1.000 estudiantes, y esa experiencia nos llevó a impulsar el Instituto de Innovación Tecnológica y Educativa para el Desarrollo: una evolución natural para seguir conectando formación, tecnología, metodología e impacto real en el territorio.

También presido Women In STEAM Empowerment Canarias, y desde esa responsabilidad veo con especial claridad la brecha que se está abriendo con la adopción de la Inteligencia Artificial.

Le escribo porque creemos que esta conversación puede ser especialmente relevante para [entidad]. La IA puede convertirse en una nueva capa de exclusión laboral femenina o en una oportunidad para abrir acceso a empleo cualificado, autonomía económica y nuevas competencias profesionales para las mujeres de [territorio].

Le adjunto un dosier breve sobre la línea de trabajo que estamos impulsando con organismos públicos de Canarias, con posibles líneas de colaboración. No lo planteamos como un programa cerrado, sino como punto de partida para una conversación: compartirles lo que estamos trabajando, escuchar mejor su contexto territorial, sus objetivos y prioridades, y valorar juntos si puede tener sentido una primera acción de divulgación gratuita en su territorio.

A partir de ahí, si vemos encaje, podríamos explorar posteriormente un proyecto a medida con objetivos concretos y KPIs de impacto.

¿Tendría sentido que nos sentáramos a hablarlo en una primera reunión? Podemos adaptarnos al formato que les resulte más cómodo: llamada, videollamada o encuentro presencial.

[derivacion_si_corresponde]

Un saludo,
```

## Obsoleto para estado vigente

Email 1 vigente no debe contener:

- link de LinkedIn en el nombre de Romina;
- Romina Ojeda Brito como markdown link;
- copy de apertura anterior basado en trabajo de semanas recientes;
- posicionamiento anterior del adjunto;
- asset anterior de resumen comercial;
- mencion economica de cierre en Email 1;
- link frio de calendario;
- firma hardcodeada en el cuerpo.

Las apariciones de esos elementos en `batch_*`, `experiment_00_*`, `events.ndjson` y reportes fechados del 2026-06-08 son artefactos historicos de tandas o pruebas ya ejecutadas, no instrucciones vigentes.

## Pendiente fuera de `04_outputs/`

Los documentos operativos apuntan a templates y runners reales fuera de `04_outputs/`:

- `shared/templates/ia-mujeres/`
- `scripts/ia_mujeres_batch_runner.mjs`
- `scripts/ia_mujeres_operator_harness.mjs`

Estado: modificados y validados con prueba Gmail interna. Antes de una nueva tanda real queda pendiente revision humana visual del email recibido en `sales@reboot.academy`.

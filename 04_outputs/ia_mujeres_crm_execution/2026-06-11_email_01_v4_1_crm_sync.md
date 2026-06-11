# Email 1 v4.1 CRM Sync — IA Mujeres

Fecha: 2026-06-11

## Estado

Documento operativo vigente para próximas iteraciones de Email 1 en la campaña `IA Mujeres 2026`.

Estado aprobado:

- `shared/templates/ia-mujeres/email_01.html` genera Email 1 v4.1.
- `shared/templates/ia-mujeres/template_metadata.json` apunta a `2026-06-11_email_01_v4_1`.
- El asunto vigente sigue siendo `Una preocupación que quería compartir con usted`.
- El adjunto vigente sigue siendo el dossier azul v2.
- La firma `Romina Ojeda Brito` queda incluida explícitamente en el cuerpo del email.
- Prueba interna enviada a `sales@reboot.academy` el 2026-06-11 con la versión v4.1.

## Identidad Vigente

| Campo | Valor |
|---|---|
| Campaña | `IA Mujeres 2026` |
| Template operativo | `email_01` |
| Referencia de versión | `2026-06-11_email_01_v4_1` |
| Asunto | `Una preocupación que quería compartir con usted` |
| Remitente operativo | `gerencia@skilland.ai` |
| Firma en cuerpo | `Romina Ojeda Brito` |

## Variables

- `{{saludo_nombre}}`: calculado por runner.
- `{{territorio}}`: municipio para ayuntamientos; isla para cabildos y otros casos.
- `{{derivacion_si_corresponde}}`: bloque opcional si el contacto es dudoso, genérico o necesita derivación.

Regla de saludo:

- Nombre femenino reconocido: `Estimada {nombre}`.
- Nombre masculino reconocido: `Estimado {nombre}`.
- Nombre no reconocido: `Estimado {nombre}`.
- Sin nombre usable: `Estimado equipo`.

No usar `Estimado/a` ni nombre completo en el saludo.

## Derivación

Texto exacto cuando aplique:

```text
Si cree que esta conversación corresponde a otra persona del equipo, le agradecería mucho que pudiera reenviárselo o indicarme con quién hablar.
```

## Adjunto

Email 1 debe usar:

```text
Mujeres, IA y el Futuro del Trabajo · Dossier — SkilLand v2.pdf
```

Ruta:

```text
shared/templates/ia-mujeres/assets/Mujeres, IA y el Futuro del Trabajo · Dossier — SkilLand v2.pdf
```

## Copy Vigente

```text
{{saludo_nombre}},

Soy Romina Ojeda Brito. Le escribo porque estamos abriendo conversaciones con instituciones canarias sobre un reto muy concreto: que la IA no amplíe aún más la brecha laboral y de oportunidades de muchas mujeres.

Fundé Reboot Academy en 2019 para traer a Canarias el modelo bootcamp tecnológico, con el que hemos ayudado a más de 1.000 personas a reorientar su carrera hacia perfiles digitales. Además, presido WISE Canarias, Women in STEAM Empowerment Canarias, desde donde trabajamos para acercar ciencia, tecnología e innovación a más mujeres.

Creemos que la IA puede ser una oportunidad histórica, pero solo si se acerca de forma útil y comprensible a quienes hoy están más lejos de ella: mujeres en búsqueda de empleo, emprendedoras, profesionales de sectores tradicionales o personas que necesitan actualizarse.

Le adjunto un dosier breve del proyecto que estamos impulsando con organismos públicos de Canarias. Nos gustaría valorar si tendría sentido para mujeres de {{territorio}} y, si encaja, proponer una primera acción gratuita de divulgación.

¿Le encajaría una llamada breve la próxima semana?

{{derivacion_si_corresponde}}

Un saludo,

Romina Ojeda Brito
```

## Validación

- Test interno enviado a `sales@reboot.academy`.
- El render v4.1 incluye firma explícita en cuerpo.
- El fallback de saludo ya no usa `Hola`.
- El creador de drafts valida copy, adjunto y ausencia de placeholders sin crear drafts en dry-run.


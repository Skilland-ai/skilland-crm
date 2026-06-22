#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { fetchCrmMetadata } from '../crm_manual_update_crew/metadata.mjs';
import { fetchBusinessLines } from '../crm_manual_update_crew/retriever.mjs';
import {
  TwentyClient,
  readTwentyCredentials,
} from '../crm_manual_update_crew/twenty-client.mjs';

const SOURCE_TYPE = 'crm_sushi_update';
const SOURCE_FILE = 'sushi-update-2026-06-22';
const REQUESTER = 'crm_sushi_update_2026_06_22';
const DEFAULT_OUTPUT_DIR =
  '04_outputs/crm_execution_crew/sushi_update_2026-06-22';
const EXPORT_SOURCE =
  '04_outputs/crm_manual_update_session/crm_export_para_chatgpt_2026-06-20T16-30-07-935Z.md';

const DRY_RUN = 'dry_run';
const APPLY = 'apply';
const RATE_LIMIT_WAIT_MS = 65_000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const IA_MUJERES_BUSINESS_LINES = new Set([
  'SkilLand IA Mujeres',
  'TEST — SkilLand IA Mujeres',
]);

const REQUIRED_STAGES = {
  onHold: 'ON_HOLD',
  lost: 'LOST',
  closed: 'CLOSED',
  pendingSignature: 'PENDING_SIGNATURE',
};

const DEALS = {
  fgull: {
    id: '4ad0088d-f55d-43a8-bdd2-9182a0ee4b92',
    expectedName:
      'FGULL — Proyectos Microcredenciales (Plugin Moodle + Motor IA)',
  },
  turismoCamara: {
    id: 'a21bd7ae-e49d-4c06-9b8b-6706cee7b982',
    expectedName: 'Turismo Camara Comercio - jornada Raul',
  },
  besEditorial: {
    id: '4965c3ea-622f-4893-b625-1fa2fcb5fe10',
    expectedName: 'BES EDITORIAL',
  },
  lolaAzero: {
    id: '1de0c096-6a37-49ff-a48f-5956dca4ab7b',
    expectedName: 'Lola Azero - Automatiz',
  },
  exgea: {
    id: '922432f1-48f3-4460-931d-7600773bac48',
    expectedName: 'EXGEA SL - Pyme Digital',
  },
  malole: {
    id: '66418a21-73fa-4116-be5f-c92383d634b0',
    expectedName: 'MALOLE AGENCIA VIAJES',
  },
  mariaMateos: {
    id: '412c6783-de9a-4d8a-a455-57506a3ae93a',
    expectedName: 'María Mateos — Producto Innovación Educativa con IA',
  },
  alicante: {
    id: 'da863c8e-679a-43e4-8cc9-43c20430b4c4',
    expectedName: 'Universidad de Alicante CFPUA — Microcredenciales',
  },
  crue: {
    id: '7def9808-4ce6-4b58-9859-0ad7cd37e227',
    expectedName: 'CRUE — Grupo Microcredenciales',
  },
  udc: {
    id: 'efd4441f-4fd8-45d7-bc17-1f9d72c4976a',
    expectedName: 'UDC — Microcredenciales',
  },
  inta: {
    id: '2bb23c0a-4708-49af-b42e-80541251aae8',
    expectedName: 'INTA — Microcredenciales',
  },
  talentonAutomati: {
    id: '4630c221-ab19-49f9-b8d2-91d56af175c7',
    expectedName: 'Talentón Automati IG Whatsapp',
  },
  conetic: {
    id: 'fa6646df-9b5b-4263-97a9-971dbf1de86b',
    expectedName: 'CONETIC - Presupuesto Paquete Certificados Alfabetización',
  },
  talentonComercio: {
    id: '80124f08-6291-4464-911d-6c9c7f268346',
    expectedName: 'Talenton Comercio IA',
  },
  talentonEmprendimiento: {
    id: '599163f9-e4f3-4fa0-876d-475f314e4438',
    expectedName: 'Talenton IA - IA para emprendimiento',
  },
  viuLms: {
    id: 'f3a0f07e-7404-46dc-9560-2a5c56c6cc6f',
    expectedName: 'SkilLand LMS — demo plataforma VIU',
  },
  titularisimos: {
    id: '23bc0bd7-aad2-4027-a211-0e9398226255',
    expectedName: 'Titularísimos - Admin automation',
  },
  spet: {
    id: '208df0f1-16af-4378-a352-5ea26c3a3438',
    expectedName: 'SPET Turismo Tenerife - Formación IA',
  },
  redCide: {
    id: 'cbf8bfdc-acee-4108-9dbe-a8e5c18733b0',
    expectedName: 'RED CIDE — IA360 v2',
  },
  sheikh: {
    id: '051829ad-16f2-48df-98f5-c9aa123251d1',
    expectedName: 'Sheikh Sidi ahmed - Reboot Orientation Funnel',
  },
  s4cPilot: {
    id: 'c9f9df40-d5fa-48bd-9cd0-f1614e940f88',
    expectedName: 'Science for Change — Piloto Plataforma (1 Creator + 20 Student)',
  },
  bootcampEjercito: {
    id: '3a2eda13-f59b-431c-ba96-9701e13066e1',
    expectedName: 'Bootcamp Ejército - Pedro León Millán',
  },
  aciisiHormiga: {
    id: '6ebc5808-031e-4ce7-be27-a4cac6012f88',
    expectedName: 'ACIISI - Hormiga',
  },
  proexca: {
    id: 'f1afda1d-6f85-4386-ba0b-9e65a01019ea',
    expectedName: 'Proexca — IA para Directivos',
  },
  s4cConsultoria: {
    id: 'abde4533-cf84-40f6-9c53-cb08e8cda704',
    expectedName: 'Science for Change — Consultoría Microcredenciales',
  },
  ujaen: {
    id: '64759fd5-0b34-4598-a48a-89eef34920d4',
    expectedName: 'Universidad de Jaén — Microcredenciales',
  },
  upct: {
    id: '314abcbc-3718-4ad0-9941-59d15473423f',
    expectedName: 'UPCT — Piloto Microcredenciales',
  },
  s4cEuPlatform: {
    id: '827fae03-6ba7-4918-9075-3635248a33dc',
    expectedName: 'Science for Change — EU Platform',
  },
  ulpgc: {
    id: '51d1fe86-8772-4e0e-bf3b-50a82ca22454',
    expectedName: 'ULPGC — Microcredenciales',
  },
  eros: {
    id: '3d266d7e-f636-4c2b-bdd6-a17b4b35cbee',
    expectedName: 'Eros Calixto - Full Stack Bootcamp',
  },
  bootcampPaula: {
    id: 'cbae8c00-1c19-49e0-9792-bbd2be0431b3',
    expectedName: 'Bootcamp Paula',
  },
  epi10: {
    id: '9c4fc972-e555-41e7-ace1-37125fb73734',
    expectedName: 'EPI 10 - DISCOVERY CONSULTING',
  },
  divi: {
    id: '55cfbd70-83e1-41c2-a8d5-445b19601535',
    expectedName: 'Divi - Migración Drive + Automat emails',
  },
  michel: {
    id: 'bedc9db1-fb8d-4513-871d-6b3600f9bbf7',
    expectedName: 'Michel Nory García - Reboot Orientation Funnel',
  },
  sergio: {
    id: 'c377222f-3116-4ff6-a775-6fb169247513',
    expectedName: 'Sergio Hernández Ramírez - Reboot Orientation Funnel',
  },
  victor: {
    id: '35917dfa-c090-43e8-a637-83cdd1513f17',
    expectedName: 'Victor Garcia Roman - Reboot Orientation Funnel',
  },
  matteo: {
    id: 'fb407ea2-77d5-48c3-b972-2c439e054612',
    expectedName: 'Matteo Neri - Reboot Orientation Funnel',
  },
  femepa: {
    id: '90b13255-35df-4756-b7fc-884f39354164',
    expectedName: 'FEMEPA — Plataforma EU',
  },
  casaAfricaCurso1: {
    id: 'e9490f49-d435-4257-a8d5-2770888bd3dd',
    expectedName: 'Casa África — AfricanTech Curso 1 (junio 2026)',
  },
  casaAfricaPlataforma: {
    id: '94c09679-41ba-4608-b5cd-12fe55884216',
    expectedName: 'Casa África — Plataforma EU',
  },
  casaAfricaCurso2: {
    id: '32f9e57b-60f5-473c-a208-aeface10c7f1',
    expectedName: 'Casa África — AfricanTech Curso 2 (noviembre 2026)',
  },
  femete: {
    id: '459847b7-d38c-4561-8086-534d8eea5f91',
    expectedName: 'FEMETE — Plataforma EU',
  },
  camaraTenerife: {
    id: 'd3f9f2e8-b0e2-4ce2-82d0-ecfae2c6f7ba',
    expectedName: 'Cámara de Comercio de Tenerife — Plataforma EU',
  },
};

const OPERATIONS = [
  doneTask('fgull', 'Reunión de Recap enfoque de coordinación de la ejecución del proyecto'),
  doneTask('fgull', 'Hablar con Romi — alinear estrategia FGULL microcredenciales'),
  note(
    'fgull',
    'Actualización recap — FGULL microcredenciales',
    `La reunión de recap fue muy positiva. FGULL concordó en que, a nivel técnico, la ejecución ha sido perfecta. El problema no ha estado en el software ni en la entrega, sino en la idiosincrasia de la universidad, el timing de evaluaciones y el calendario interno, que han impedido sacar todavía todo el jugo posible a la fábrica de microcredenciales.

Hay un Fathom de la reunión pendiente de colgar. Quedaron alineados en intentar sacar el máximo provecho posible cuando el timing y calendario universitario lo permitan.

Se marcaron dos siguientes pasos: una reunión de planificación de verano el 12/07/2026 y una reunión preliminar en septiembre para definir scope de un piloto externo con microcredenciales de docentes universitarios. Julio Brito tiene identificados un par de proyectos, especialmente uno formativo con el clúster de consultorías de turismo, del que quiere producir activos formativos. A Skilland le interesa mucho convertir esto en caso de éxito.`,
  ),
  task(
    'fgull',
    'Reunión de planificación verano FGULL — baja actividad',
    '2026-07-12',
    'planificar cómo afrontar el verano y qué hacer durante el periodo de baja actividad.',
  ),
  task(
    'fgull',
    'Definir scope piloto externo FGULL — microcredenciales docentes universitarios',
    '2026-09-01',
    'reunión preliminar para definir un piloto externo con microcredenciales de docentes universitarios. Julio Brito tiene identificados proyectos, especialmente uno formativo con el clúster de consultorías de turismo.',
  ),
  rescheduleTask(
    'turismoCamara',
    'Sentarme con GPT para definir reimpacto comercial a Rocío / Cámara GC',
    '2026-07-02',
  ),
  task(
    'besEditorial',
    'Follow-up BES Editorial — revisar sedes electrónicas',
    '2026-06-30',
    'hacer seguimiento para que revisen las sedes electrónicas y confirmen si se consiguió o no.',
  ),
  task(
    'lolaAzero',
    'Follow-up Lola Azero — revisar sedes electrónicas',
    '2026-06-30',
    'revisar sedes electrónicas y confirmar si se consiguió o no.',
  ),
  task(
    'exgea',
    'Follow-up EXGEA SL — revisar sedes electrónicas',
    '2026-06-30',
    'revisar sedes electrónicas y confirmar si se consiguió o no.',
  ),
  task(
    'malole',
    'Hablar con Leonor — decidir continuidad proyecto Malole',
    '2026-06-29',
    'hablar con Leonor para confirmar si siguen adelante con el proyecto y si su madre quiere involucrarse. Tarea definitoria: si quieren avanzar, seguimos; si no, se limpia/cierra del CRM.',
  ),
  stage('mariaMateos', REQUIRED_STAGES.onHold),
  doneTask(
    'mariaMateos',
    'Procesar info y hacer primer boceto diseño de producto (María Mateos)',
  ),
  doneTask('mariaMateos', 'Segunda reunión con María Mateos — mapear ecosistema'),
  note(
    'mariaMateos',
    'Pausa operativa — María Mateos',
    'Proyecto pausado por ahora. Se limpian tareas antiguas vencidas de boceto de producto y segunda reunión. No hay siguiente acción activa hasta nueva decisión.',
  ),
  stage('alicante', REQUIRED_STAGES.onHold),
  task(
    'alicante',
    'Follow-up Universidad de Alicante CFPUA — retomar microcredenciales tras verano',
    '2026-09-01',
    'revisar historial de correo con Javier Montiel/CFPUA y preparar follow-up para retomar conversación. Si se reflota, avanzar; si no, cerrar.',
  ),
  stage('crue', REQUIRED_STAGES.onHold),
  task(
    'crue',
    'Follow-up CRUE Microcredenciales — retomar tras verano',
    '2026-09-01',
    'revisar correo con Guillermo/CRUE y preparar follow-up. Si se reflota, perfecto; si no, cerrar/descartar.',
  ),
  stage('udc', REQUIRED_STAGES.onHold),
  task(
    'udc',
    'Follow-up UDC Microcredenciales — retomar tras verano',
    '2026-09-01',
    'revisar histórico con UDC/Manuel y preparar follow-up. Objetivo: reflotar o cerrar.',
  ),
  stage('inta', REQUIRED_STAGES.onHold),
  task(
    'inta',
    'Follow-up INTA Microcredenciales — retomar tras verano',
    '2026-09-01',
    'revisar historial con Ana Ramírez/formacion@inta.es y preparar follow-up. Objetivo: ver si hay proyecto real; si no, cerrar.',
  ),
  task(
    'talentonAutomati',
    'Decidir reactivación Talentón / Estefanía',
    '2026-07-01',
    'sentarse a pensar si reflotar el tema con Estefanía directamente o si debe hacerlo Brian de parte nuestra.',
  ),
  stage('conetic', REQUIRED_STAGES.lost),
  closeOpenTasks('conetic', 'Se mueve a Perdido; se cierran tareas abiertas porque CANCELED no existe.'),
  stage('talentonComercio', REQUIRED_STAGES.lost),
  closeOpenTasks(
    'talentonComercio',
    'Se mueve a Perdido; se cierran tareas abiertas porque CANCELED no existe.',
  ),
  stage('talentonEmprendimiento', REQUIRED_STAGES.lost),
  closeOpenTasks(
    'talentonEmprendimiento',
    'Se mueve a Perdido; se cierran tareas abiertas porque CANCELED no existe.',
  ),
  task(
    'viuLms',
    'Follow-up Daniel / VIU — demo SkilLand LMS',
    '2026-07-01',
    'contactar con Daniel para comprobar si alguien llegó a responderle. Si no, disculparse con naturalidad, explicar que estábamos justo lanzando/ordenando la operación comercial de la empresa y reflotar la conversación para saber si siguen interesados en avanzar.',
  ),
  task(
    'titularisimos',
    'Follow-up Titularísimos — reflotar admin automation',
    '2026-07-01',
    'preguntar si quieren seguir adelante o no.',
  ),
  task(
    'spet',
    'Follow-up Ricardo / SPET — retomar tras verano',
    '2026-08-26',
    'revisar bandeja de entrada y localizar la última conversación con Ricardo, donde emplazaba a hablar después de verano. Preparar seguimiento para finales de agosto/septiembre. Son difíciles de mover y probablemente habrá que insistir varias veces para cerrar reunión.',
  ),
  stage('redCide', REQUIRED_STAGES.lost),
  doneTask('redCide', 'Aterrizar con Carlitos'),
  doneTask(
    'redCide',
    'Preparar versión comercial/institucional del briefing IA360 v2 para Red CIDE',
  ),
  note(
    'redCide',
    'Cierre comercial — RED CIDE IA360 v2',
    'Se mueve a Perdido. Carlitos parece estar sacando un proyecto parecido, por lo que probablemente ya no tendrá interés en la propuesta IA360 v2. Se cierran las tareas abiertas asociadas.',
  ),
  doneTask('sheikh', 'FOLLOW-UP'),
  task(
    'sheikh',
    'Nuevo follow-up Sheikh Sidi ahmed',
    '2026-06-28',
    'se ejecutó follow-up anterior y no respondió. Volver a intentar contacto.',
  ),
  rescheduleTask(
    's4cPilot',
    'Follow-up serio Science for Change — decidir sí/no o bloqueos',
    '2026-06-24',
  ),
  rescheduleTask(
    'bootcampEjercito',
    'Follow-up Pedro León Millán — propuesta Bootcamp Ejército',
    '2026-06-24',
  ),
  task(
    'aciisiHormiga',
    'Pensar entregable/catálogo para retomar ACIISI / Hormiga',
    '2026-07-09',
    'sentarse a pensar qué entregable, catálogo o propuesta tendría sentido para retomar el tema con el equipo de Hormiga.',
  ),
  stage('proexca', REQUIRED_STAGES.closed),
  closeOpenTasks(
    'proexca',
    'Proyecto cerrado; se cierran tareas activas porque CANCELED no existe.',
  ),
  note(
    'proexca',
    'Cierre definitivo — Proexca IA para Directivos',
    'Proyecto cerrado y finiquitado. No quedan acciones comerciales ni operativas activas.',
    { createIfMissingOnly: true },
  ),
  stage('s4cConsultoria', REQUIRED_STAGES.onHold),
  task(
    's4cConsultoria',
    'Revisar consultoría MicroCred S4C si avanza piloto plataforma',
    '2026-09-01',
    'este segundo proyecto no ocurrirá antes del piloto de plataforma de 1.750 EUR. Está supeditado a que el piloto avance o se cierre.',
  ),
  stage('ujaen', REQUIRED_STAGES.onHold),
  task(
    'ujaen',
    'Follow-up Universidad de Jaén — retomar microcredenciales tras verano',
    '2026-09-01',
    'como el resto de universidades, en verano no va a ocurrir nada. Retomar en septiembre con follow-up serio.',
  ),
  stage('upct', REQUIRED_STAGES.onHold),
  rescheduleTask(
    'upct',
    'Follow-up Josefa UPCT — retomar feedback dossier tras verano',
    '2026-09-01',
    {
      aliases: ['Follow-up Josefa UPCT — agendar reunión feedback dossier'],
      createIfMissing: true,
      markdown: 'en verano no va a ocurrir; retomar conversación en septiembre.',
      updateTitle: true,
    },
  ),
  stage('s4cEuPlatform', REQUIRED_STAGES.onHold),
  task(
    's4cEuPlatform',
    'Revisar EU Platform S4C si avanza piloto plataforma',
    '2026-09-01',
    'está supeditado al deal del piloto con la misma gente. Si el piloto sale, retomar esta línea.',
  ),
  rescheduleTask(
    'ulpgc',
    'Follow-up Cristina ULPGC — documentación microcredencial',
    '2026-07-06',
  ),
  task(
    'ulpgc',
    'Pensar cómo vehiculizar bootcamps como microcredenciales universitarias',
    '2026-07-06',
    'sentarse a pensar cómo enfocar/configurar los bootcamps para la universidad como microcredenciales, especialmente de cara a septiembre/verano y posible vía ULPGC.',
  ),
  doneTask('eros', 'Follow-up cobro / facturación pendiente Eros'),
  doneTask('eros', 'Tutoría recurrente viernes 13:00 — Eros Calixto (primera sesión)'),
  task(
    'eros',
    'Nuevo follow-up cobro / facturación pendiente Eros',
    '2026-07-15',
    'seguimiento de cobro/facturación pendiente.',
  ),
  task(
    'eros',
    'Tutoría Eros Calixto — seguimiento bootcamp',
    '2026-06-23',
    'siguiente tutoría de seguimiento del bootcamp.',
  ),
  doneTask('bootcampPaula', 'Matriculación, bienvenida y acceso al campus — Bootcamp Paula'),
  rescheduleTask(
    'bootcampPaula',
    'Emitir/gestionar primera factura — Bootcamp Paula',
    '2026-06-22',
  ),
  task(
    'bootcampPaula',
    'Resolver ticket técnico de acceso al campus — Bootcamp Paula',
    '2026-06-22',
    'resolver incidencia/ticket técnico de acceso al campus.',
  ),
  doneTask('epi10', 'Follow-up Carmen — revisión propuesta EPI10'),
  note(
    'epi10',
    'Venta cerrada — EPI10 MVP',
    'Follow-up ejecutado. El deal se vendió: Carmen/EPI10 aceptan avanzar. Están encantados y muy ilusionados con la propuesta. Queda pendiente formalizar contrato y primera factura.',
  ),
  stage('epi10', REQUIRED_STAGES.pendingSignature),
  task('epi10', 'Enviar contrato EPI10 para firma', '2026-06-22'),
  task('epi10', 'Enviar primera factura EPI10', '2026-06-26'),
  task(
    'divi',
    'Follow-up Divi / DClick — feedback propuesta',
    '2026-06-22',
    'preguntar qué piensan de la propuesta y próximos pasos.',
  ),
  doneTask('michel', 'Sesion 1:1 Orientacion y prospeccion'),
  doneOrCreateTask(
    'michel',
    'Enviar propuesta Michel Nory',
    '2026-06-22',
    'acción registrada como realizada: enviar propuesta Michel Nory.',
  ),
  task('michel', 'Follow-up Michel Nory — propuesta enviada', '2026-06-22'),
  doneTask('sergio', 'Oferta a medida Sergio Hernández Ramos'),
  note(
    'sergio',
    'Venta pendiente de firma — Sergio Hernández',
    'Oferta a medida enviada correctamente el 16/06/2026. Deal vendido / pendiente de firma. Próximos pasos: contrato y factura.',
  ),
  stage('sergio', REQUIRED_STAGES.pendingSignature),
  task('sergio', 'Enviar contrato Sergio Hernández para firma', '2026-06-22'),
  task('sergio', 'Enviar factura Sergio Hernández', '2026-06-23'),
  rescheduleTask(
    'victor',
    'Preparar material potencial para Victor Garcia Roman',
    '2026-06-22',
  ),
  ensureTask(
    'victor',
    'Sesion 1:1 Orientacion y prospeccion',
    dueAtLocal('2026-06-22', '13:15'),
  ),
  rescheduleTask('matteo', 'Sesion 1:1 Orientacion y prospeccion', '2026-06-23', {
    createIfMissing: true,
  }),
  task('femepa', 'Enviar primeras facturas FEMEPA', '2026-06-24'),
  task(
    'femepa',
    'Mandar correo de coordinación completa FEMEPA / Plataforma EU',
    '2026-06-24',
  ),
  doneTask(
    'casaAfricaCurso1',
    'Preparar/enviar oferta, memoria técnica y presupuesto conjunto Casa África — plataforma + curso 1',
    { dueAt: dueAtDate('2026-06-15') },
  ),
  rescheduleTask(
    'casaAfricaCurso1',
    'Buscar tres proveedores/presupuestos adicionales para Casa África / AfricanTech',
    '2026-06-23',
  ),
  task(
    'casaAfricaCurso1',
    'Escribir a Yurena — revisar cambios necesarios en la oferta',
    '2026-06-22',
  ),
  task(
    'casaAfricaCurso1',
    'Enviar de nuevo oferta Casa África — Curso 1 + plataforma',
    '2026-06-22',
  ),
  doneIfNotReflected(
    'casaAfricaPlataforma',
    'Preparar/enviar oferta integrada Casa África — Plataforma + Curso 1',
    [
      'Preparar memoria técnica conjunta Casa África — plataforma + curso 1',
      'Preparar/enviar oferta, memoria técnica y presupuesto conjunto Casa África — plataforma + curso 1',
    ],
  ),
  rescheduleTask(
    'casaAfricaPlataforma',
    'Buscar tres proveedores/presupuestos adicionales para contratación Casa África',
    '2026-06-23',
  ),
  task(
    'casaAfricaPlataforma',
    'Escribir a Yurena — revisar cambios necesarios en la oferta integrada',
    '2026-06-22',
  ),
  task(
    'casaAfricaPlataforma',
    'Enviar de nuevo oferta integrada Casa África — Plataforma + Curso 1',
    '2026-06-22',
  ),
  noChange('casaAfricaCurso2', 'Mantener tarea futura de Q4/octubre sin cambios.'),
  rescheduleTask(
    'femete',
    'Localizar contacto/teléfono FEMETE y activar cierre Plataforma EU',
    '2026-06-23',
  ),
  doneTask(
    'camaraTenerife',
    'Contactar Cámara Tenerife — desbloquear contratación Plataforma EU',
    { dueAt: dueAtDate('2026-06-17') },
  ),
  task(
    'camaraTenerife',
    'Enviar memoria técnica descriptiva y presupuesto — Cámara Tenerife',
    '2026-06-22',
  ),
  task(
    'camaraTenerife',
    'Contactar Marlen Cámara — confirmar si necesitan tres proveedores adicionales',
    '2026-06-23',
  ),
];

function parseArgs(argv) {
  const args = {
    mode: DRY_RUN,
    yes: false,
    outputDir: DEFAULT_OUTPUT_DIR,
    vicenteInteractive: false,
  };

  for (const arg of argv) {
    if (arg === '--dry-run') args.mode = DRY_RUN;
    else if (arg === '--apply') args.mode = APPLY;
    else if (arg === '--yes') args.yes = true;
    else if (arg === '--vicente-interactive') args.vicenteInteractive = true;
    else if (arg.startsWith('--output-dir=')) {
      args.outputDir = arg.slice('--output-dir='.length);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.mode === APPLY && !args.yes) {
    throw new Error('Apply requires --yes for this one-off script.');
  }
  if (args.mode !== APPLY && args.vicenteInteractive) {
    throw new Error('--vicente-interactive only runs with --apply --yes.');
  }

  return args;
}

function printHelp() {
  console.log(`Sushi CRM update 2026-06-22

Usage:
  node scripts/crm_execution_crew/sushi-update-2026-06-22.mjs --dry-run
  node scripts/crm_execution_crew/sushi-update-2026-06-22.mjs --apply --yes
  node scripts/crm_execution_crew/sushi-update-2026-06-22.mjs --apply --yes --vicente-interactive

Dry-run is the default. Writes require --apply --yes. The Vicente flow is
interactive and is intentionally opt-in after the batch apply.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const outputDir = path.resolve(args.outputDir);
  await fs.mkdir(outputDir, { recursive: true });

  const client = new TwentyClient(readTwentyCredentials());
  const metadata = await fetchCrmMetadata(client);
  const businessLines = await fetchBusinessLines(client);
  const snapshot = await fetchWorkspaceSnapshot(client);
  const context = buildContext({ metadata, businessLines, snapshot });
  const request = buildRequest({ mode: args.mode });
  const preflight = validatePreflight(context);
  const plan = buildPlan({ context, preflight, mode: args.mode });

  const requestPath = path.join(outputDir, 'sushi_update.request.json');
  const planPath = path.join(
    outputDir,
    args.mode === APPLY ? 'sushi_update_apply_plan.json' : 'sushi_update_dry_run_plan.json',
  );
  const sessionPath = path.join(
    outputDir,
    `session_${startedAt.replace(/[:.]/g, '-')}.json`,
  );

  await fs.writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, 'utf8');
  await fs.writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');

  const execution =
    args.mode === APPLY && plan.blockers.length === 0
      ? await executePlan({ client, plan })
      : buildDryRunExecution(plan);

  const verification =
    args.mode === APPLY && execution.summary.failed === 0
      ? await verifyAfterApply({ client, plan })
      : null;

  let vicente = null;
  if (
    args.mode === APPLY &&
    args.vicenteInteractive &&
    plan.blockers.length === 0 &&
    execution.summary.failed === 0
  ) {
    vicente = await runVicenteInteractiveFlow({ client, metadata, businessLines });
  }

  const summary = buildSummary({
    mode: args.mode,
    startedAt,
    outputDir,
    requestPath,
    planPath,
    sessionPath,
    context,
    preflight,
    plan,
    execution,
    verification,
    vicente,
  });
  const summaryPath = path.join(
    outputDir,
    args.mode === APPLY
      ? 'sushi_update_apply_summary.json'
      : 'sushi_update_dry_run_summary.json',
  );

  const session = {
    tool: 'crm-execution-crew',
    sourceType: SOURCE_TYPE,
    sourceFile: SOURCE_FILE,
    startedAt,
    finishedAt: new Date().toISOString(),
    request,
    metadata: metadataSummary(metadata, businessLines),
    resolvedDeals: context.resolvedDeals,
    preflight,
    plan,
    execution,
    verification,
    vicente,
    summary,
  };

  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await fs.writeFile(sessionPath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');

  printRunSummary({ summary, plan, execution, paths: { requestPath, planPath, summaryPath, sessionPath } });

  if (summary.blockers.length > 0 || execution.summary.failed > 0) {
    process.exitCode = 1;
  }
}

function buildRequest({ mode }) {
  return {
    requester: REQUESTER,
    mode,
    intent:
      'Actualizar CRM por Tandas Sushi 1-5 del 2026-06-22, excluyendo IA Mujeres.',
    scope: {
      sourceExport: EXPORT_SOURCE,
      excluded: ['SkilLand IA Mujeres', 'TEST — SkilLand IA Mujeres', 'IA Mujeres'],
      timezone: 'Atlantic/Canary',
      batches: ['Sushi 1', 'Sushi 2', 'Sushi 3', 'Sushi 4', 'Sushi 5'],
      finalInteractiveFlow: 'Vicente de la Cruz',
    },
    constraints: {
      requireHumanConfirmation: true,
      allowCreate: true,
      allowUpdate: true,
      allowDelete: false,
      allowMetadataChanges: false,
      noIaMujeres: true,
      noDeletes: true,
      canceledFallback: 'DONE_WITH_AUDIT_CONTEXT',
    },
    targetDeals: DEALS,
    operations: OPERATIONS,
  };
}

async function fetchWorkspaceSnapshot(client) {
  const ids = Object.values(DEALS).map((deal) => deal.id);
  const data = await gqlWithRetry(
    client,
    `query SushiUpdateSnapshot($ids: [UUID!]!) {
      opportunities(filter: { id: { in: $ids } }, first: 500) {
        edges {
          node {
            id
            name
            stage
            businessLineName
            campaignName
            iaMujeresFunnelStage
            company { id name }
            pointOfContact {
              id
              name { firstName lastName }
              emails { primaryEmail additionalEmails }
            }
            businessLine { id name }
            noteTargets(first: 200) {
              edges {
                node {
                  note {
                    id
                    title
                    createdAt
                    updatedAt
                    bodyV2 { markdown }
                  }
                }
              }
            }
            taskTargets(first: 200) {
              edges {
                node {
                  task {
                    id
                    title
                    status
                    dueAt
                    createdAt
                    updatedAt
                    bodyV2 { markdown }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { ids },
    'fetchWorkspaceSnapshot',
  );

  return {
    opportunities: edgesToNodes(data.opportunities).map(normalizeOpportunity),
  };
}

function buildContext({ metadata, businessLines, snapshot }) {
  const opportunitiesById = new Map(
    snapshot.opportunities.map((opportunity) => [opportunity.id, opportunity]),
  );
  const deals = {};
  const resolvedDeals = [];

  for (const [key, target] of Object.entries(DEALS)) {
    const deal = opportunitiesById.get(target.id) ?? null;
    deals[key] = deal;
    resolvedDeals.push({
      key,
      id: target.id,
      expectedName: target.expectedName,
      actualName: deal?.name ?? null,
      stage: deal?.stage ?? null,
      businessLine: deal?.businessLine?.name ?? deal?.businessLineName ?? null,
      iaMujeresFunnelStage: deal?.iaMujeresFunnelStage ?? null,
      isIaMujeres: deal ? isIaMujeresDeal(deal) : false,
    });
  }

  return {
    metadata,
    businessLines,
    stageValues: new Set(metadata.stageOptions.map((option) => option.value)),
    taskStatusValues: new Set(metadata.taskStatusOptions.map((option) => option.value)),
    deals,
    resolvedDeals,
  };
}

function validatePreflight(context) {
  const blockers = [];
  const warnings = [];

  for (const [label, value] of Object.entries(REQUIRED_STAGES)) {
    if (!context.stageValues.has(value)) {
      blockers.push({
        code: 'missing_stage',
        message: `Required stage ${label} not found: ${value}`,
        value,
      });
    }
  }

  if (!context.taskStatusValues.has('DONE')) {
    blockers.push({
      code: 'missing_done_status',
      message: 'Task status DONE is not available.',
    });
  }

  if (!context.taskStatusValues.has('CANCELED')) {
    warnings.push({
      code: 'canceled_status_unavailable',
      message:
        'Task status CANCELED is not available; obsolete/canceled tasks will be marked DONE and logged.',
    });
  }

  for (const resolved of context.resolvedDeals) {
    if (!resolved.actualName) {
      blockers.push({
        code: 'missing_deal',
        message: `Opportunity ID did not resolve: ${resolved.key}`,
        key: resolved.key,
        id: resolved.id,
      });
      continue;
    }
    if (resolved.isIaMujeres) {
      blockers.push({
        code: 'ia_mujeres_refused',
        message: `Refusing IA Mujeres deal: ${resolved.actualName}`,
        key: resolved.key,
        id: resolved.id,
      });
    }
    if (!namesLookRelated(resolved.expectedName, resolved.actualName)) {
      warnings.push({
        code: 'deal_name_differs',
        message: `Opportunity ID resolved with a name differing from prompt: ${resolved.expectedName} -> ${resolved.actualName}`,
        key: resolved.key,
        expectedName: resolved.expectedName,
        actualName: resolved.actualName,
      });
    }
  }

  return { blockers, warnings };
}

function buildPlan({ context, preflight, mode }) {
  const operations = [];
  const blockers = [...preflight.blockers];
  const warnings = [...preflight.warnings];

  for (const [sourceIndex, spec] of OPERATIONS.entries()) {
    const deal = context.deals[spec.dealKey];
    if (!deal) {
      operations.push(blocked(spec, sourceIndex, 'Deal was not resolved.'));
      continue;
    }
    if (isIaMujeresDeal(deal)) {
      operations.push(blocked(spec, sourceIndex, 'IA Mujeres deal is out of scope.'));
      continue;
    }

    const beforeBlockedCount = blockers.length;
    const planned = planOperation({ spec, sourceIndex, deal, blockers, warnings });
    operations.push(...planned);
    if (blockers.length > beforeBlockedCount) {
      for (const operation of planned) {
        if (operation.status === 'planned') operation.status = 'blocked';
      }
    }
  }

  const operationBlockers = operations
    .filter((operation) => operation.status === 'blocked')
    .map((operation) => ({
      code: 'blocked_operation',
      message: operation.reason,
      sourceIndex: operation.sourceIndex,
      sourceKind: operation.sourceKind,
      dealKey: operation.dealKey,
      dealName: operation.dealName,
    }));
  blockers.push(...operationBlockers);

  return {
    mode,
    status: blockers.length > 0 ? 'blocked' : 'planned',
    timezone: 'Atlantic/Canary',
    canceledFallback: context.taskStatusValues.has('CANCELED') ? 'CANCELED' : 'DONE',
    blockers,
    warnings,
    operations,
    summary: summarizeOperations(operations),
    crmWritten: false,
  };
}

function planOperation({ spec, sourceIndex, deal, blockers, warnings }) {
  if (spec.kind === 'no_change') {
    return [noOp(spec, sourceIndex, deal, spec.reason)];
  }

  if (spec.kind === 'update_stage') {
    if (deal.stage === spec.stage) {
      return [noOp(spec, sourceIndex, deal, `Stage already ${spec.stage}.`)];
    }
    return [
      planEntry(spec, sourceIndex, deal, 'update_opportunity_stage', {
        data: { stage: spec.stage },
        before: { stage: deal.stage },
      }),
    ];
  }

  if (spec.kind === 'create_note') {
    const existing = deal.notes.find(
      (noteItem) => normalizeText(noteItem.title) === normalizeText(spec.title),
    );
    if (existing) {
      return [
        noOp(
          spec,
          sourceIndex,
          deal,
          `Note already exists with same title: ${spec.title}`,
          { existingNoteId: existing.id },
        ),
      ];
    }
    return [
      planEntry(spec, sourceIndex, deal, 'create_note', {
        data: { title: spec.title, markdown: spec.markdown },
      }),
    ];
  }

  if (spec.kind === 'create_task' || spec.kind === 'ensure_task') {
    return planCreateOrEnsureTask({ spec, sourceIndex, deal });
  }

  if (spec.kind === 'done_or_create_task') {
    return planDoneOrCreateTask({ spec, sourceIndex, deal });
  }

  if (spec.kind === 'done_if_not_reflected') {
    return planDoneIfNotReflected({ spec, sourceIndex, deal });
  }

  if (spec.kind === 'mark_task_done') {
    return planMarkTaskDone({ spec, sourceIndex, deal, warnings });
  }

  if (spec.kind === 'reschedule_task') {
    return planRescheduleTask({ spec, sourceIndex, deal, warnings, blockers });
  }

  if (spec.kind === 'close_open_tasks') {
    const openTasks = deal.tasks.filter(isOpenTask);
    if (openTasks.length === 0) {
      return [noOp(spec, sourceIndex, deal, 'No open tasks to close.')];
    }
    return openTasks.map((taskItem) =>
      planEntry(spec, sourceIndex, deal, 'update_task', {
        taskId: taskItem.id,
        taskTitle: taskItem.title,
        data: { status: 'DONE' },
        before: taskSnapshot(taskItem),
        reason: spec.reason,
      }),
    );
  }

  return [blocked(spec, sourceIndex, `Unsupported spec kind: ${spec.kind}`, deal)];
}

function planCreateOrEnsureTask({ spec, sourceIndex, deal }) {
  const title = spec.title;
  const dueAt = spec.dueAt;
  const existingOpen = findTasksByTitle(deal.tasks.filter(isOpenTask), title);
  const existingDone = findTasksByTitle(deal.tasks.filter((taskItem) => !isOpenTask(taskItem)), title);

  if (existingOpen.length > 1) {
    return [blocked(spec, sourceIndex, `Multiple open tasks matched title: ${title}`, deal)];
  }
  if (existingOpen.length === 1) {
    const taskItem = existingOpen[0];
    const data = {};
    if (taskItem.dueAt !== dueAt) data.dueAt = dueAt;
    if (taskItem.status !== 'TODO') data.status = 'TODO';
    if (spec.updateTitle && taskItem.title !== title) data.title = title;
    if (Object.keys(data).length === 0) {
      return [
        noOp(spec, sourceIndex, deal, `Task already exists and is up to date: ${title}`, {
          taskId: taskItem.id,
        }),
      ];
    }
    return [
      planEntry(spec, sourceIndex, deal, 'update_task', {
        taskId: taskItem.id,
        taskTitle: taskItem.title,
        data,
        before: taskSnapshot(taskItem),
      }),
    ];
  }

  if (existingDone.length > 0) {
    return [
      noOp(spec, sourceIndex, deal, `Done task already exists with same title: ${title}`, {
        taskId: existingDone[0].id,
      }),
    ];
  }

  return [
    planEntry(spec, sourceIndex, deal, 'create_task', {
      data: {
        title,
        markdown: spec.markdown ?? defaultTaskMarkdown(deal),
        dueAt,
        status: spec.status ?? 'TODO',
      },
    }),
  ];
}

function planDoneOrCreateTask({ spec, sourceIndex, deal }) {
  const matches = findTasksByTitle(deal.tasks, spec.title);
  if (matches.length > 1) {
    return [blocked(spec, sourceIndex, `Multiple tasks matched title: ${spec.title}`, deal)];
  }
  if (matches.length === 1) {
    const taskItem = matches[0];
    if (!isOpenTask(taskItem)) {
      return [
        noOp(spec, sourceIndex, deal, `Task already DONE: ${spec.title}`, {
          taskId: taskItem.id,
        }),
      ];
    }
    return [
      planEntry(spec, sourceIndex, deal, 'update_task', {
        taskId: taskItem.id,
        taskTitle: taskItem.title,
        data: { status: 'DONE', dueAt: spec.dueAt },
        before: taskSnapshot(taskItem),
      }),
    ];
  }
  return [
    planEntry(spec, sourceIndex, deal, 'create_task', {
      data: {
        title: spec.title,
        markdown: spec.markdown ?? defaultTaskMarkdown(deal),
        dueAt: spec.dueAt,
        status: 'DONE',
      },
    }),
  ];
}

function planDoneIfNotReflected({ spec, sourceIndex, deal }) {
  const exact = findTasksByTitle(deal.tasks, spec.title);
  if (exact.some((taskItem) => !isOpenTask(taskItem))) {
    return [
      noOp(spec, sourceIndex, deal, `Done task already exists: ${spec.title}`, {
        taskId: exact.find((taskItem) => !isOpenTask(taskItem))?.id,
      }),
    ];
  }
  const reflected = spec.reflectedByTitles
    .flatMap((title) => findTasksByTitle(deal.tasks, title))
    .find((taskItem) => !isOpenTask(taskItem));
  if (reflected) {
    return [
      noOp(
        spec,
        sourceIndex,
        deal,
        `Requested done action already reflected by task: ${reflected.title}`,
        { taskId: reflected.id },
      ),
    ];
  }
  if (exact.length === 1 && isOpenTask(exact[0])) {
    return [
      planEntry(spec, sourceIndex, deal, 'update_task', {
        taskId: exact[0].id,
        taskTitle: exact[0].title,
        data: { status: 'DONE' },
        before: taskSnapshot(exact[0]),
      }),
    ];
  }
  if (exact.length > 1) {
    return [blocked(spec, sourceIndex, `Multiple tasks matched title: ${spec.title}`, deal)];
  }
  return [
    planEntry(spec, sourceIndex, deal, 'create_task', {
      data: {
        title: spec.title,
        markdown: defaultTaskMarkdown(deal),
        dueAt: dueAtDate('2026-06-15'),
        status: 'DONE',
      },
    }),
  ];
}

function planMarkTaskDone({ spec, sourceIndex, deal, warnings }) {
  const matches = findTasksByTitle(deal.tasks, spec.title);
  if (matches.length > 1) {
    return [blocked(spec, sourceIndex, `Multiple tasks matched title: ${spec.title}`, deal)];
  }
  if (matches.length === 0) {
    warnings.push({
      code: 'task_not_found',
      message: `Task not found; treated as no-op: ${spec.title}`,
      dealName: deal.name,
    });
    return [noOp(spec, sourceIndex, deal, `Task not found: ${spec.title}`)];
  }
  const taskItem = matches[0];
  if (!isOpenTask(taskItem)) {
    return [
      noOp(spec, sourceIndex, deal, `Task already DONE: ${spec.title}`, {
        taskId: taskItem.id,
      }),
    ];
  }
  const data = { status: 'DONE' };
  if (spec.dueAt) data.dueAt = spec.dueAt;
  return [
    planEntry(spec, sourceIndex, deal, 'update_task', {
      taskId: taskItem.id,
      taskTitle: taskItem.title,
      data,
      before: taskSnapshot(taskItem),
    }),
  ];
}

function planRescheduleTask({ spec, sourceIndex, deal, warnings, blockers }) {
  const openMatches = findTasksByTitles(deal.tasks.filter(isOpenTask), [
    spec.title,
    ...(spec.aliases ?? []),
  ]);
  if (openMatches.length > 1) {
    const message = `Multiple open tasks matched title/aliases: ${spec.title}`;
    blockers.push({
      code: 'ambiguous_task',
      message,
      dealName: deal.name,
      taskIds: openMatches.map((taskItem) => taskItem.id),
    });
    return [blocked(spec, sourceIndex, message, deal)];
  }
  if (openMatches.length === 1) {
    const taskItem = openMatches[0];
    const data = {};
    if (taskItem.dueAt !== spec.dueAt) data.dueAt = spec.dueAt;
    if (taskItem.status !== 'TODO') data.status = 'TODO';
    if (spec.updateTitle && taskItem.title !== spec.title) data.title = spec.title;
    if (Object.keys(data).length === 0) {
      return [
        noOp(spec, sourceIndex, deal, `Task already scheduled: ${taskItem.title}`, {
          taskId: taskItem.id,
        }),
      ];
    }
    return [
      planEntry(spec, sourceIndex, deal, 'update_task', {
        taskId: taskItem.id,
        taskTitle: taskItem.title,
        data,
        before: taskSnapshot(taskItem),
      }),
    ];
  }

  const doneMatches = findTasksByTitles(
    deal.tasks.filter((taskItem) => !isOpenTask(taskItem)),
    [spec.title, ...(spec.aliases ?? [])],
  );
  if (doneMatches.length > 0 && !spec.createIfMissing) {
    return [
      noOp(spec, sourceIndex, deal, `Matching task is already DONE: ${doneMatches[0].title}`, {
        taskId: doneMatches[0].id,
      }),
    ];
  }

  if (spec.createIfMissing) {
    return [
      planEntry(spec, sourceIndex, deal, 'create_task', {
        data: {
          title: spec.title,
          markdown: spec.markdown ?? defaultTaskMarkdown(deal),
          dueAt: spec.dueAt,
          status: 'TODO',
        },
      }),
    ];
  }

  warnings.push({
    code: 'task_not_found',
    message: `Task not found for reschedule; treated as no-op: ${spec.title}`,
    dealName: deal.name,
  });
  return [noOp(spec, sourceIndex, deal, `Task not found: ${spec.title}`)];
}

async function executePlan({ client, plan }) {
  const operations = [];
  const errors = [];

  for (const operation of plan.operations) {
    if (operation.status !== 'planned') {
      operations.push({ operationId: operation.id, status: operation.status, operation });
      continue;
    }

    try {
      const result = await executeOperation({ client, operation });
      operations.push({ operationId: operation.id, status: 'applied', operation, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push({ operationId: operation.id, message });
      operations.push({ operationId: operation.id, status: 'failed', operation, error: message });
    }
  }

  return {
    mode: APPLY,
    status: errors.length ? 'failed' : 'apply_completed',
    operations,
    summary: {
      planned: 0,
      applied: operations.filter((operation) => operation.status === 'applied').length,
      noOp: operations.filter((operation) => operation.status === 'no_op').length,
      blocked: operations.filter((operation) => operation.status === 'blocked').length,
      failed: errors.length,
    },
    errors,
  };
}

async function executeOperation({ client, operation }) {
  if (operation.type === 'update_opportunity_stage') {
    const data = await gqlWithRetry(
      client,
      `mutation SushiUpdateOpportunity($id: UUID!, $data: OpportunityUpdateInput!) {
        updateOpportunity(id: $id, data: $data) { id name stage }
      }`,
      { id: operation.dealId, data: operation.data },
      `update opportunity stage ${operation.dealName}`,
    );
    return data.updateOpportunity;
  }

  if (operation.type === 'update_task') {
    const data = await gqlWithRetry(
      client,
      `mutation SushiUpdateTask($id: UUID!, $data: TaskUpdateInput!) {
        updateTask(id: $id, data: $data) { id title status dueAt }
      }`,
      { id: operation.taskId, data: operation.data },
      `update task ${operation.taskTitle ?? operation.taskId}`,
    );
    return data.updateTask;
  }

  if (operation.type === 'create_note') {
    const noteResponse = await restWithRetry(
      client,
      '/notes',
      {
        method: 'POST',
        body: JSON.stringify({
          title: operation.data.title,
          bodyV2: { markdown: operation.data.markdown, blocknote: null },
        }),
      },
      `create note ${operation.data.title}`,
    );
    const noteId = noteResponse.data?.createNote?.id;
    if (!noteId) {
      throw new Error(`Note id missing: ${JSON.stringify(noteResponse).slice(0, 500)}`);
    }
    await linkTargets({ client, idName: 'noteId', idValue: noteId, deal: operation.target });
    return { id: noteId, title: operation.data.title };
  }

  if (operation.type === 'create_task') {
    const createStatus = operation.data.status === 'DONE' ? 'TODO' : operation.data.status;
    const taskResponse = await restWithRetry(
      client,
      '/tasks',
      {
        method: 'POST',
        body: JSON.stringify({
          title: operation.data.title,
          status: createStatus,
          dueAt: operation.data.dueAt,
          bodyV2: { markdown: operation.data.markdown ?? '', blocknote: null },
        }),
      },
      `create task ${operation.data.title}`,
    );
    const taskId = taskResponse.data?.createTask?.id;
    if (!taskId) {
      throw new Error(`Task id missing: ${JSON.stringify(taskResponse).slice(0, 500)}`);
    }
    await linkTargets({ client, idName: 'taskId', idValue: taskId, deal: operation.target });
    if (operation.data.status && operation.data.status !== createStatus) {
      await gqlWithRetry(
        client,
        `mutation SushiFinalizeCreatedTask($id: UUID!, $data: TaskUpdateInput!) {
          updateTask(id: $id, data: $data) { id title status dueAt }
        }`,
        { id: taskId, data: { status: operation.data.status } },
        `finalize created task ${operation.data.title}`,
      );
    }
    return { id: taskId, title: operation.data.title, status: operation.data.status };
  }

  return { skipped: true, reason: `Unsupported operation ${operation.type}` };
}

async function linkTargets({ client, idName, idValue, deal }) {
  const pathName = idName === 'noteId' ? '/noteTargets' : '/taskTargets';
  const bodies = [
    { [idName]: idValue, targetOpportunityId: deal.id },
    deal.pointOfContact?.id ? { [idName]: idValue, targetPersonId: deal.pointOfContact.id } : null,
    deal.company?.id ? { [idName]: idValue, targetCompanyId: deal.company.id } : null,
  ].filter(Boolean);

  for (const body of bodies) {
    await restWithRetry(
      client,
      pathName,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      `link ${idName} ${idValue} to target`,
    );
  }
}

function buildDryRunExecution(plan) {
  return {
    mode: DRY_RUN,
    status: plan.blockers.length ? 'blocked' : 'dry_run_completed',
    operations: plan.operations.map((operation) => ({
      operationId: operation.id,
      status: operation.status === 'planned' ? 'planned' : operation.status,
      operation,
    })),
    summary: {
      planned: plan.operations.filter((operation) => operation.status === 'planned').length,
      applied: 0,
      noOp: plan.operations.filter((operation) => operation.status === 'no_op').length,
      blocked: plan.operations.filter((operation) => operation.status === 'blocked').length,
      failed: 0,
    },
    errors: [],
  };
}

async function verifyAfterApply({ client, plan }) {
  const snapshot = await fetchWorkspaceSnapshot(client);
  const byId = new Map(snapshot.opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const checks = [];

  for (const operation of plan.operations.filter((item) => item.status === 'planned')) {
    const deal = byId.get(operation.dealId);
    if (!deal) {
      checks.push({
        operationId: operation.id,
        status: 'failed',
        message: 'Deal missing after apply.',
      });
      continue;
    }
    if (operation.type === 'update_opportunity_stage') {
      checks.push({
        operationId: operation.id,
        status: deal.stage === operation.data.stage ? 'verified' : 'failed',
        expected: operation.data.stage,
        actual: deal.stage,
      });
      continue;
    }
    if (operation.type === 'update_task') {
      const taskItem = deal.tasks.find((task) => task.id === operation.taskId);
      const mismatches = taskItem ? taskMismatches(taskItem, operation.data) : [];
      checks.push({
        operationId: operation.id,
        status: taskItem && mismatches.length === 0 ? 'verified' : 'failed',
        taskId: operation.taskId,
        task: taskItem ? taskSnapshot(taskItem) : null,
        expected: operation.data,
        mismatches,
      });
      continue;
    }
    if (operation.type === 'create_task') {
      const taskItem = deal.tasks.find(
        (task) => normalizeText(task.title) === normalizeText(operation.data.title),
      );
      const mismatches = taskItem
        ? taskMismatches(taskItem, {
            dueAt: operation.data.dueAt,
            status: operation.data.status,
          })
        : [];
      checks.push({
        operationId: operation.id,
        status: taskItem && mismatches.length === 0 ? 'verified' : 'failed',
        title: operation.data.title,
        task: taskItem ? taskSnapshot(taskItem) : null,
        expected: {
          dueAt: operation.data.dueAt,
          status: operation.data.status,
        },
        mismatches,
      });
      continue;
    }
    if (operation.type === 'create_note') {
      const noteItem = deal.notes.find(
        (noteItemCandidate) =>
          normalizeText(noteItemCandidate.title) === normalizeText(operation.data.title),
      );
      checks.push({
        operationId: operation.id,
        status: noteItem ? 'verified' : 'failed',
        title: operation.data.title,
        noteId: noteItem?.id ?? null,
      });
    }
  }

  return {
    status: checks.every((check) => check.status === 'verified') ? 'verified' : 'failed',
    checks,
  };
}

async function runVicenteInteractiveFlow({ client, metadata, businessLines }) {
  const rl = readline.createInterface({ input, output });
  try {
    console.log('\nMini flujo Vicente de la Cruz');
    const context = await askRequired(rl, 'Contexto abierto del deal: ');
    const dealName = await askRequired(rl, 'Nombre exacto del nuevo deal: ');
    const stageInput = await askRequired(
      rl,
      'Stage (label o value; ejemplo POSSIBLE_OPPORTUNITY): ',
    );
    const businessLineInput = await askOptional(rl, 'Business line exacta (opcional): ');
    const noteTitle =
      (await askOptional(rl, 'Título nota inicial [Contexto inicial — Vicente de la Cruz]: ')) ||
      'Contexto inicial — Vicente de la Cruz';
    const firstTaskTitle = await askRequired(rl, 'Título primera tarea de seguimiento: ');
    const firstTaskDate = await askRequired(rl, 'Fecha primera tarea YYYY-MM-DD: ');

    const stageOption = resolveOption(stageInput, metadata.stageOptions);
    if (!stageOption) {
      return { status: 'aborted', reason: `Stage not resolved: ${stageInput}` };
    }

    const businessLine = businessLineInput
      ? businessLines.find(
          (item) => normalizeText(item.name) === normalizeText(businessLineInput),
        )
      : null;
    if (businessLineInput && !businessLine) {
      return { status: 'aborted', reason: `Business line not resolved: ${businessLineInput}` };
    }

    const duplicates = await findVicenteDuplicates(client);
    console.log('\nDuplicados básicos encontrados:');
    if (duplicates.opportunities.length === 0 && duplicates.people.length === 0) {
      console.log('- Ninguno');
    } else {
      for (const opportunity of duplicates.opportunities) {
        console.log(`- Deal: ${opportunity.name} (${opportunity.id})`);
      }
      for (const person of duplicates.people) {
        console.log(`- Persona: ${person.displayName} (${person.id})`);
      }
    }

    const confirmation = await askRequired(rl, '\nConfirmas crear este deal? [y/N] ');
    if (!['y', 'yes', 's', 'si'].includes(confirmation.trim().toLowerCase())) {
      return { status: 'aborted', reason: 'User did not confirm.' };
    }

    const existingPerson =
      duplicates.people.length === 1 ? duplicates.people[0] : null;
    const data = {
      name: dealName,
      stage: stageOption.value,
    };
    if (existingPerson) data.pointOfContactId = existingPerson.id;
    if (businessLine) {
      data.businessLineName = businessLine.name;
      data.businessLine = { connect: { where: { id: businessLine.id } } };
    }

    const created = await gqlWithRetry(
      client,
      `mutation SushiCreateVicenteDeal($data: OpportunityCreateInput!) {
        createOpportunity(data: $data) { id name stage }
      }`,
      { data },
      'create Vicente opportunity',
    );
    const opportunityId = created.createOpportunity?.id;
    if (!opportunityId) throw new Error(`Vicente opportunity id missing: ${JSON.stringify(created)}`);

    const targetDeal = {
      id: opportunityId,
      pointOfContact: existingPerson ? { id: existingPerson.id } : null,
      company: null,
    };
    const noteResponse = await restWithRetry(
      client,
      '/notes',
      {
        method: 'POST',
        body: JSON.stringify({
          title: noteTitle,
          bodyV2: { markdown: context, blocknote: null },
        }),
      },
      'create Vicente note',
    );
    const noteId = noteResponse.data?.createNote?.id;
    if (!noteId) throw new Error(`Vicente note id missing: ${JSON.stringify(noteResponse)}`);
    await linkTargets({ client, idName: 'noteId', idValue: noteId, deal: targetDeal });

    const taskResponse = await restWithRetry(
      client,
      '/tasks',
      {
        method: 'POST',
        body: JSON.stringify({
          title: firstTaskTitle,
          status: 'TODO',
          dueAt: dueAtDate(firstTaskDate),
          bodyV2: { markdown: `Seguimiento inicial del deal Vicente de la Cruz.\n\n${context}`, blocknote: null },
        }),
      },
      'create Vicente task',
    );
    const taskId = taskResponse.data?.createTask?.id;
    if (!taskId) throw new Error(`Vicente task id missing: ${JSON.stringify(taskResponse)}`);
    await linkTargets({ client, idName: 'taskId', idValue: taskId, deal: targetDeal });

    return {
      status: 'created',
      opportunity: created.createOpportunity,
      note: { id: noteId, title: noteTitle },
      task: { id: taskId, title: firstTaskTitle, dueAt: dueAtDate(firstTaskDate) },
      attachedPersonId: existingPerson?.id ?? null,
      duplicates,
    };
  } finally {
    rl.close();
  }
}

async function findVicenteDuplicates(client) {
  const data = await gqlWithRetry(client, `
    query SushiVicenteDuplicates {
      opportunities(first: 500) {
        edges {
          node {
            id
            name
            pointOfContact { id name { firstName lastName } }
          }
        }
      }
      people(first: 500) {
        edges {
          node {
            id
            name { firstName lastName }
            emails { primaryEmail additionalEmails }
          }
        }
      }
    }
  `, {}, 'find Vicente duplicates');
  const opportunities = edgesToNodes(data.opportunities)
    .filter((opportunity) =>
      normalizeText(
        `${opportunity.name} ${displayPersonName(opportunity.pointOfContact)}`,
      ).includes('vicente de la cruz'),
    )
    .map((opportunity) => ({ id: opportunity.id, name: opportunity.name }));
  const people = edgesToNodes(data.people)
    .map((person) => ({ ...person, displayName: displayPersonName(person) }))
    .filter((person) => normalizeText(person.displayName).includes('vicente de la cruz'))
    .map((person) => ({
      id: person.id,
      displayName: person.displayName,
      primaryEmail: person.emails?.primaryEmail ?? null,
    }));
  return { opportunities, people };
}

function buildSummary({
  mode,
  startedAt,
  outputDir,
  requestPath,
  planPath,
  sessionPath,
  context,
  preflight,
  plan,
  execution,
  verification,
  vicente,
}) {
  const appliedOperations = execution.operations.filter((operation) => operation.status === 'applied');
  const plannedOperations = plan.operations.filter((operation) => operation.status === 'planned');
  return {
    mode,
    startedAt,
    finishedAt: new Date().toISOString(),
    outputDir,
    requestPath,
    planPath,
    sessionPath,
    status:
      plan.blockers.length > 0
        ? 'blocked'
        : mode === APPLY
          ? execution.status
          : 'dry_run_completed',
    crmWritten: mode === APPLY && appliedOperations.length > 0,
    iaMujeresTouched: false,
    resolvedDeals: context.resolvedDeals.length,
    blockers: plan.blockers,
    warnings: plan.warnings,
    preflight,
    plannedCounts: plan.summary,
    executionSummary: execution.summary,
    dryRunSourceCounts: countByType(plannedOperations),
    appliedSourceCounts: countByType(
      appliedOperations.map((item) => item.operation),
    ),
    dealsUpdated: uniqueDealsByType(plannedOperations, ['update_opportunity_stage']),
    tasksMarkedDone: uniqueTasksByPredicate(plannedOperations, (operation) => operation.type === 'update_task' && operation.data?.status === 'DONE'),
    tasksCreated: uniqueTaskTitlesByType(plannedOperations, 'create_task'),
    tasksRescheduled: uniqueTasksByPredicate(plannedOperations, (operation) => operation.type === 'update_task' && Boolean(operation.data?.dueAt)),
    stagesChanged: plannedOperations
      .filter((operation) => operation.type === 'update_opportunity_stage')
      .map((operation) => ({
        dealName: operation.dealName,
        from: operation.before?.stage ?? null,
        to: operation.data.stage,
      })),
    notesCreated: plannedOperations
      .filter((operation) => operation.type === 'create_note')
      .map((operation) => ({ dealName: operation.dealName, title: operation.data.title })),
    noOps: plan.operations
      .filter((operation) => operation.status === 'no_op')
      .map((operation) => ({
        dealName: operation.dealName,
        kind: operation.sourceKind,
        reason: operation.reason,
      })),
    blockedOperations: plan.operations
      .filter((operation) => operation.status === 'blocked')
      .map((operation) => ({
        dealName: operation.dealName,
        kind: operation.sourceKind,
        reason: operation.reason,
      })),
    verification,
    vicente,
  };
}

function printRunSummary({ summary, plan, execution, paths }) {
  console.log(`Sushi CRM update ${summary.mode}`);
  console.log(`Status: ${summary.status}`);
  console.log(`CRM written: ${summary.crmWritten ? 'yes' : 'no'}`);
  console.log(`IA Mujeres touched: ${summary.iaMujeresTouched ? 'yes' : 'no'}`);
  console.log(`Resolved deals: ${summary.resolvedDeals}`);
  console.log(`Blockers: ${summary.blockers.length}`);
  console.log(`Warnings: ${summary.warnings.length}`);
  console.log(`Planned/applied/no-op/blocked/failed: ${execution.summary.planned}/${execution.summary.applied}/${execution.summary.noOp}/${execution.summary.blocked}/${execution.summary.failed}`);
  console.log(`Operation counts: ${JSON.stringify(plan.summary)}`);
  console.log(`Request: ${paths.requestPath}`);
  console.log(`Plan: ${paths.planPath}`);
  console.log(`Summary: ${paths.summaryPath}`);
  console.log(`Session: ${paths.sessionPath}`);
  if (summary.blockers.length > 0) {
    console.log('\nBlockers:');
    for (const blocker of summary.blockers.slice(0, 20)) {
      console.log(`- ${blocker.message}`);
    }
  }
}

function metadataSummary(metadata, businessLines) {
  return {
    stages: metadata.stageOptions,
    taskStatuses: metadata.taskStatusOptions,
    businessLines: businessLines.map((businessLine) => ({
      id: businessLine.id,
      name: businessLine.name,
    })),
  };
}

function planEntry(spec, sourceIndex, deal, type, extra = {}) {
  return {
    id: `sushi_${String(sourceIndex + 1).padStart(3, '0')}_${type}`,
    status: 'planned',
    type,
    dealKey: spec.dealKey,
    dealId: deal.id,
    dealName: deal.name,
    sourceIndex,
    sourceKind: spec.kind,
    target: targetSnapshot(deal),
    reason: extra.reason ?? spec.reason ?? null,
    ...extra,
  };
}

function noOp(spec, sourceIndex, deal, reason, extra = {}) {
  return {
    id: `sushi_${String(sourceIndex + 1).padStart(3, '0')}_noop`,
    status: 'no_op',
    type: 'no_op',
    dealKey: spec.dealKey,
    dealId: deal?.id ?? null,
    dealName: deal?.name ?? null,
    sourceIndex,
    sourceKind: spec.kind,
    reason,
    ...extra,
  };
}

function blocked(spec, sourceIndex, reason, deal = null) {
  return {
    id: `sushi_${String(sourceIndex + 1).padStart(3, '0')}_blocked`,
    status: 'blocked',
    type: 'blocked',
    dealKey: spec.dealKey,
    dealId: deal?.id ?? null,
    dealName: deal?.name ?? null,
    sourceIndex,
    sourceKind: spec.kind,
    reason,
  };
}

function normalizeOpportunity(opportunity) {
  const notes = (opportunity.noteTargets?.edges ?? [])
    .map((edge) => edge.node?.note)
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const tasks = (opportunity.taskTargets?.edges ?? [])
    .map((edge) => edge.node?.task)
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  return { ...opportunity, notes, tasks };
}

function targetSnapshot(deal) {
  return {
    id: deal.id,
    name: deal.name,
    company: deal.company ? { id: deal.company.id, name: deal.company.name } : null,
    pointOfContact: deal.pointOfContact
      ? { id: deal.pointOfContact.id, name: displayPersonName(deal.pointOfContact) }
      : null,
  };
}

function taskSnapshot(taskItem) {
  return {
    id: taskItem.id,
    title: taskItem.title,
    status: taskItem.status ?? null,
    dueAt: taskItem.dueAt ?? null,
  };
}

function taskMismatches(taskItem, expected) {
  const mismatches = [];
  for (const [field, value] of Object.entries(expected)) {
    if (value === undefined || value === null) continue;
    if (taskItem[field] !== value) {
      mismatches.push({ field, expected: value, actual: taskItem[field] ?? null });
    }
  }
  return mismatches;
}

function isOpenTask(taskItem) {
  return taskItem.status !== 'DONE';
}

function findTasksByTitle(tasks, title) {
  const wanted = normalizeText(title);
  return tasks.filter((taskItem) => normalizeText(taskItem.title) === wanted);
}

function findTasksByTitles(tasks, titles) {
  const wanted = new Set(titles.map(normalizeText));
  return tasks.filter((taskItem) => wanted.has(normalizeText(taskItem.title)));
}

function isIaMujeresDeal(deal) {
  const businessLineName = deal.businessLine?.name ?? deal.businessLineName ?? '';
  return (
    IA_MUJERES_BUSINESS_LINES.has(businessLineName) ||
    Boolean(deal.iaMujeresFunnelStage) ||
    normalizeText(deal.name).includes('ia mujeres') ||
    normalizeText(deal.campaignName).includes('ia mujeres')
  );
}

function namesLookRelated(expected, actual) {
  const expectedNorm = normalizeText(expected);
  const actualNorm = normalizeText(actual);
  if (expectedNorm === actualNorm) return true;
  const expectedTokens = new Set(expectedNorm.split(' ').filter((token) => token.length > 2));
  const actualTokens = new Set(actualNorm.split(' ').filter((token) => token.length > 2));
  const shared = [...expectedTokens].filter((token) => actualTokens.has(token));
  return shared.length >= Math.min(3, expectedTokens.size);
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

async function gqlWithRetry(client, query, variables, label) {
  return runWithRateLimitRetry(() => client.gql(query, variables), label);
}

async function restWithRetry(client, pathName, init, label) {
  return runWithRateLimitRetry(() => client.rest(pathName, init), label);
}

async function runWithRateLimitRetry(fn, label) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt += 1;
      if (!isRateLimitError(error) || attempt >= RATE_LIMIT_MAX_ATTEMPTS) {
        throw error;
      }
      console.log(
        `[rate-limit] ${label} attempt ${attempt}/${RATE_LIMIT_MAX_ATTEMPTS}; waiting ${Math.round(
          RATE_LIMIT_WAIT_MS / 1000,
        )}s before retry`,
      );
      await sleep(RATE_LIMIT_WAIT_MS);
    }
  }
}

function isRateLimitError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /limit reached/i.test(message) ||
    /LIMIT_REACHED/i.test(message) ||
    /429/.test(message)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function displayPersonName(person) {
  if (!person) return '';
  return [person.name?.firstName, person.name?.lastName].filter(Boolean).join(' ').trim();
}

function edgesToNodes(connection) {
  return (connection?.edges ?? []).map((edge) => edge.node).filter(Boolean);
}

function dueAtDate(date) {
  return `${date}T07:00:00.000Z`;
}

function dueAtLocal(date, hhmm) {
  const [hour, minute] = hhmm.split(':').map(Number);
  const utc = new Date(Date.UTC(...date.split('-').map((part, index) => Number(part) - (index === 1 ? 1 : 0)), hour - 1, minute, 0));
  return utc.toISOString();
}

function defaultTaskMarkdown(deal) {
  return `Creada desde CRM Sushi update 2026-06-22 para ${deal.name}.`;
}

function resolveOption(inputValue, options) {
  const wanted = normalizeText(inputValue);
  return (
    options.find((option) => normalizeText(option.value) === wanted) ??
    options.find((option) => normalizeText(option.label) === wanted) ??
    null
  );
}

async function askRequired(rl, question) {
  const answer = (await rl.question(question)).trim();
  if (!answer) throw new Error(`Required answer missing: ${question}`);
  return answer;
}

async function askOptional(rl, question) {
  return (await rl.question(question)).trim();
}

function summarizeOperations(operations) {
  return {
    planned: operations.filter((operation) => operation.status === 'planned').length,
    noOp: operations.filter((operation) => operation.status === 'no_op').length,
    blocked: operations.filter((operation) => operation.status === 'blocked').length,
    byType: countByType(operations.filter((operation) => operation.status === 'planned')),
  };
}

function countByType(operations) {
  return operations.reduce((counts, operation) => {
    counts[operation.type] = (counts[operation.type] ?? 0) + 1;
    return counts;
  }, {});
}

function uniqueDealsByType(operations, types) {
  const seen = new Set();
  return operations
    .filter((operation) => types.includes(operation.type))
    .filter((operation) => {
      if (seen.has(operation.dealId)) return false;
      seen.add(operation.dealId);
      return true;
    })
    .map((operation) => ({ id: operation.dealId, name: operation.dealName }));
}

function uniqueTasksByPredicate(operations, predicate) {
  return operations
    .filter(predicate)
    .map((operation) => ({
      dealName: operation.dealName,
      taskId: operation.taskId ?? null,
      title: operation.taskTitle ?? operation.data?.title ?? null,
      dueAt: operation.data?.dueAt ?? null,
      status: operation.data?.status ?? null,
    }));
}

function uniqueTaskTitlesByType(operations, type) {
  return operations
    .filter((operation) => operation.type === type)
    .map((operation) => ({
      dealName: operation.dealName,
      title: operation.data.title,
      dueAt: operation.data.dueAt,
      status: operation.data.status,
    }));
}

function stage(dealKey, stageValue) {
  return { kind: 'update_stage', dealKey, stage: stageValue };
}

function note(dealKey, title, markdown, options = {}) {
  return { kind: 'create_note', dealKey, title, markdown, ...options };
}

function task(dealKey, title, date, markdown = '') {
  return {
    kind: 'create_task',
    dealKey,
    title,
    dueAt: dueAtDate(date),
    markdown,
    status: 'TODO',
  };
}

function ensureTask(dealKey, title, dueAt, markdown = '') {
  return {
    kind: 'ensure_task',
    dealKey,
    title,
    dueAt,
    markdown,
    status: 'TODO',
  };
}

function doneTask(dealKey, title, options = {}) {
  return {
    kind: 'mark_task_done',
    dealKey,
    title,
    ...options,
  };
}

function doneOrCreateTask(dealKey, title, date, markdown = '') {
  return {
    kind: 'done_or_create_task',
    dealKey,
    title,
    dueAt: dueAtDate(date),
    markdown,
  };
}

function doneIfNotReflected(dealKey, title, reflectedByTitles = []) {
  return {
    kind: 'done_if_not_reflected',
    dealKey,
    title,
    reflectedByTitles,
  };
}

function rescheduleTask(dealKey, title, date, options = {}) {
  return {
    kind: 'reschedule_task',
    dealKey,
    title,
    dueAt: dueAtDate(date),
    ...options,
  };
}

function closeOpenTasks(dealKey, reason) {
  return {
    kind: 'close_open_tasks',
    dealKey,
    reason,
  };
}

function noChange(dealKey, reason) {
  return {
    kind: 'no_change',
    dealKey,
    reason,
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

// Spanish (Mexico) is the default language and the source of the keys: en.ts must
// have exactly these keys (scripts/check-i18n.mjs fails the build otherwise).
// Interpolation: {name}. Messages to doctors are not here: they come from Python,
// always in Spanish.
export const es = {
  "app.name": "CS Control Room",

  // navigation
  "nav.today": "Hoy",
  "nav.doctors": "Doctores",
  "nav.signals": "Señales",
  "nav.summary": "Resumen",
  "nav.team": "Mi equipo",
  "nav.pulse": "Pulse",
  "nav.control": "Control",
  "nav.cost": "Costo IA",
  "nav.group.work": "Mi trabajo",
  "nav.group.manage": "Gestión",
  "nav.menu": "Menú",
  "nav.collapse": "Contraer menú",
  "nav.expand": "Expandir menú",

  // greetings and page headers
  "greet.morning": "Buenos días, {name}",
  "greet.afternoon": "Buenas tardes, {name}",
  "greet.evening": "Buenas noches, {name}",
  "today.subtitle": "La IA revisó tus {n} doctores y armó tu día: {k} acciones",
  "today.start": "Empezar",
  "today.placeholder": "Tu día se arma aquí: llamadas, seguimientos que agendaste, mensajes listos y derivaciones.",
  "summary.subtitle": "{scope}: {n} doctores activos, {risk} en riesgo. Datos de los últimos {days} días.",
  "doctors.subtitle": "Toda la cartera, con los filtros de cada conteo.",
  "signals.subtitle": "Lo que los especialistas anotaron y cuánto pesa en las cancelaciones.",
  "team.subtitle": "Dónde está el trabajo y quién necesita ayuda.",
  "pulse.subtitle": "Qué ha pasado día a día.",
  "control.subtitle": "¿Cambio real o ruido?",
  "cost.subtitle": "Cuánto cuesta la IA y quién la usa.",
  "page.soon": "Esta pantalla se construye en la fase {n} del plan.",

  // top bar
  "search.placeholder": "Buscar doctores, plays…",
  "search.open": "Abrir búsqueda",
  "clock.snapshot": "Datos al {date}",
  "clock.real": "Hoy, {date}",
  "clock.simulated": "Día simulado: {date}",
  "clock.next": "Avanzar un día",
  "clock.reset": "Volver al {date}",
  "clock.note": "Los datos son una foto al {date}. Avanzar el día sirve para ensayar seguimientos; no cambia ningún número.",
  "bell.followups": "{n} seguimientos vencen hoy",
  "bell.none": "No vence ningún seguimiento hoy",

  // sidebar bottom
  "ai.ask": "Pregúntale a tu cartera",
  "assistant.body": "Pregunta en español o inglés; las cifras salen de tus datos, no del modelo.",
  "assistant.cta": "Preguntar",
  "assistant.soon": "El asistente llega en la fase 4. Mientras, usa la búsqueda (⌘K).",
  "ai.on": "IA activa · {models}",
  "ai.off.short": "IA apagada",
  "ai.off": "IA apagada: se muestra la versión automática",
  "lang.label": "Idioma",
  "theme.label": "Tema",
  "theme.light": "Claro",
  "theme.dark": "Oscuro",
  "user.switch": "Cambiar de identidad",
  "user.none": "Elige quién eres",

  // identity
  "who.title": "¿Quién eres?",
  "who.body": "Elige tu nombre para abrir tu día. Se guarda solo en este navegador y lo puedes cambiar desde tu tarjeta.",
  "who.specialists": "Especialistas de farming",
  "who.managers": "Managers",
  "who.director.group": "Dirección",
  "who.director": "Dirección CS",
  "who.manager": "Manager · {team}",
  "who.specialist": "Especialista · {team}",
  "who.role.specialist": "Especialista",
  "who.role.manager": "Manager",
  "who.role.director": "Dirección",

  // context switcher
  "context.book": "Mi cartera",
  "context.doctors": "{n} doctores",
  "context.portfolio": "Toda la cartera",
  "context.teams": "Equipos",
  "context.specialists": "Especialistas",
  "context.label": "Cartera",

  // command palette
  "palette.placeholder": "Busca un doctor, una pantalla o una acción…",
  "palette.doctors": "Doctores",
  "palette.screens": "Pantallas",
  "palette.actions": "Acciones",
  "palette.empty": "Sin resultados.",
  "palette.loading": "Cargando doctores…",
  "palette.start": "Empezar mi día",
  "palette.ask": "Pregúntale a la IA",
  "palette.lang": "Cambiar idioma",
  "palette.theme": "Cambiar tema",
  "palette.who": "Cambiar de identidad",
  "palette.churned": "canceló",

  // sections
  "section.download": "Descargar",
  "section.filter": "Filtrar",

  // blocks, outcomes, AI (spec §7)
  "block.call": "Llamar hoy",
  "block.followup": "Seguimientos que agendaste",
  "block.message": "Mensajes listos",
  "block.handoff": "Derivar a upsell",
  "block.later": "Más allá de tu capacidad de hoy",
  "outcome.sent": "Enviado",
  "outcome.no_answer": "Sin respuesta",
  "outcome.agreed": "Acordamos…",
  "outcome.na": "No aplica",
  "ai.analyze": "Analizar con IA",
  "ai.rewrite": "Reescribir con IA",
  "ai.explain": "Explícame",
  "ai.unverified": "No está en los datos",
  "ai.context": "Ver contexto",
  "rate.suppressed": "Solo {n} casos: muy pocos para un porcentaje",

  // doctor sheet
  "sheet.close": "Cerrar",
  "sheet.loading": "Cargando…",
  "sheet.missing": "Este doctor no está en la versión actual de los datos.",
} as const

export type Key = keyof typeof es

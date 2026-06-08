import { normalizeText } from './text-utils.mjs';

const WEEKDAY_INDEX = new Map([
  ['domingo', 0],
  ['lunes', 1],
  ['martes', 2],
  ['miercoles', 3],
  ['miércoles', 3],
  ['jueves', 4],
  ['viernes', 5],
  ['sabado', 6],
  ['sábado', 6],
]);

export function parseReviewInput(input, now = new Date()) {
  const raw = String(input ?? '').trim();
  const normalized = normalizeText(raw);

  if (!raw) return { control: 'empty', operations: [] };
  if (['skip', 'saltar', 'sin cambios'].includes(normalized)) {
    return { control: 'skip', operations: [] };
  }
  if (['cancelar', 'cancel', 'salir'].includes(normalized)) {
    return { control: 'cancel', operations: [] };
  }
  if (['resumen', 'summary'].includes(normalized)) {
    return { control: 'summary', operations: [] };
  }
  if (['confirmar', 'confirm', 'aplicar'].includes(normalized)) {
    return { control: 'confirm', operations: [] };
  }
  if (['dry run', 'dryrun', 'dry-run'].includes(normalized)) {
    return { control: 'dry-run', operations: [] };
  }

  const operations = [];
  const consumedRanges = [];

  collectRegex(raw, /\bnota\s*:\s*([^]+)$/gi, (match) => {
    operations.push({ type: 'create_note', markdown: match[1].trim() });
  }, consumedRanges);

  collectRegex(raw, /\b(?:mover|move|stage|fase)\s+(?:a|to)?\s*([^.,;]+)/gi, (match) => {
    operations.push({ type: 'set_stage', rawStage: match[1].trim() });
  }, consumedRanges);

  collectRegex(raw, /\bimporte\s+([0-9][0-9.,]*)/gi, (match) => {
    operations.push({ type: 'set_amount', amount: parseLocalizedNumber(match[1]) });
  }, consumedRanges);

  collectRegex(raw, /\bcrear\s+tarea\s+([^.;]+)/gi, (match) => {
    const parsedDueDate = parseDueDateFromText(match[1].trim(), now);
    operations.push({
      type: 'create_task',
      title: parsedDueDate.text,
      dueAt: parsedDueDate.dueAt,
    });
  }, consumedRanges);

  collectRegex(raw, /\bcerrar\s+tarea\s+([^.;]+)/gi, (match) => {
    operations.push({ type: 'close_task', rawTask: match[1].trim() });
  }, consumedRanges);

  collectRegex(raw, /\b(?:siguiente|proximo|pr[oó]ximo)\s+paso\s*:?\s*([^.;]+)/gi, (match) => {
    operations.push({ type: 'set_next_step', value: match[1].trim() });
  }, consumedRanges);

  if (!operations.some((operation) => operation.type === 'create_note')) {
    const freeText = removeConsumedText(raw, consumedRanges);
    if (freeText.length >= 18) {
      operations.unshift({ type: 'create_note', markdown: freeText });
    }
  }

  return { control: null, operations };
}

function collectRegex(raw, regex, onMatch, consumedRanges) {
  for (const match of raw.matchAll(regex)) {
    onMatch(match);
    consumedRanges.push([match.index, match.index + match[0].length]);
  }
}

function removeConsumedText(raw, consumedRanges) {
  let text = raw;
  for (const [start, end] of [...consumedRanges].sort((a, b) => b[0] - a[0])) {
    text = `${text.slice(0, start)} ${text.slice(end)}`;
  }

  return text
    .replace(/\s+/g, ' ')
    .replace(/^[.,;:\s]+|[.,;:\s]+$/g, '')
    .trim();
}

function parseLocalizedNumber(value) {
  const normalized = String(value)
    .replace(/\./g, '')
    .replace(',', '.');
  const amount = Number(normalized);

  if (!Number.isFinite(amount)) {
    throw new Error(`Invalid amount: ${value}`);
  }

  return amount;
}

export function parseDueDateFromText(text, now = new Date()) {
  let cleanText = text;
  let dueAt = null;

  const weekdayMatch = cleanText.match(
    /\b(?:el|para)\s+(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/i,
  );
  if (weekdayMatch) {
    dueAt = nextWeekday(now, WEEKDAY_INDEX.get(weekdayMatch[1].toLowerCase()));
    cleanText = cleanText.replace(weekdayMatch[0], '').trim();
  }

  const tomorrowMatch = cleanText.match(/\b(?:manana|mañana)\b/i);
  if (!dueAt && tomorrowMatch) {
    dueAt = addDaysAtNine(now, 1);
    cleanText = cleanText.replace(tomorrowMatch[0], '').trim();
  }

  const isoMatch = cleanText.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (!dueAt && isoMatch) {
    dueAt = new Date(`${isoMatch[1]}T09:00:00`);
    cleanText = cleanText.replace(isoMatch[0], '').trim();
  }

  const slashMatch = cleanText.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!dueAt && slashMatch) {
    dueAt = new Date(
      Number(slashMatch[3]),
      Number(slashMatch[2]) - 1,
      Number(slashMatch[1]),
      9,
      0,
      0,
    );
    cleanText = cleanText.replace(slashMatch[0], '').trim();
  }

  return {
    text: cleanText.replace(/\s+/g, ' ').trim(),
    dueAt: dueAt ? dueAt.toISOString() : null,
  };
}

function nextWeekday(now, targetDay) {
  const date = addDaysAtNine(now, 0);
  const currentDay = date.getDay();
  const delta = (targetDay - currentDay + 7) % 7 || 7;
  date.setDate(date.getDate() + delta);
  return date;
}

function addDaysAtNine(now, days) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(9, 0, 0, 0);
  return date;
}


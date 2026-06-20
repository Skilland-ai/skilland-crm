export function createReadlineInterviewer(rl) {
  return {
    async ask(question, { defaultValue = null } = {}) {
      const suffix = defaultValue !== null ? ` [${defaultValue}]` : '';
      const answer = await rl.question(`${question}${suffix} `);
      const trimmed = answer.trim();
      return trimmed || defaultValue;
    },
    async confirm(question, { defaultValue = false } = {}) {
      const prompt = defaultValue ? '[Y/n]' : '[y/N]';
      const answer = await rl.question(`${question} ${prompt} `);
      const normalized = answer.trim().toLowerCase();
      if (!normalized) {
        return defaultValue;
      }
      return ['y', 'yes', 's', 'si'].includes(normalized);
    },
    async choose(question, items, renderItem) {
      if (!Array.isArray(items) || items.length === 0) {
        throw new Error('Cannot choose from an empty list.');
      }
      if (items.length === 1) {
        return items[0];
      }

      console.log(`\n${question}`);
      items.forEach((item, index) => {
        console.log(`${index + 1}. ${renderItem(item, index)}`);
      });

      while (true) {
        const answer = await rl.question('Elige opcion: ');
        const index = Number(answer.trim());
        if (Number.isInteger(index) && index >= 1 && index <= items.length) {
          return items[index - 1];
        }
        console.log('Opcion invalida.');
      }
    },
  };
}

export async function collectInteractiveRequest({
  interviewer,
  defaultRequester,
  applyRequested,
}) {
  const action = await interviewer.choose(
    'Que quieres hacer en AIKount?',
    ACTION_OPTIONS,
    (item) => `${item.label} (${item.value})`,
  );
  const lookup = await interviewer.ask(
    'Pega la URL del deal, su ID o un texto para buscarlo en Twenty:',
  );

  return {
    requester: defaultRequester,
    mode: applyRequested ? 'apply' : 'dry_run',
    action: action.value,
    dealLookup: normalizeLookup(lookup),
  };
}

export function defaultDocumentKey() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
    date.getUTCDate(),
  )}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}-01`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function parseDecimal(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const normalized = String(value).replace(',', '.').trim();
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  return Number(normalized);
}

export function parseEmailList(value) {
  if (!value) {
    return [];
  }
  return String(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const ACTION_OPTIONS = [
  { value: 'create_quote', label: 'Crear presupuesto' },
  { value: 'update_quote', label: 'Actualizar presupuesto' },
  { value: 'send_quote', label: 'Enviar presupuesto' },
  { value: 'accept_quote', label: 'Aceptar presupuesto' },
  { value: 'reject_quote', label: 'Rechazar presupuesto' },
  { value: 'convert_quote_to_invoice', label: 'Convertir presupuesto a factura' },
  { value: 'create_invoice', label: 'Crear factura' },
  { value: 'update_invoice', label: 'Actualizar factura' },
  { value: 'issue_invoice', label: 'Emitir factura' },
  { value: 'share_invoice', label: 'Compartir factura' },
  { value: 'send_invoice', label: 'Enviar factura' },
];

function normalizeLookup(lookup) {
  if (/^https?:\/\//i.test(lookup) || lookup.includes('/opportunities/')) {
    return { opportunityUrl: lookup };
  }
  if (
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
      lookup,
    )
  ) {
    return { opportunityId: lookup.match(/[0-9a-f-]{36}/i)[0] };
  }
  return { search: lookup };
}

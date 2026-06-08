export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function personName(person) {
  if (!person) return '(sin contacto)';
  const firstName = person.name?.firstName ?? '';
  const lastName = person.name?.lastName ?? '';
  return `${firstName} ${lastName}`.trim() || '(sin nombre)';
}

export function workspaceMemberName(member) {
  if (!member) return '(sin owner)';
  const firstName = member.name?.firstName ?? '';
  const lastName = member.name?.lastName ?? '';
  const name = `${firstName} ${lastName}`.trim();
  return name || member.userEmail || member.id;
}

export function formatAmount(amount) {
  if (!amount?.amountMicros && amount?.amountMicros !== 0) return 'sin definir';
  const value = Number(amount.amountMicros) / 1_000_000;
  const currency = amount.currencyCode ?? 'EUR';
  return `${value.toLocaleString('es-ES')} ${currency}`;
}

export function truncate(value, maxLength = 220) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}


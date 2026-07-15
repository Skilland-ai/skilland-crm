const SECRET_KEY_PATTERN =
  /(api[_-]?key|authorization|bearer|secret|token|password|passwd|cookie|credential|private[_-]?key|signed[_-]?url|client[_-]?secret|access[_-]?key)/i;

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const COOKIE_HEADER_PATTERN = /\b(?:set-cookie|cookie)\s*:\s*[^\r\n]+/gi;
const PRIVATE_KEY_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/gi;
const API_CREDENTIAL_PATTERN =
  /\b(?:sk-(?:proj-)?|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]{8,}\b/gi;
const SIGNED_URL_PATTERN =
  /https?:\/\/[^\s]+[?&](?:x-amz-signature|x-goog-signature|signature|sig|access_token|token)=[^\s&]+[^\s]*/gi;

const REDACTED = '[REDACTED]';

export function isSecretShapedKey(key) {
  return typeof key === 'string' && SECRET_KEY_PATTERN.test(key);
}

export function findSecretShapedKeyPath(value) {
  const seen = new WeakSet();

  function visit(current, path) {
    if (current === null || typeof current !== 'object') {
      return null;
    }
    if (seen.has(current)) {
      return null;
    }
    seen.add(current);

    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        const found = visit(current[index], `${path}[${index}]`);
        if (found) return found;
      }
      return null;
    }

    for (const [key, child] of Object.entries(current)) {
      const childPath = path ? `${path}.${key}` : key;
      if (isSecretShapedKey(key)) {
        return childPath;
      }
      const found = visit(child, childPath);
      if (found) return found;
    }
    return null;
  }

  return visit(value, '$');
}

export function findSensitiveTextPath(value) {
  const seen = new WeakSet();

  function visit(current, path) {
    if (typeof current === 'string') {
      return containsSensitiveText(current) ? path : null;
    }
    if (current === null || typeof current !== 'object') return null;
    if (seen.has(current)) return null;
    seen.add(current);

    if (Array.isArray(current)) {
      for (let index = 0; index < current.length; index += 1) {
        const found = visit(current[index], `${path}[${index}]`);
        if (found) return found;
      }
      return null;
    }

    for (const [key, child] of Object.entries(current)) {
      const found = visit(child, path ? `${path}.${key}` : key);
      if (found) return found;
    }
    return null;
  }

  return visit(value, '$');
}

export function redactText(value) {
  if (typeof value !== 'string') return value;

  return value
    .replace(PRIVATE_KEY_PATTERN, REDACTED)
    .replace(SIGNED_URL_PATTERN, '[REDACTED_SIGNED_URL]')
    .replace(COOKIE_HEADER_PATTERN, 'cookie: [REDACTED]')
    .replace(BEARER_PATTERN, 'Bearer [REDACTED]')
    .replace(API_CREDENTIAL_PATTERN, REDACTED)
    .replace(EMAIL_PATTERN, '[REDACTED_EMAIL]');
}

export function containsSensitiveText(value) {
  if (typeof value !== 'string') return false;
  return redactText(value) !== value;
}

export function redactSensitive(value) {
  const seen = new WeakMap();

  function visit(current) {
    if (typeof current === 'string') return redactText(current);
    if (
      current === null ||
      typeof current === 'number' ||
      typeof current === 'boolean' ||
      typeof current === 'undefined'
    ) {
      return current;
    }
    if (typeof current !== 'object') return REDACTED;
    if (seen.has(current)) return '[REDACTED_CYCLE]';

    if (Array.isArray(current)) {
      const output = [];
      seen.set(current, output);
      for (const child of current) output.push(visit(child));
      return output;
    }

    const output = {};
    seen.set(current, output);
    for (const [key, child] of Object.entries(current)) {
      output[key] = isSecretShapedKey(key) ? REDACTED : visit(child);
    }
    return output;
  }

  return visit(value);
}

export function redactSafeStrings(values) {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value) => typeof value === 'string' && value.length > 0)
    .map((value) => redactText(value));
}

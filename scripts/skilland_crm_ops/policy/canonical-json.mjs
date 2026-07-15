import { createHash, timingSafeEqual } from 'node:crypto';

import { RouterError } from '../errors.mjs';
import { isPlainObject } from '../validation.mjs';

export const OPERATION_PLAN_HASH_DOMAIN =
  'skilland-crm-ops/operation-plan/v1\n';

function canonicalInvalid(message = 'The value is outside the canonical JSON subset.') {
  throw new RouterError('INVALID_PLAN', {
    publicMessage: message,
    outcome: 'blocked',
  });
}

function assertWellFormedUnicode(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) canonicalInvalid();
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      canonicalInvalid();
    }
  }
}

function assertJsonArrayShape(value) {
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === 'symbol')) canonicalInvalid();
  const names = ownKeys.filter((key) => key !== 'length');
  if (names.length !== value.length) canonicalInvalid();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) canonicalInvalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      canonicalInvalid();
    }
  }
}

function canonicalize(value, ancestors) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) canonicalInvalid();
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    assertWellFormedUnicode(value);
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') canonicalInvalid();
  if (ancestors.has(value)) canonicalInvalid('Cyclic values cannot be canonicalized.');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      assertJsonArrayShape(value);
      return `[${value.map((item) => canonicalize(item, ancestors)).join(',')}]`;
    }
    if (!isPlainObject(value)) canonicalInvalid();

    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key === 'symbol')) canonicalInvalid();
    for (const key of ownKeys) {
      assertWellFormedUnicode(key);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
        canonicalInvalid();
      }
    }

    return `{${ownKeys
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalize(value[key], ancestors)}`,
      )
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value) {
  return canonicalize(value, new WeakSet());
}

function cloneAndFreeze(value, ancestors) {
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) {
    canonicalJson(value);
    return value;
  }
  if (typeof value !== 'object' || ancestors.has(value)) canonicalInvalid();
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      assertJsonArrayShape(value);
      return Object.freeze(value.map((item) => cloneAndFreeze(item, ancestors)));
    }
    if (!isPlainObject(value)) canonicalInvalid();
    canonicalJson(value);
    const clone = {};
    for (const key of Object.keys(value)) {
      clone[key] = cloneAndFreeze(value[key], ancestors);
    }
    return Object.freeze(clone);
  } finally {
    ancestors.delete(value);
  }
}

export function deepFrozenJsonClone(value) {
  return cloneAndFreeze(value, new WeakSet());
}

export function sha256Canonical(value, domain = '') {
  const digest = createHash('sha256')
    .update(domain, 'utf8')
    .update(canonicalJson(value), 'utf8')
    .digest('hex');
  return `sha256:${digest}`;
}

export function constantTimeHashEqual(left, right) {
  if (
    typeof left !== 'string' ||
    typeof right !== 'string' ||
    left.length !== right.length
  ) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

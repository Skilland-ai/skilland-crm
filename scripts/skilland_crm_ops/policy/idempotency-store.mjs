import { RouterError } from '../errors.mjs';
import { canonicalJson, deepFrozenJsonClone } from './canonical-json.mjs';

function validateReservations(reservations) {
  if (
    !Array.isArray(reservations) ||
    reservations.length < 1 ||
    reservations.some(
      (item) =>
        !item ||
        typeof item.key !== 'string' ||
        item.key.length < 8 ||
        typeof item.planHash !== 'string' ||
        typeof item.operationId !== 'string',
    ) ||
    new Set(reservations.map((item) => item.key)).size !== reservations.length
  ) {
    throw new RouterError('INVALID_PLAN', {
      publicMessage: 'The plan idempotency reservation batch is invalid.',
    });
  }
}

export class InMemoryIdempotencyStore {
  #entries = new Map();

  async reserveBatch(reservations) {
    validateReservations(reservations);
    const existing = reservations.map((reservation) => ({
      reservation,
      entry: this.#entries.get(reservation.key) ?? null,
    }));

    for (const { reservation, entry } of existing) {
      if (entry && entry.planHash !== reservation.planHash) {
        throw new RouterError('IDEMPOTENCY_CONFLICT');
      }
      if (entry?.state === 'in_progress') {
        throw new RouterError('IDEMPOTENCY_IN_PROGRESS');
      }
      if (entry?.state === 'unknown') {
        throw new RouterError('IDEMPOTENCY_OUTCOME_UNKNOWN');
      }
    }

    const completed = existing.filter(({ entry }) => entry?.state === 'completed');
    if (completed.length > 0) {
      if (completed.length !== reservations.length) {
        throw new RouterError('IDEMPOTENCY_OUTCOME_UNKNOWN', {
          publicMessage:
            'The idempotency batch is only partially terminal and requires reconciliation.',
        });
      }
      const serialized = completed.map(({ entry }) => canonicalJson(entry.result));
      if (serialized.some((value) => value !== serialized[0])) {
        throw new RouterError('IDEMPOTENCY_OUTCOME_UNKNOWN');
      }
      return {
        kind: 'replay',
        result: deepFrozenJsonClone(completed[0].entry.result),
      };
    }

    for (const reservation of reservations) {
      this.#entries.set(
        reservation.key,
        deepFrozenJsonClone({
          key: reservation.key,
          planHash: reservation.planHash,
          operationId: reservation.operationId,
          state: 'in_progress',
          result: null,
        }),
      );
    }
    return { kind: 'reserved', result: null };
  }

  async completeBatch(reservations, result) {
    validateReservations(reservations);
    for (const reservation of reservations) {
      const entry = this.#entries.get(reservation.key);
      if (
        entry?.state !== 'in_progress' ||
        entry.planHash !== reservation.planHash ||
        entry.operationId !== reservation.operationId
      ) {
        throw new RouterError('IDEMPOTENCY_OUTCOME_UNKNOWN');
      }
    }
    const safeResult = deepFrozenJsonClone(result);
    for (const reservation of reservations) {
      this.#entries.set(
        reservation.key,
        deepFrozenJsonClone({
          key: reservation.key,
          planHash: reservation.planHash,
          operationId: reservation.operationId,
          state: 'completed',
          result: safeResult,
        }),
      );
    }
  }

  async markUnknownBatch(reservations) {
    validateReservations(reservations);
    for (const reservation of reservations) {
      const entry = this.#entries.get(reservation.key);
      if (
        entry?.state === 'in_progress' &&
        entry.planHash === reservation.planHash
      ) {
        this.#entries.set(
          reservation.key,
          deepFrozenJsonClone({
            ...entry,
            state: 'unknown',
          }),
        );
      }
    }
  }

  snapshot() {
    return deepFrozenJsonClone(
      [...this.#entries.values()].sort((left, right) =>
        left.key.localeCompare(right.key),
      ),
    );
  }
}

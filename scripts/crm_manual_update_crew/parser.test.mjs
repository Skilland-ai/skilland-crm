import assert from 'node:assert/strict';
import test from 'node:test';

import { parseReviewInput } from './parser.mjs';
import { planOperationsFromInput } from './planner.mjs';

const NOW = new Date('2026-06-08T09:00:00Z');

test('parseReviewInput extracts mixed natural update commands', () => {
  const parsed = parseReviewInput(
    'Se envio el dossier. Mover a propuesta presentada. Crear tarea llamar a Josefa el viernes. Cerrar tarea dossier enviado. Importe 16000',
    NOW,
  );

  assert.equal(parsed.control, null);
  assert.deepEqual(
    parsed.operations.map((operation) => operation.type),
    ['create_note', 'set_stage', 'set_amount', 'create_task', 'close_task'],
  );

  const task = parsed.operations.find((operation) => operation.type === 'create_task');
  assert.equal(task.title, 'llamar a Josefa');
  assert.equal(new Date(task.dueAt).getDay(), 5);
});

test('planOperationsFromInput resolves stage, amount, and task closure', async () => {
  const metadata = {
    stageOptions: [
      { value: 'PROPOSAL_SENT', label: 'Propuesta presentada' },
      { value: 'SIGNATURE_PENDING', label: 'Pendiente de firma' },
    ],
    nextStepFieldName: null,
  };
  const deal = {
    id: 'deal-1',
    name: 'UPCT - Piloto',
    amount: { amountMicros: null, currencyCode: 'EUR' },
    openTasks: [{ id: 'task-1', title: 'Enviar dossier UPCT', status: 'TODO' }],
  };

  const plan = await planOperationsFromInput({
    input: 'Mover a propuesta presentada. Importe 16000. Cerrar tarea dossier',
    deal,
    metadata,
    now: NOW,
  });

  assert.equal(plan.control, null);
  assert.equal(plan.warnings.length, 0);
  assert.equal(plan.operations[0].type, 'update_deal');
  assert.deepEqual(plan.operations[0].data, {
    stage: 'PROPOSAL_SENT',
    amount: { amountMicros: 16_000_000_000, currencyCode: 'EUR' },
  });
  assert.equal(plan.operations[1].type, 'close_task');
  assert.equal(plan.operations[1].taskId, 'task-1');
});

test('planOperationsFromInput stores next step as a note when no field exists', async () => {
  const plan = await planOperationsFromInput({
    input: 'siguiente paso: enviar propuesta revisada',
    deal: { id: 'deal-1', name: 'Deal', openTasks: [] },
    metadata: { stageOptions: [], nextStepFieldName: null },
    now: NOW,
  });

  assert.equal(plan.operations.length, 1);
  assert.equal(plan.operations[0].type, 'create_note');
  assert.match(plan.operations[0].markdown, /enviar propuesta revisada/);
});


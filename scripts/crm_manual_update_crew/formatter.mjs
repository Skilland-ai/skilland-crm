import {
  formatAmount,
  personName,
  truncate,
  workspaceMemberName,
} from './text-utils.mjs';

export function printDealContext({ deal, index, total, metadata }) {
  console.log('\n'.padEnd(72, '='));
  console.log(`DEAL ${index + 1}/${total} - ${deal.name}`);
  console.log(''.padEnd(72, '-'));
  console.log(`Stage: ${stageLabel(deal.stage, metadata.stageOptions)}`);
  console.log(`Importe: ${formatAmount(deal.amount)}`);
  console.log(`Empresa: ${deal.company?.name ?? '(sin empresa)'}`);
  console.log(`Contacto: ${personName(deal.pointOfContact)}`);
  console.log(`Business Line: ${deal.businessLineDisplayName}`);
  console.log(`Owner: ${workspaceMemberName(deal.owner)}`);
  console.log(`Actualizado: ${deal.updatedAt}`);

  for (const fieldName of metadata.contextFields) {
    if (deal[fieldName] !== null && deal[fieldName] !== undefined) {
      console.log(`${fieldName}: ${deal[fieldName]}`);
    }
  }

  const latestNotes = deal.notes.slice(0, 3);
  console.log('\nUltimas notas:');
  if (latestNotes.length === 0) {
    console.log('- sin notas');
  } else {
    for (const note of latestNotes) {
      const body = truncate(note.bodyV2?.markdown ?? '', 180);
      console.log(`- ${note.title ?? '(sin titulo)'}: ${body}`);
    }
  }

  console.log('\nTareas abiertas:');
  if (deal.openTasks.length === 0) {
    console.log('- sin tareas abiertas');
  } else {
    for (const task of deal.openTasks) {
      const due = task.dueAt ? `, due ${task.dueAt}` : '';
      console.log(`- ${task.title} [${task.status ?? 'sin estado'}${due}]`);
    }
  }
}

export function printOperations(operations, { apply }) {
  console.log(`\nCambios detectados (${apply ? 'APPLY' : 'DRY-RUN'}):`);
  if (operations.length === 0) {
    console.log('- sin cambios pendientes');
    return;
  }

  for (const operation of operations) {
    console.log(`- ${operationSummary(operation)}`);
  }
}

export function operationSummary(operation) {
  if (operation.type === 'update_deal') {
    return `Actualizar deal: ${JSON.stringify(operation.data)}`;
  }
  if (operation.type === 'create_note') {
    return `Crear nota "${operation.title}": ${truncate(operation.markdown, 120)}`;
  }
  if (operation.type === 'create_task') {
    const due = operation.dueAt ? ` para ${operation.dueAt}` : '';
    return `Crear tarea "${operation.title}"${due}`;
  }
  if (operation.type === 'close_task') {
    return `Cerrar tarea "${operation.title}"`;
  }
  return JSON.stringify(operation);
}

function stageLabel(value, options) {
  const option = options.find((candidate) => candidate.value === value);
  return option ? `${option.label} (${option.value})` : value;
}


import { parseReviewInput } from './parser.mjs';
import { normalizeText } from './text-utils.mjs';

export async function planOperationsFromInput({
  input,
  deal,
  metadata,
  askChoice,
  now = new Date(),
}) {
  const parsed = parseReviewInput(input, now);

  if (parsed.control) {
    return { control: parsed.control, operations: [], warnings: [] };
  }

  const operations = [];
  const warnings = [];
  const dealUpdate = {};

  for (const parsedOperation of parsed.operations) {
    if (parsedOperation.type === 'set_stage') {
      const stage = await resolveStage({
        rawStage: parsedOperation.rawStage,
        stageOptions: metadata.stageOptions,
        askChoice,
      });
      if (!stage) {
        warnings.push(`Stage not resolved: ${parsedOperation.rawStage}`);
        continue;
      }
      dealUpdate.stage = stage.value;
      continue;
    }

    if (parsedOperation.type === 'set_amount') {
      const currencyCode = deal.amount?.currencyCode ?? 'EUR';
      dealUpdate.amount = {
        amountMicros: Math.round(parsedOperation.amount * 1_000_000),
        currencyCode,
      };
      continue;
    }

    if (parsedOperation.type === 'set_next_step') {
      if (metadata.nextStepFieldName) {
        dealUpdate[metadata.nextStepFieldName] = parsedOperation.value;
      } else {
        operations.push({
          type: 'create_note',
          title: 'CRM Secretary - next step',
          markdown: `Siguiente paso: ${parsedOperation.value}`,
        });
      }
      continue;
    }

    if (parsedOperation.type === 'create_note') {
      operations.push({
        type: 'create_note',
        title: 'CRM Secretary update',
        markdown: parsedOperation.markdown,
      });
      continue;
    }

    if (parsedOperation.type === 'create_task') {
      operations.push({
        type: 'create_task',
        title: parsedOperation.title,
        markdown: `Creada desde CRM Manual Update Crew para ${deal.name}.`,
        dueAt: parsedOperation.dueAt,
      });
      continue;
    }

    if (parsedOperation.type === 'close_task') {
      const task = await resolveTask({
        rawTask: parsedOperation.rawTask,
        openTasks: deal.openTasks,
        askChoice,
      });
      if (!task) {
        warnings.push(`Open task not resolved: ${parsedOperation.rawTask}`);
        continue;
      }
      operations.push({
        type: 'close_task',
        taskId: task.id,
        title: task.title,
      });
    }
  }

  if (Object.keys(dealUpdate).length > 0) {
    operations.unshift({
      type: 'update_deal',
      opportunityId: deal.id,
      data: dealUpdate,
    });
  }

  return { control: null, operations, warnings };
}

async function resolveStage({ rawStage, stageOptions, askChoice }) {
  const matches = matchOptions(rawStage, stageOptions);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1 && askChoice) {
    return askChoice(`Stage ambiguo para "${rawStage}"`, matches, stageLabel);
  }
  if (matches.length === 0 && askChoice) {
    return askChoice(`No encuentro stage "${rawStage}". Elige stage`, stageOptions, stageLabel);
  }
  return null;
}

async function resolveTask({ rawTask, openTasks, askChoice }) {
  const needle = normalizeText(rawTask);
  const matches = openTasks.filter((task) => {
    const title = normalizeText(task.title);
    return title.includes(needle) || needle.includes(title);
  });

  if (matches.length === 1) return matches[0];
  if (matches.length > 1 && askChoice) {
    return askChoice(`Tarea ambigua para "${rawTask}"`, matches, taskLabel);
  }
  return null;
}

function matchOptions(rawValue, options) {
  const wanted = normalizeText(rawValue);
  const exact = options.filter(
    (option) =>
      normalizeText(option.value) === wanted ||
      normalizeText(option.label) === wanted,
  );
  if (exact.length > 0) return exact;

  return options.filter((option) => {
    const value = normalizeText(option.value);
    const label = normalizeText(option.label);
    return value.includes(wanted) || label.includes(wanted) || wanted.includes(label);
  });
}

function stageLabel(stage) {
  return `${stage.label} (${stage.value})`;
}

function taskLabel(task) {
  return `${task.title} [${task.status}]`;
}


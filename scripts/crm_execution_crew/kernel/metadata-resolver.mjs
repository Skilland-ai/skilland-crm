import { issue } from './contracts.mjs';

const CREATE_OPPORTUNITY_INPUT_HELPER_FIELDS = new Set([
  'companyId',
  'pointOfContactId',
]);

const OBJECT_ALIASES = new Map([
  ['opportunities', 'opportunity'],
  ['opportunity', 'opportunity'],
  ['deals', 'opportunity'],
  ['deal', 'opportunity'],
  ['people', 'person'],
  ['persons', 'person'],
  ['person', 'person'],
  ['contacts', 'person'],
  ['contact', 'person'],
  ['companies', 'company'],
  ['company', 'company'],
  ['accounts', 'company'],
  ['account', 'company'],
  ['tasks', 'task'],
  ['task', 'task'],
  ['notes', 'note'],
  ['note', 'note'],
  ['tasktargets', 'taskTarget'],
  ['tasktarget', 'taskTarget'],
  ['notetargets', 'noteTarget'],
  ['notetarget', 'noteTarget'],
]);

export function buildMetadataSnapshot(objects = []) {
  const objectsByName = new Map();

  for (const object of objects) {
    const names = [
      object.nameSingular,
      object.namePlural,
      object.labelSingular,
      object.labelPlural,
    ].filter(Boolean);

    for (const name of names) {
      objectsByName.set(normalizeName(name), object);
    }
  }

  return {
    objects,
    objectsByName,
    canonicalObjects: {
      opportunity: resolveObject(objectsByName, 'opportunity'),
      person: resolveObject(objectsByName, 'person'),
      company: resolveObject(objectsByName, 'company'),
      task: resolveObject(objectsByName, 'task'),
      note: resolveObject(objectsByName, 'note'),
      taskTarget: resolveObject(objectsByName, 'taskTarget'),
      noteTarget: resolveObject(objectsByName, 'noteTarget'),
    },
  };
}

export function resolveObject(objectsByName, name) {
  const canonical = OBJECT_ALIASES.get(normalizeName(name)) ?? name;
  return (
    objectsByName.get(normalizeName(canonical)) ??
    objectsByName.get(normalizeName(name)) ??
    null
  );
}

export function fieldsByName(object) {
  return new Map((object?.fields ?? []).map((field) => [field.name, field]));
}

export function validateRequestAgainstMetadata(request, snapshot) {
  const warnings = [];
  const blockingIssues = [];
  const unknownFields = [];
  const invalidOptions = [];
  const objectsChecked = new Set();
  const fields = {};

  for (const [canonical, object] of Object.entries(snapshot.canonicalObjects)) {
    if (!object) continue;
    objectsChecked.add(canonical);
    fields[canonical] = Object.fromEntries(
      [...fieldsByName(object).entries()].map(([name, field]) => [
        name,
        {
          name,
          type: field.type,
          options: (field.options ?? []).map((option) => ({
            value: option.value,
            label: option.label ?? option.value,
          })),
        },
      ]),
    );
  }

  for (const required of ['opportunity', 'person', 'company', 'task', 'note']) {
    if (!snapshot.canonicalObjects[required]) {
      warnings.push(`Metadata object not found: ${required}`);
    }
  }

  request.operations.forEach((operation, operationIndex) => {
    if (!['create_opportunity', 'update_opportunity'].includes(operation.type)) {
      return;
    }
    const opportunityObject = snapshot.canonicalObjects.opportunity;
    const fieldMap = fieldsByName(opportunityObject);
    const data = operation.data ?? {};

    if (operation.type === 'create_opportunity' && !hasNonEmptyString(data.name)) {
      blockingIssues.push(
        issue('missing_required_field', 'create_opportunity requires data.name.', {
          operationIndex,
          object: 'opportunity',
          fieldName: 'name',
        }),
      );
    }

    for (const [fieldName, value] of Object.entries(data)) {
      if (
        operation.type === 'create_opportunity' &&
        CREATE_OPPORTUNITY_INPUT_HELPER_FIELDS.has(fieldName)
      ) {
        continue;
      }

      const field = fieldMap.get(fieldName);
      if (!field) {
        const unknown = { operationIndex, object: 'opportunity', fieldName };
        unknownFields.push(unknown);
        blockingIssues.push(
          issue('unknown_field', `Unknown opportunity field: ${fieldName}`, unknown),
        );
        continue;
      }

      const optionIssue = validateFieldOption({
        operationIndex,
        object: 'opportunity',
        field,
        value,
      });
      if (optionIssue) {
        invalidOptions.push(optionIssue);
        blockingIssues.push(
          issue(
            'invalid_select_option',
            `Invalid option for ${fieldName}: ${JSON.stringify(value)}`,
            optionIssue,
          ),
        );
      }
    }
  });

  validateTaskStatusOption({ snapshot, invalidOptions, blockingIssues });

  return {
    objectsChecked: [...objectsChecked],
    fields,
    unknownFields,
    invalidOptions,
    warnings,
    blockingIssues,
  };
}

function validateTaskStatusOption({ snapshot, invalidOptions, blockingIssues }) {
  const taskFields = fieldsByName(snapshot.canonicalObjects.task);
  const statusField = taskFields.get('status');
  if (!statusField?.options?.length) return;
  const hasDone = statusField.options.some((option) => option.value === 'DONE');
  if (hasDone) return;

  const invalid = {
    object: 'task',
    fieldName: 'status',
    value: 'DONE',
    allowedValues: statusField.options.map((option) => option.value),
  };
  invalidOptions.push(invalid);
  blockingIssues.push(
    issue('invalid_select_option', 'Task status DONE is not available.', invalid),
  );
}

function validateFieldOption({ operationIndex, object, field, value }) {
  if (!field?.options?.length) return null;
  const allowedValues = field.options.map((option) => option.value);

  if (Array.isArray(value)) {
    const invalidValues = value.filter((item) => !allowedValues.includes(item));
    if (invalidValues.length === 0) return null;
    return {
      operationIndex,
      object,
      fieldName: field.name,
      value,
      invalidValues,
      allowedValues,
    };
  }

  if (value === null || value === undefined || allowedValues.includes(value)) {
    return null;
  }

  return {
    operationIndex,
    object,
    fieldName: field.name,
    value,
    allowedValues,
  };
}

function normalizeName(value) {
  return String(value ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

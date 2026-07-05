import { issue } from './contracts.mjs';

const CREATE_OPPORTUNITY_INPUT_HELPER_FIELDS = new Set([
  'companyId',
  'companyTempId',
  'pointOfContactId',
  'pointOfContactTempId',
]);

const COMPANY_INPUT_HELPER_FIELDS = new Set();

const PERSON_INPUT_HELPER_FIELDS = new Set([
  'companyId',
  'companyTempId',
]);

const UPDATE_TASK_INPUT_HELPER_FIELDS = new Set(['assigneeId']);

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
    if (['create_company', 'update_company', 'upsert_company'].includes(operation.type)) {
      validateOperationData({
        operation,
        operationIndex,
        objectName: 'company',
        object: snapshot.canonicalObjects.company,
        helperFields: COMPANY_INPUT_HELPER_FIELDS,
        requiredFieldName: null,
        unknownFields,
        invalidOptions,
        blockingIssues,
      });
      return;
    }

    if (['create_person', 'update_person', 'upsert_person'].includes(operation.type)) {
      validateOperationData({
        operation,
        operationIndex,
        objectName: 'person',
        object: snapshot.canonicalObjects.person,
        helperFields: PERSON_INPUT_HELPER_FIELDS,
        requiredFieldName: null,
        unknownFields,
        invalidOptions,
        blockingIssues,
      });
      return;
    }

    if (operation.type === 'upsert_account_contact_opportunity') {
      validateOperationData({
        operation,
        operationIndex,
        objectName: 'company',
        object: snapshot.canonicalObjects.company,
        helperFields: COMPANY_INPUT_HELPER_FIELDS,
        requiredFieldName: null,
        dataOverride: operation.company?.data,
        operationType: `${operation.type}.company`,
        unknownFields,
        invalidOptions,
        blockingIssues,
      });
      validateOperationData({
        operation,
        operationIndex,
        objectName: 'person',
        object: snapshot.canonicalObjects.person,
        helperFields: PERSON_INPUT_HELPER_FIELDS,
        requiredFieldName: null,
        dataOverride: operation.person?.data,
        operationType: `${operation.type}.person`,
        unknownFields,
        invalidOptions,
        blockingIssues,
      });
      validateOperationData({
        operation,
        operationIndex,
        objectName: 'opportunity',
        object: snapshot.canonicalObjects.opportunity,
        helperFields: CREATE_OPPORTUNITY_INPUT_HELPER_FIELDS,
        requiredFieldName: null,
        dataOverride: operation.opportunity?.data,
        operationType: `${operation.type}.opportunity`,
        unknownFields,
        invalidOptions,
        blockingIssues,
      });
      return;
    }

    if (['create_opportunity', 'update_opportunity'].includes(operation.type)) {
      validateOperationData({
        operation,
        operationIndex,
        objectName: 'opportunity',
        object: snapshot.canonicalObjects.opportunity,
        helperFields:
          operation.type === 'create_opportunity'
            ? CREATE_OPPORTUNITY_INPUT_HELPER_FIELDS
            : new Set(),
        requiredFieldName:
          operation.type === 'create_opportunity' ? 'name' : null,
        unknownFields,
        invalidOptions,
        blockingIssues,
      });
      return;
    }

    if (operation.type === 'update_task') {
      validateOperationData({
        operation,
        operationIndex,
        objectName: 'task',
        object: snapshot.canonicalObjects.task,
        helperFields: UPDATE_TASK_INPUT_HELPER_FIELDS,
        requiredFieldName: null,
        unknownFields,
        invalidOptions,
        blockingIssues,
      });
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

function validateOperationData({
  operation,
  operationIndex,
  objectName,
  object,
  helperFields,
  requiredFieldName,
  dataOverride,
  operationType,
  unknownFields,
  invalidOptions,
  blockingIssues,
}) {
  const fieldMap = fieldsByName(object);
  const data = dataOverride ?? operation.data ?? {};
  const type = operationType ?? operation.type;

  if (requiredFieldName && !hasNonEmptyString(data[requiredFieldName])) {
    blockingIssues.push(
      issue(
        'missing_required_field',
        `${type} requires data.${requiredFieldName}.`,
        {
          operationIndex,
          object: objectName,
          fieldName: requiredFieldName,
        },
      ),
    );
  }

  for (const [fieldName, value] of Object.entries(data)) {
    if (helperFields.has(fieldName)) continue;

    const field = fieldMap.get(fieldName);
    if (!field) {
      const unknown = { operationIndex, object: objectName, fieldName };
      unknownFields.push(unknown);
      blockingIssues.push(
        issue('unknown_field', `Unknown ${objectName} field: ${fieldName}`, unknown),
      );
      continue;
    }

    const optionIssue = validateFieldOption({
      operationIndex,
      object: objectName,
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

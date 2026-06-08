const OPPORTUNITY_CONTEXT_FIELD_CANDIDATES = [
  'businessLineName',
  'campaignName',
  'outreachStatus',
  'iaMujeresFunnelStage',
  'followUpDueAt',
  'lastEmailSentAt',
  'lastReplyAt',
  'meetingStatus',
  'meetingDate',
  'commercialStatus',
  'estadoComercial',
];

const NEXT_STEP_FIELD_CANDIDATES = [
  'nextStep',
  'nextSteps',
  'nextAction',
  'nextActionAt',
  'proximoPaso',
  'commercialNextStep',
  'followUpNextStep',
];

function objectByName(objects, nameSingular) {
  return objects.find((object) => object.nameSingular === nameSingular);
}

function fieldByName(object) {
  return new Map((object?.fields ?? []).map((field) => [field.name, field]));
}

function selectOptions(field) {
  return (field?.options ?? [])
    .map((option) => ({
      value: option.value,
      label: option.label ?? option.value,
      position: option.position ?? 0,
      color: option.color ?? null,
    }))
    .sort((a, b) => a.position - b.position);
}

export async function fetchCrmMetadata(client) {
  const objects = await client.metadataObjects();
  const opportunityObject = objectByName(objects, 'opportunity');
  const taskObject = objectByName(objects, 'task');

  if (!opportunityObject) {
    throw new Error('Opportunity metadata not found.');
  }
  if (!taskObject) {
    throw new Error('Task metadata not found.');
  }

  const opportunityFields = fieldByName(opportunityObject);
  const taskFields = fieldByName(taskObject);
  const contextFields = OPPORTUNITY_CONTEXT_FIELD_CANDIDATES.filter((name) =>
    opportunityFields.has(name),
  );
  const nextStepFieldName = NEXT_STEP_FIELD_CANDIDATES.find((name) =>
    opportunityFields.has(name),
  );

  return {
    objects,
    opportunityObject,
    taskObject,
    opportunityFields,
    taskFields,
    stageOptions: selectOptions(opportunityFields.get('stage')),
    taskStatusOptions: selectOptions(taskFields.get('status')),
    contextFields,
    nextStepFieldName,
    hasBusinessLineRelation: opportunityFields.has('businessLine'),
    hasOwnerRelation: opportunityFields.has('owner'),
  };
}


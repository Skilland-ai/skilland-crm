import { issue } from './contracts.mjs';

export async function fetchRecordIndex(client) {
  const data = await client.gql(`
    query CrmExecutionRecordIndex {
      opportunities(first: 500) {
        edges {
          node {
            id
            name
            company {
              id
              name
              domainName { primaryLinkUrl }
            }
            pointOfContact {
              id
              name { firstName lastName }
              emails { primaryEmail additionalEmails }
            }
          }
        }
      }
      people(first: 500) {
        edges {
          node {
            id
            name { firstName lastName }
            emails { primaryEmail additionalEmails }
            company {
              id
              name
              domainName { primaryLinkUrl }
            }
          }
        }
      }
      companies(first: 500) {
        edges {
          node {
            id
            name
            domainName { primaryLinkUrl }
          }
        }
      }
      tasks(first: 500) {
        edges {
          node {
            id
            title
            status
            dueAt
            taskTargets {
              edges {
                node {
                  targetOpportunity { id name }
                  targetPerson { id }
                  targetCompany { id }
                }
              }
            }
          }
        }
      }
    }
  `);

  return {
    opportunities: edgesToNodes(data.opportunities),
    people: edgesToNodes(data.people),
    companies: edgesToNodes(data.companies),
    tasks: edgesToNodes(data.tasks),
  };
}

export function resolveRequestRecords({ request, recordIndex }) {
  const operationResolutions = [];
  const ambiguousLookups = [];
  const missingRecords = [];
  const warnings = [];

  request.operations.forEach((operation, operationIndex) => {
    const resolution = resolveOperation({
      operation,
      operationIndex,
      recordIndex,
    });
    operationResolutions.push(resolution);
    ambiguousLookups.push(...resolution.ambiguousLookups);
    missingRecords.push(...resolution.missingRecords);
    warnings.push(...resolution.warnings);
  });

  return {
    operationResolutions,
    ambiguousLookups,
    missingRecords,
    warnings,
    blockingIssues: [
      ...ambiguousLookups.map((item) =>
        issue('ambiguous_lookup', item.message, item),
      ),
      ...missingRecords.map((item) => issue('missing_record', item.message, item)),
    ],
  };
}

function resolveOperation({ operation, operationIndex, recordIndex }) {
  const lookup = operation.lookup ?? {};
  const missingRecords = [];
  const ambiguousLookups = [];
  const warnings = [];
  const resolvedRecords = {
    opportunity: null,
    person: null,
    company: null,
    task: null,
  };

  if (lookup.opportunityId) {
    resolvedRecords.opportunity = findById(
      recordIndex.opportunities,
      lookup.opportunityId,
    );
    if (!resolvedRecords.opportunity) {
      missingRecords.push(missing(operationIndex, 'opportunityId', lookup.opportunityId));
    }
  }

  if (lookup.personId) {
    resolvedRecords.person = findById(recordIndex.people, lookup.personId);
    if (!resolvedRecords.person) {
      missingRecords.push(missing(operationIndex, 'personId', lookup.personId));
    }
  }

  if (lookup.companyId) {
    resolvedRecords.company = findById(recordIndex.companies, lookup.companyId);
    if (!resolvedRecords.company) {
      missingRecords.push(missing(operationIndex, 'companyId', lookup.companyId));
    }
  }

  if (lookup.taskId) {
    resolvedRecords.task = findById(recordIndex.tasks, lookup.taskId);
    if (!resolvedRecords.task) {
      missingRecords.push(missing(operationIndex, 'taskId', lookup.taskId));
    }
  }

  if (!resolvedRecords.person && lookup.personEmail) {
    const people = recordIndex.people.filter((person) =>
      emailsOf(person).includes(normalizeEmail(lookup.personEmail)),
    );
    assignUnique({
      operationIndex,
      field: 'personEmail',
      value: lookup.personEmail,
      matches: people,
      object: 'person',
      resolvedRecords,
      ambiguousLookups,
      missingRecords,
    });
  }

  if (!resolvedRecords.company && lookup.companyDomain) {
    const companies = recordIndex.companies.filter(
      (company) =>
        normalizeDomain(company.domainName?.primaryLinkUrl) ===
        normalizeDomain(lookup.companyDomain),
    );
    assignUnique({
      operationIndex,
      field: 'companyDomain',
      value: lookup.companyDomain,
      matches: companies,
      object: 'company',
      resolvedRecords,
      ambiguousLookups,
      missingRecords,
    });
  }

  if (!resolvedRecords.opportunity && operation.type === 'update_opportunity') {
    const candidateOpportunities = opportunitiesForLookup({
      recordIndex,
      person: resolvedRecords.person,
      company: resolvedRecords.company,
    });
    assignUnique({
      operationIndex,
      field: 'lookup',
      value: lookup,
      matches: candidateOpportunities,
      object: 'opportunity',
      resolvedRecords,
      ambiguousLookups,
      missingRecords,
    });
  }

  if (operation.type === 'close_task' && !resolvedRecords.task && lookup.taskTitle) {
    const tasks = tasksForLookup({
      recordIndex,
      title: lookup.taskTitle,
      opportunity: resolvedRecords.opportunity,
      person: resolvedRecords.person,
      company: resolvedRecords.company,
    });
    assignUnique({
      operationIndex,
      field: 'taskTitle',
      value: lookup.taskTitle,
      matches: tasks,
      object: 'task',
      resolvedRecords,
      ambiguousLookups,
      missingRecords,
    });
  }

  hydrateTargetsFromOpportunity(resolvedRecords);

  return {
    operationIndex,
    lookup,
    resolvedRecords,
    targetIds: targetIds(resolvedRecords),
    ambiguousLookups,
    missingRecords,
    warnings,
  };
}

function assignUnique({
  operationIndex,
  field,
  value,
  matches,
  object,
  resolvedRecords,
  ambiguousLookups,
  missingRecords,
}) {
  if (matches.length === 1) {
    resolvedRecords[object] = matches[0];
    return;
  }

  const payload = {
    operationIndex,
    field,
    value,
    object,
    matchCount: matches.length,
    matchIds: matches.map((match) => match.id),
  };

  if (matches.length === 0) {
    missingRecords.push({
      ...payload,
      message: `No ${object} matched ${field}.`,
    });
    return;
  }

  ambiguousLookups.push({
    ...payload,
    message: `Multiple ${object} records matched ${field}.`,
  });
}

function opportunitiesForLookup({ recordIndex, person, company }) {
  let opportunities = recordIndex.opportunities;
  if (person) {
    opportunities = opportunities.filter(
      (opportunity) => opportunity.pointOfContact?.id === person.id,
    );
  }
  if (company) {
    opportunities = opportunities.filter(
      (opportunity) => opportunity.company?.id === company.id,
    );
  }
  return opportunities;
}

function tasksForLookup({ recordIndex, title, opportunity, person, company }) {
  const wanted = normalizeText(title);
  return recordIndex.tasks.filter((task) => {
    if (task.status === 'DONE') return false;
    const taskTitle = normalizeText(task.title);
    if (!taskTitle.includes(wanted) && !wanted.includes(taskTitle)) return false;
    const targets = taskTargets(task);
    if (opportunity && !targets.opportunityIds.includes(opportunity.id)) return false;
    if (person && !targets.personIds.includes(person.id)) return false;
    if (company && !targets.companyIds.includes(company.id)) return false;
    return true;
  });
}

function hydrateTargetsFromOpportunity(resolvedRecords) {
  if (!resolvedRecords.opportunity) return;
  if (!resolvedRecords.person) {
    resolvedRecords.person = resolvedRecords.opportunity.pointOfContact ?? null;
  }
  if (!resolvedRecords.company) {
    resolvedRecords.company = resolvedRecords.opportunity.company ?? null;
  }
}

function targetIds(resolvedRecords) {
  return {
    opportunityId: resolvedRecords.opportunity?.id,
    personId: resolvedRecords.person?.id,
    companyId: resolvedRecords.company?.id,
  };
}

function missing(operationIndex, field, value) {
  return {
    operationIndex,
    field,
    value,
    message: `No record found for ${field}=${value}.`,
  };
}

function taskTargets(task) {
  const nodes = (task.taskTargets?.edges ?? []).map((edge) => edge.node).filter(Boolean);
  return {
    opportunityIds: nodes.map((node) => node.targetOpportunity?.id).filter(Boolean),
    personIds: nodes.map((node) => node.targetPerson?.id).filter(Boolean),
    companyIds: nodes.map((node) => node.targetCompany?.id).filter(Boolean),
  };
}

function edgesToNodes(connection) {
  return (connection?.edges ?? []).map((edge) => edge.node).filter(Boolean);
}

function findById(records, id) {
  return records.find((record) => record.id === id) ?? null;
}

function emailsOf(person) {
  return [
    person.emails?.primaryEmail,
    ...(person.emails?.additionalEmails ?? []),
  ]
    .filter(Boolean)
    .map(normalizeEmail);
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeDomain(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}


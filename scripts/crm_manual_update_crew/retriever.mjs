import { personName } from './text-utils.mjs';

function optionalScalarFields(fieldNames) {
  return fieldNames.map((fieldName) => `            ${fieldName}`).join('\n');
}

function businessLineSelection(metadata) {
  return metadata.hasBusinessLineRelation
    ? `
            businessLine {
              id
              name
            }`
    : '';
}

function ownerSelection(metadata) {
  return metadata.hasOwnerRelation
    ? `
            owner {
              id
              userEmail
              name {
                firstName
                lastName
              }
            }`
    : '';
}

export async function fetchBusinessLines(client) {
  const data = await client.gql(`
    query CrmManualBusinessLines {
      businessLines(first: 200) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `);

  return data.businessLines.edges.map(({ node }) => node);
}

export async function fetchOpportunities(client, metadata) {
  const extraFields = optionalScalarFields(metadata.contextFields);

  const data = await client.gql(`
    query CrmManualOpportunities {
      opportunities(first: 500) {
        edges {
          node {
            id
            name
            stage
            amount {
              amountMicros
              currencyCode
            }
            closeDate
            createdAt
            updatedAt
${extraFields}
${businessLineSelection(metadata)}
${ownerSelection(metadata)}
            company {
              id
              name
              domainName {
                primaryLinkUrl
              }
            }
            pointOfContact {
              id
              name {
                firstName
                lastName
              }
              emails {
                primaryEmail
                additionalEmails
              }
            }
            noteTargets {
              edges {
                node {
                  id
                  note {
                    id
                    title
                    bodyV2 {
                      markdown
                    }
                    createdAt
                    updatedAt
                  }
                }
              }
            }
            taskTargets {
              edges {
                node {
                  id
                  task {
                    id
                    title
                    status
                    dueAt
                    bodyV2 {
                      markdown
                    }
                    createdAt
                    updatedAt
                    assignee {
                      id
                      userEmail
                      name {
                        firstName
                        lastName
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `);

  return data.opportunities.edges.map(({ node }) => normalizeOpportunity(node));
}

function normalizeOpportunity(opportunity) {
  const notes = (opportunity.noteTargets?.edges ?? [])
    .map((edge) => edge.node?.note)
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const tasks = (opportunity.taskTargets?.edges ?? [])
    .map((edge) => edge.node?.task)
    .filter(Boolean)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  return {
    ...opportunity,
    notes,
    tasks,
    openTasks: tasks.filter((task) => task.status !== 'DONE'),
    contactDisplayName: personName(opportunity.pointOfContact),
    businessLineDisplayName:
      opportunity.businessLine?.name ??
      opportunity.businessLineName ??
      '(sin business line)',
  };
}

export function filterOpportunities(opportunities, filters) {
  return opportunities.filter((opportunity) => {
    if (filters.businessLine) {
      const wanted = filters.businessLine.toLowerCase();
      const relationName = opportunity.businessLine?.name?.toLowerCase();
      const textName = opportunity.businessLineName?.toLowerCase();
      if (relationName !== wanted && textName !== wanted) return false;
    }

    if (filters.stage && opportunity.stage !== filters.stage) return false;

    return true;
  });
}


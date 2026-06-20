import { agentArtifact, issue } from './contracts.mjs';

const OPPORTUNITY_FIELDS = `
  id
  name
  stage
  closeDate
  createdAt
  updatedAt
  amount {
    amountMicros
    currencyCode
  }
  company {
    id
    name
    emailMain
    phoneMain
    address {
      addressStreet1
      addressStreet2
      addressCity
      addressState
      addressPostcode
      addressCountry
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
`;

export async function resolveCrmContext({ client, dealLookup, interviewer = null }) {
  const warnings = [];
  const blockingIssues = [];
  const candidates = await lookupOpportunities(client, dealLookup);

  if (candidates.length === 0) {
    blockingIssues.push(
      issue(
        'deal_not_found',
        'No matching Twenty opportunity was found for the provided lookup.',
        { dealLookup },
      ),
    );
    return agentArtifact({
      agent: 'crm_context_agent',
      status: 'blocked',
      warnings,
      blockingIssues,
      candidates: [],
      crmSnapshot: null,
    });
  }

  let selected = candidates[0];
  if (candidates.length > 1) {
    if (interviewer?.choose) {
      selected = await interviewer.choose(
        'Hay varios deals coincidentes. Elige uno:',
        candidates,
        (candidate) =>
          `${candidate.name} · ${candidate.company?.name ?? 'sin empresa'} · ${candidate.id}`,
      );
      warnings.push(`Resolved ${candidates.length} candidate deals by interactive choice.`);
    } else {
      blockingIssues.push(
        issue(
          'ambiguous_deal_lookup',
          'The deal lookup matched multiple opportunities and no interactive choice is available.',
          {
            candidates: candidates.map((candidate) => ({
              id: candidate.id,
              name: candidate.name,
            })),
          },
        ),
      );
      return agentArtifact({
        agent: 'crm_context_agent',
        status: 'blocked',
        warnings,
        blockingIssues,
        candidates: candidates.map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
        })),
        crmSnapshot: null,
      });
    }
  }

  return agentArtifact({
    agent: 'crm_context_agent',
    status: 'completed',
    warnings,
    blockingIssues,
    candidates: candidates.map((candidate) => ({ id: candidate.id, name: candidate.name })),
    crmSnapshot: buildCrmSnapshot(selected),
  });
}

async function lookupOpportunities(client, dealLookup) {
  const opportunityId =
    dealLookup?.opportunityId ??
    extractOpportunityId(dealLookup?.opportunityUrl) ??
    extractOpportunityId(dealLookup?.search);

  if (opportunityId) {
    const data = await client.gql(
      `query CrmAikountOpportunityById {
        opportunities(first: 2, filter: { id: { eq: "${opportunityId}" } }) {
          edges { node { ${OPPORTUNITY_FIELDS} } }
        }
      }`,
    );
    return edgesToNodes(data.opportunities);
  }

  const search = dealLookup?.search?.trim();
  if (!search) {
    return [];
  }

  const data = await client.gql(
    `query CrmAikountOpportunitySearch($search: String!) {
      opportunities(first: 10, filter: { name: { ilike: $search } }) {
        edges { node { ${OPPORTUNITY_FIELDS} } }
      }
    }`,
    { search: `%${search}%` },
  );

  return edgesToNodes(data.opportunities);
}

function edgesToNodes(connection) {
  return (connection?.edges ?? []).map((edge) => edge.node).filter(Boolean);
}

function extractOpportunityId(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const match = value.match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  );
  return match?.[0] ?? null;
}

function buildCrmSnapshot(opportunity) {
  const amountMicros = opportunity.amount?.amountMicros ?? null;
  const primaryEmail = opportunity.pointOfContact?.emails?.primaryEmail ?? null;
  const additionalEmails = opportunity.pointOfContact?.emails?.additionalEmails ?? [];
  const fullName = [
    opportunity.pointOfContact?.name?.firstName,
    opportunity.pointOfContact?.name?.lastName,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    opportunityId: opportunity.id,
    name: opportunity.name,
    stage: opportunity.stage ?? null,
    closeDate: opportunity.closeDate ?? null,
    createdAt: opportunity.createdAt ?? null,
    updatedAt: opportunity.updatedAt ?? null,
    amountMicros,
    amountValue:
      typeof amountMicros === 'number' ? Number((amountMicros / 1_000_000).toFixed(2)) : null,
    currencyCode: opportunity.amount?.currencyCode ?? 'EUR',
    company: opportunity.company
      ? {
          id: opportunity.company.id,
          name: opportunity.company.name,
          email: opportunity.company.emailMain ?? null,
          phone: opportunity.company.phoneMain ?? null,
          address: {
            street1: opportunity.company.address?.addressStreet1 ?? null,
            street2: opportunity.company.address?.addressStreet2 ?? null,
            city: opportunity.company.address?.addressCity ?? null,
            state: opportunity.company.address?.addressState ?? null,
            postalCode: opportunity.company.address?.addressPostcode ?? null,
            country: opportunity.company.address?.addressCountry ?? null,
          },
        }
      : null,
    pointOfContact: opportunity.pointOfContact
      ? {
          id: opportunity.pointOfContact.id,
          fullName: fullName || null,
          primaryEmail,
          additionalEmails,
        }
      : null,
  };
}

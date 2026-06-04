#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT_DIR = process.cwd();
const DEFAULT_SOURCE_DIR =
  '/home/reboot/Escritorio/agentic-scrapping-Experiment-scrappling/04_outputs/skilland_ia_mujeres/data_prep';
const DEFAULT_OUTPUT_DIR = path.join(
  ROOT_DIR,
  '04_outputs',
  'ia_mujeres_crm_import',
);
const DEFAULT_SPEC_PATH = path.join(
  ROOT_DIR,
  '03_specs',
  'now',
  '002_ia_mujeres_crm_import.md',
);
const BUSINESS_LINE_NAME = 'SkilLand IA Mujeres';
const CAMPAIGN_NAME = 'IA Mujeres 2026';
const OPPORTUNITY_STAGE = 'POSSIBLE_OPPORTUNITY';
const OUTREACH_STATUS = 'pending_first_email';

const FIELD_DEFS = {
  company: [
    ['businessLineName', 'Business Line Name', 'TEXT'],
    ['campaignName', 'Campaign Name', 'TEXT'],
    ['organizationType', 'Organization Type', 'TEXT'],
    ['departmentArea', 'Department Area', 'TEXT'],
    ['island', 'Island', 'TEXT'],
    ['municipality', 'Municipality', 'TEXT'],
    ['emailMain', 'Email Main', 'TEXT'],
    ['phoneMain', 'Phone Main', 'TEXT'],
    ['sourceType', 'Source Type', 'TEXT'],
    ['sourceUrl', 'Source URL', 'TEXT'],
    ['sourceFile', 'Source File', 'TEXT'],
    ['icpSegment', 'ICP Segment', 'TEXT'],
    ['qualityFlags', 'Quality Flags', 'TEXT'],
    ['highConfidence', 'High Confidence', 'BOOLEAN'],
    ['genericEmail', 'Generic Email', 'BOOLEAN'],
    ['needsManualReview', 'Needs Manual Review', 'BOOLEAN'],
    ['duplicatePossible', 'Duplicate Possible', 'BOOLEAN'],
  ],
  person: [
    ['businessLineName', 'Business Line Name', 'TEXT'],
    ['campaignName', 'Campaign Name', 'TEXT'],
    ['organizationType', 'Organization Type', 'TEXT'],
    ['departmentArea', 'Department Area', 'TEXT'],
    ['island', 'Island', 'TEXT'],
    ['municipality', 'Municipality', 'TEXT'],
    ['sourceType', 'Source Type', 'TEXT'],
    ['sourceUrl', 'Source URL', 'TEXT'],
    ['sourceFile', 'Source File', 'TEXT'],
    ['icpSegment', 'ICP Segment', 'TEXT'],
    ['qualityFlags', 'Quality Flags', 'TEXT'],
    ['highConfidence', 'High Confidence', 'BOOLEAN'],
    ['genericEmail', 'Generic Email', 'BOOLEAN'],
    ['needsManualReview', 'Needs Manual Review', 'BOOLEAN'],
    ['duplicatePossible', 'Duplicate Possible', 'BOOLEAN'],
    ['emailType', 'Email Type', 'TEXT'],
  ],
  opportunity: [
    ['businessLineName', 'Business Line Name', 'TEXT'],
    ['campaignName', 'Campaign Name', 'TEXT'],
    ['organizationType', 'Organization Type', 'TEXT'],
    ['departmentArea', 'Department Area', 'TEXT'],
    ['island', 'Island', 'TEXT'],
    ['municipality', 'Municipality', 'TEXT'],
    ['sourceType', 'Source Type', 'TEXT'],
    ['sourceUrl', 'Source URL', 'TEXT'],
    ['sourceFile', 'Source File', 'TEXT'],
    ['icpSegment', 'ICP Segment', 'TEXT'],
    ['qualityFlags', 'Quality Flags', 'TEXT'],
    ['highConfidence', 'High Confidence', 'BOOLEAN'],
    ['genericEmail', 'Generic Email', 'BOOLEAN'],
    ['needsManualReview', 'Needs Manual Review', 'BOOLEAN'],
    ['duplicatePossible', 'Duplicate Possible', 'BOOLEAN'],
    ['outreachStatus', 'Outreach Status', 'TEXT'],
  ],
};

const OPPORTUNITY_VIEW_DEFS = [
  {
    name: 'IA Mujeres — Todos',
    filters: [],
  },
  {
    name: 'IA Mujeres — Cabildos',
    filters: [['organizationType', 'IS', 'cabildo']],
  },
  {
    name: 'IA Mujeres — Ayuntamientos',
    filters: [['organizationType', 'IS', 'ayuntamiento']],
  },
  {
    name: 'IA Mujeres — Alta prioridad',
    filters: [
      ['highConfidence', 'IS', true],
      ['needsManualReview', 'IS', false],
    ],
  },
  {
    name: 'IA Mujeres — Revisión manual',
    filters: [['needsManualReview', 'IS', true]],
  },
  {
    name: 'IA Mujeres — Pendiente primer email',
    filters: [['outreachStatus', 'IS', OUTREACH_STATUS]],
  },
];

const OPPORTUNITY_VIEW_FIELDS = [
  ['name', 320],
  ['company', 260],
  ['pointOfContact', 260],
  ['stage', 180],
  ['organizationType', 180],
  ['departmentArea', 220],
  ['highConfidence', 160],
  ['needsManualReview', 180],
  ['outreachStatus', 180],
];

function parseArgs(argv) {
  const args = {
    apply: false,
    createViews: true,
    sourceDir: DEFAULT_SOURCE_DIR,
    outputDir: DEFAULT_OUTPUT_DIR,
    specPath: DEFAULT_SPEC_PATH,
  };

  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--skip-views') args.createViews = false;
    else if (arg.startsWith('--source-dir=')) {
      args.sourceDir = arg.slice('--source-dir='.length);
    } else if (arg.startsWith('--output-dir=')) {
      args.outputDir = path.resolve(arg.slice('--output-dir='.length));
    } else if (arg.startsWith('--spec-path=')) {
      args.specPath = path.resolve(arg.slice('--spec-path='.length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readCredentials() {
  const raw = fs.readFileSync('/home/reboot/.claude.json', 'utf8');
  const keyMatch = raw.match(/"TWENTY_API_KEY"\s*:\s*"([^"]+)"/);
  const baseMatch = raw.match(/"TWENTY_BASE_URL"\s*:\s*"([^"]+)"/);

  if (!keyMatch || !baseMatch) {
    throw new Error(
      'Unable to resolve TWENTY_API_KEY / TWENTY_BASE_URL from /home/reboot/.claude.json',
    );
  }

  return {
    apiKey: keyMatch[1],
    baseUrl: baseMatch[1].replace(/\/+$/, ''),
  };
}

function normalizeString(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/https?:\/\//g, '')
    .replace(/^www\./, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  return String(value ?? '')
    .trim()
    .toLowerCase() === 'true';
}

function splitFlags(value) {
  return String(value ?? '')
    .split(';')
    .map((flag) => flag.trim())
    .filter(Boolean);
}

function unique(values) {
  return Array.from(new Set(values));
}

function joinFlags(...lists) {
  return unique(lists.flatMap((entry) => splitFlags(entry))).join(';');
}

function domainFromUrl(value) {
  if (!value) return '';
  let candidate = String(value).trim();

  if (!candidate) return '';
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  try {
    return new URL(candidate).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return normalizeString(value);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function companyWebsiteInput(url) {
  if (!url) return undefined;

  return {
    primaryLinkLabel: 'Website',
    primaryLinkUrl: url,
    secondaryLinks: [],
  };
}

function personNameInput(fullName) {
  const trimmed = String(fullName ?? '').trim();

  return {
    firstName: trimmed || 'Unknown',
    lastName: '',
  };
}

function phonesInput(phone) {
  const trimmed = String(phone ?? '').trim();

  if (!trimmed) return undefined;

  return {
    primaryPhoneNumber: trimmed,
    additionalPhones: [],
  };
}

function emailsInput(email) {
  const trimmed = String(email ?? '').trim();

  if (!trimmed) return undefined;

  return {
    primaryEmail: trimmed,
    additionalEmails: [],
  };
}

function chunk(array, size) {
  const chunks = [];
  for (let index = 0; index < array.length; index += size) {
    chunks.push(array.slice(index, index + size));
  }
  return chunks;
}

class TwentyClient {
  constructor({ baseUrl, apiKey }) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async requestJson(url, init = {}) {
    const response = await fetch(url, {
      ...init,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    let parsed = {};

    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error(`Failed to parse JSON from ${url}: ${text}`);
      }
    }

    if (!response.ok) {
      throw new Error(
        `Request failed ${response.status} ${response.statusText}: ${JSON.stringify(parsed)}`,
      );
    }

    return parsed;
  }

  async gqlData(query, variables = {}) {
    const parsed = await this.requestJson(`${this.baseUrl}/graphql`, {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    });

    if (parsed.errors?.length) {
      throw new Error(JSON.stringify(parsed.errors));
    }

    return parsed.data;
  }

  async gqlMetadata(query, variables = {}) {
    const parsed = await this.requestJson(`${this.baseUrl}/metadata`, {
      method: 'POST',
      body: JSON.stringify({ query, variables }),
    });

    if (parsed.errors?.length) {
      throw new Error(JSON.stringify(parsed.errors));
    }

    return parsed.data;
  }

  async restMetadata(endpoint, init = {}) {
    return this.requestJson(`${this.baseUrl}/rest/metadata${endpoint}`, init);
  }
}

async function fetchMetadataObjects(client) {
  const response = await client.restMetadata('/objects', { method: 'GET' });
  return response.data.objects;
}

async function fetchExistingWorkspaceData(client) {
  const data = await client.gqlData(`
    query ExistingWorkspaceData {
      companies(first: 250) {
        edges {
          node {
            id
            name
            domainName {
              primaryLinkUrl
            }
            opportunities(first: 1) {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      }
      people(first: 500) {
        edges {
          node {
            id
            emails {
              primaryEmail
              additionalEmails
            }
            company {
              id
              name
            }
          }
        }
      }
      opportunities(first: 500) {
        edges {
          node {
            id
            name
          }
        }
      }
      businessLines(first: 100) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `);

  return {
    companies: data.companies.edges.map(({ node }) => node),
    people: data.people.edges.map(({ node }) => node),
    opportunities: data.opportunities.edges.map(({ node }) => node),
    businessLines: data.businessLines.edges.map(({ node }) => node),
  };
}

async function ensureBusinessLine(client, workspaceData, apply, report) {
  const existing = workspaceData.businessLines.find(
    (item) => item.name === BUSINESS_LINE_NAME,
  );

  if (existing) {
    report.businessLine = {
      status: 'reused',
      id: existing.id,
      name: existing.name,
    };
    return existing.id;
  }

  if (!apply) {
    report.businessLine = {
      status: 'planned_create',
      name: BUSINESS_LINE_NAME,
    };
    return null;
  }

  const data = await client.gqlData(
    `
      mutation CreateBusinessLine($data: BusinessLineCreateInput!) {
        createBusinessLine(data: $data) {
          id
          name
        }
      }
    `,
    {
      data: {
        name: BUSINESS_LINE_NAME,
      },
    },
  );

  report.businessLine = {
    status: 'created',
    id: data.createBusinessLine.id,
    name: data.createBusinessLine.name,
  };

  return data.createBusinessLine.id;
}

function buildSourceIndex(orgs, contacts) {
  const orgByName = new Map(orgs.map((org) => [org.organization_name, org]));
  const contactsByOrg = new Map();

  for (const contact of contacts) {
    const list = contactsByOrg.get(contact.organization_name) ?? [];
    list.push(contact);
    contactsByOrg.set(contact.organization_name, list);
  }

  return { orgByName, contactsByOrg };
}

function deriveCompanyFlags(org, contacts) {
  const orgFlags = splitFlags(org.quality_flags);
  const highConfidence = contacts.some((contact) => toBool(contact.high_confidence));
  const genericEmail =
    orgFlags.some((flag) => flag.startsWith('generic_')) ||
    contacts.some((contact) => toBool(contact.generic_email));
  const contactFlags = unique(contacts.flatMap((contact) => splitFlags(contact.quality_flags)));

  return {
    highConfidence,
    genericEmail,
    qualityFlags: unique([...orgFlags, ...contactFlags]).join(';'),
  };
}

function rankContact(contact) {
  const highConfidence = toBool(contact.high_confidence) ? 100 : 0;
  const noReview = toBool(contact.needs_manual_review) ? 0 : 40;
  const named = String(contact.contact_name ?? '').trim().toLowerCase() === 'unknown' ? 0 : 20;
  const personal = contact.email_type === 'personal' ? 15 : 0;
  const nonGeneric = toBool(contact.generic_email) ? 0 : 10;
  return highConfidence + noReview + named + personal + nonGeneric;
}

function chooseBestContact(contacts) {
  if (!contacts.length) return null;

  return contacts
    .slice()
    .sort((left, right) => rankContact(right) - rankContact(left))[0];
}

function buildOpportunityPlans(orgs, contactsByOrg) {
  const plans = [];

  for (const org of orgs) {
    const contacts = contactsByOrg.get(org.organization_name) ?? [];

    if (org.organization_type === 'cabildo') {
      const areas = unique(
        contacts
          .map((contact) => String(contact.department_area ?? '').trim())
          .filter(Boolean),
      );

      if (areas.length > 1) {
        for (const area of areas) {
          plans.push({
            organizationName: org.organization_name,
            organizationType: org.organization_type,
            departmentArea: area,
            splitByArea: true,
          });
        }
        continue;
      }
    }

    plans.push({
      organizationName: org.organization_name,
      organizationType: org.organization_type,
      departmentArea: org.department_area,
      splitByArea: false,
    });
  }

  return plans;
}

function computeAudit(orgs, contacts, workspaceData, contactsByOrg) {
  const companiesByNormName = new Map(
    workspaceData.companies.map((company) => [normalizeString(company.name), company]),
  );
  const companiesByDomain = new Map();

  for (const company of workspaceData.companies) {
    const domain = domainFromUrl(company.domainName?.primaryLinkUrl);
    if (domain) {
      companiesByDomain.set(domain, company);
    }
  }

  const peopleByEmail = new Map();
  for (const person of workspaceData.people) {
    const emails = [
      person.emails?.primaryEmail,
      ...(person.emails?.additionalEmails ?? []),
    ].filter(Boolean);
    for (const email of emails) {
      peopleByEmail.set(String(email).toLowerCase(), person);
    }
  }

  const orgNameMatches = [];
  const orgDomainMatches = [];
  const personEmailMatches = [];

  for (const org of orgs) {
    const nameMatch = companiesByNormName.get(normalizeString(org.organization_name));
    if (nameMatch) {
      orgNameMatches.push({
        source: org.organization_name,
        crmId: nameMatch.id,
        crmName: nameMatch.name,
      });
    }

    const domain = domainFromUrl(org.website);
    const domainMatch = domain ? companiesByDomain.get(domain) : null;
    if (domainMatch) {
      orgDomainMatches.push({
        source: org.organization_name,
        crmId: domainMatch.id,
        crmName: domainMatch.name,
        domain,
        hasExistingOpportunities: Boolean(
          domainMatch.opportunities?.edges?.length,
        ),
      });
    }
  }

  for (const contact of contacts) {
    const existing = peopleByEmail.get(String(contact.email ?? '').toLowerCase());
    if (existing) {
      personEmailMatches.push({
        sourceOrganization: contact.organization_name,
        email: contact.email,
        crmId: existing.id,
        crmCompany: existing.company?.name ?? null,
      });
    }
  }

  const opportunityPlans = buildOpportunityPlans(orgs, contactsByOrg);

  return {
    sourceOrganizations: orgs.length,
    sourceContacts: contacts.length,
    existingCompanies: workspaceData.companies.length,
    existingPeople: workspaceData.people.length,
    existingOpportunities: workspaceData.opportunities.length,
    exactOrganizationNameMatches: orgNameMatches.length,
    domainMatches: orgDomainMatches.length,
    exactPeopleEmailMatches: personEmailMatches.length,
    plannedDealCount: opportunityPlans.length,
    orgNameMatches,
    orgDomainMatches,
    personEmailMatches,
  };
}

function buildCompanyData(org, contacts) {
  const derived = deriveCompanyFlags(org, contacts);
  const orgFlags = splitFlags(org.quality_flags);

  return {
    name: org.organization_name,
    domainName: companyWebsiteInput(org.website),
    businessLineName: BUSINESS_LINE_NAME,
    campaignName: CAMPAIGN_NAME,
    organizationType: org.organization_type,
    departmentArea: org.department_area,
    island: org.island,
    municipality: org.municipality,
    emailMain: org.email_main,
    phoneMain: org.phone_main,
    sourceType: org.source_type,
    sourceUrl: org.source_url,
    sourceFile: org.source_file,
    icpSegment: org.icp_segment,
    qualityFlags: unique([...orgFlags, ...splitFlags(derived.qualityFlags)]).join(';'),
    highConfidence: derived.highConfidence,
    genericEmail: derived.genericEmail,
    needsManualReview: toBool(org.needs_manual_review),
    duplicatePossible: toBool(org.duplicate_possible),
  };
}

function buildPersonData(contact, companyId, organizationType) {
  return {
    name: personNameInput(contact.contact_name),
    emails: emailsInput(contact.email),
    phones: phonesInput(contact.phone),
    city: contact.municipality,
    jobTitle: contact.role_title,
    company: companyId
      ? {
          connect: {
            where: {
              id: companyId,
            },
          },
        }
      : undefined,
    businessLineName: BUSINESS_LINE_NAME,
    campaignName: CAMPAIGN_NAME,
    organizationType,
    departmentArea: contact.department_area,
    island: contact.island,
    municipality: contact.municipality,
    sourceType: contact.source_type,
    sourceUrl: contact.source_url,
    sourceFile: contact.source_file,
    icpSegment: contact.icp_segment,
    qualityFlags: contact.quality_flags,
    highConfidence: toBool(contact.high_confidence),
    genericEmail: toBool(contact.generic_email),
    needsManualReview: toBool(contact.needs_manual_review),
    duplicatePossible: toBool(contact.duplicate_possible),
    emailType: contact.email_type,
  };
}

function buildOpportunityData({
  org,
  plan,
  contacts,
  companyId,
  personId,
  businessLineId,
}) {
  const bestContact = chooseBestContact(contacts);
  const derived = deriveCompanyFlags(org, contacts);
  const needsManualReview =
    toBool(org.needs_manual_review) ||
    contacts.some((contact) => toBool(contact.needs_manual_review));
  const duplicatePossible =
    toBool(org.duplicate_possible) ||
    contacts.some((contact) => toBool(contact.duplicate_possible));
  const genericEmail = bestContact
    ? toBool(bestContact.generic_email)
    : derived.genericEmail;
  const sourceUrl = bestContact?.source_url || org.source_url;
  const sourceFile = bestContact?.source_file || org.source_file;
  const sourceType = bestContact?.source_type || org.source_type;
  const icpSegment = bestContact?.icp_segment || org.icp_segment;
  const qualityFlags = joinFlags(
    org.quality_flags,
    ...contacts.map((contact) => contact.quality_flags),
  );
  const name = plan.splitByArea
    ? `${org.organization_name} — ${CAMPAIGN_NAME} — ${plan.departmentArea}`
    : `${org.organization_name} — ${CAMPAIGN_NAME}`;

  return {
    name,
    stage: OPPORTUNITY_STAGE,
    company: companyId
      ? {
          connect: {
            where: {
              id: companyId,
            },
          },
        }
      : undefined,
    pointOfContact: personId
      ? {
          connect: {
            where: {
              id: personId,
            },
          },
        }
      : undefined,
    businessLine: businessLineId
      ? {
          connect: {
            where: {
              id: businessLineId,
            },
          },
        }
      : undefined,
    businessLineName: BUSINESS_LINE_NAME,
    campaignName: CAMPAIGN_NAME,
    organizationType: org.organization_type,
    departmentArea: plan.departmentArea || org.department_area,
    island: org.island,
    municipality: org.municipality,
    sourceType,
    sourceUrl,
    sourceFile,
    icpSegment,
    qualityFlags,
    highConfidence: derived.highConfidence,
    genericEmail,
    needsManualReview,
    duplicatePossible,
    outreachStatus: OUTREACH_STATUS,
  };
}

async function ensureFields(client, objects, apply, report) {
  const result = {
    created: [],
    reused: [],
    conflicts: [],
  };

  for (const [objectName, fields] of Object.entries(FIELD_DEFS)) {
    const object = objects.find((item) => item.nameSingular === objectName);

    if (!object) {
      throw new Error(`Object metadata not found for ${objectName}`);
    }

    const existingByName = new Map(object.fields.map((field) => [field.name, field]));

    for (const [name, label, type] of fields) {
      const existing = existingByName.get(name);
      if (existing) {
        if (existing.type !== type) {
          result.conflicts.push({
            object: objectName,
            field: name,
            existingType: existing.type,
            desiredType: type,
          });
          continue;
        }

        result.reused.push({
          object: objectName,
          field: name,
          id: existing.id,
          type: existing.type,
        });
        continue;
      }

      if (!apply) {
        result.created.push({
          object: objectName,
          field: name,
          label,
          type,
          status: 'planned',
        });
        continue;
      }

      const data = await client.gqlMetadata(
        `
          mutation CreateField($input: CreateOneFieldMetadataInput!) {
            createOneField(input: $input) {
              id
              name
              label
              type
            }
          }
        `,
        {
          input: {
            field: {
              objectMetadataId: object.id,
              name,
              label,
              type,
              isCustom: true,
              isActive: true,
              isNullable: true,
            },
          },
        },
      );

      result.created.push({
        object: objectName,
        field: data.createOneField.name,
        id: data.createOneField.id,
        label: data.createOneField.label,
        type: data.createOneField.type,
        status: 'created',
      });
    }
  }

  report.fields = result;

  if (result.conflicts.length) {
    throw new Error(
      `Field conflicts detected: ${JSON.stringify(result.conflicts, null, 2)}`,
    );
  }
}

async function ensureCustomTypesAvailable(client, apply, report) {
  if (!apply) return;

  const expected = {
    CompanyCreateInput: FIELD_DEFS.company.map(([name]) => name),
    Company: FIELD_DEFS.company.map(([name]) => name),
    PersonCreateInput: FIELD_DEFS.person.map(([name]) => name),
    Person: FIELD_DEFS.person.map(([name]) => name),
    OpportunityCreateInput: FIELD_DEFS.opportunity.map(([name]) => name),
    Opportunity: FIELD_DEFS.opportunity.map(([name]) => name),
  };

  const query = `
    query TypeInfo($name: String!) {
      __type(name: $name) {
        name
        fields(includeDeprecated: true) {
          name
        }
        inputFields {
          name
        }
      }
    }
  `;

  const typeAvailability = {};

  for (let attempt = 1; attempt <= 10; attempt += 1) {
    let allReady = true;

    for (const [typeName, fieldNames] of Object.entries(expected)) {
      const data = await client.gqlData(query, { name: typeName });
      const type = data.__type;
      const availableNames = new Set([
        ...(type.fields ?? []).map((field) => field.name),
        ...(type.inputFields ?? []).map((field) => field.name),
      ]);
      const missing = fieldNames.filter((name) => !availableNames.has(name));

      typeAvailability[typeName] = {
        missing,
        attempt,
      };

      if (missing.length) {
        allReady = false;
      }
    }

    if (allReady) {
      report.customTypeAvailability = typeAvailability;
      return;
    }

    await sleep(2000);
  }

  report.customTypeAvailability = typeAvailability;
  throw new Error(
    `Custom fields did not appear in record GraphQL types: ${JSON.stringify(
      typeAvailability,
      null,
      2,
    )}`,
  );
}

async function upsertCompanies({
  client,
  orgs,
  contactsByOrg,
  workspaceData,
  apply,
  report,
}) {
  const companiesByNormName = new Map(
    workspaceData.companies.map((company) => [normalizeString(company.name), company]),
  );
  const companiesByDomain = new Map();

  for (const company of workspaceData.companies) {
    const domain = domainFromUrl(company.domainName?.primaryLinkUrl);
    if (domain) {
      companiesByDomain.set(domain, company);
    }
  }

  const companyIdsByOrg = new Map();
  const result = {
    created: [],
    updated: [],
    reused: [],
    plannedCreates: [],
  };

  for (const org of orgs) {
    const data = buildCompanyData(
      org,
      contactsByOrg.get(org.organization_name) ?? [],
    );
    const exactMatch = companiesByNormName.get(normalizeString(org.organization_name));
    const domainMatch = companiesByDomain.get(domainFromUrl(org.website));
    const reusable =
      exactMatch ||
      (domainMatch && !domainMatch.opportunities?.edges?.length ? domainMatch : null);

    if (!apply) {
      if (reusable) {
        result.reused.push({
          source: org.organization_name,
          crmId: reusable.id,
          crmName: reusable.name,
          reason: exactMatch ? 'exact_name_match' : 'domain_match_no_opportunities',
        });
        companyIdsByOrg.set(org.organization_name, reusable.id);
      } else {
        result.plannedCreates.push({
          source: org.organization_name,
          name: data.name,
        });
      }
      continue;
    }

    if (reusable) {
      const response = await client.gqlData(
        `
          mutation UpdateCompany($id: UUID!, $data: CompanyUpdateInput!) {
            updateCompany(id: $id, data: $data) {
              id
              name
            }
          }
        `,
        {
          id: reusable.id,
          data,
        },
      );

      companyIdsByOrg.set(org.organization_name, response.updateCompany.id);
      result.updated.push({
        source: org.organization_name,
        id: response.updateCompany.id,
        name: response.updateCompany.name,
        reason: exactMatch ? 'exact_name_match' : 'domain_match_no_opportunities',
      });
      continue;
    }

    const response = await client.gqlData(
      `
        mutation CreateCompany($data: CompanyCreateInput!) {
          createCompany(data: $data) {
            id
            name
          }
        }
      `,
      {
        data,
      },
    );

    companyIdsByOrg.set(org.organization_name, response.createCompany.id);
    result.created.push({
      source: org.organization_name,
      id: response.createCompany.id,
      name: response.createCompany.name,
    });
  }

  report.companies = result;
  return companyIdsByOrg;
}

async function upsertPeople({
  client,
  contacts,
  orgByName,
  companyIdsByOrg,
  workspaceData,
  apply,
  report,
}) {
  const peopleByEmail = new Map();
  for (const person of workspaceData.people) {
    const emails = [
      person.emails?.primaryEmail,
      ...(person.emails?.additionalEmails ?? []),
    ].filter(Boolean);
    for (const email of emails) {
      peopleByEmail.set(String(email).toLowerCase(), person);
    }
  }

  const personIdsByEmail = new Map();
  const result = {
    created: [],
    updated: [],
    reused: [],
    plannedCreates: [],
  };

  for (const contact of contacts) {
    const org = orgByName.get(contact.organization_name);
    const companyId = companyIdsByOrg.get(contact.organization_name) ?? null;
    const data = buildPersonData(contact, companyId, org?.organization_type ?? null);
    const existing = peopleByEmail.get(String(contact.email ?? '').toLowerCase());

    if (!apply) {
      if (existing) {
        result.reused.push({
          email: contact.email,
          crmId: existing.id,
          sourceOrganization: contact.organization_name,
        });
        personIdsByEmail.set(String(contact.email).toLowerCase(), existing.id);
      } else {
        result.plannedCreates.push({
          email: contact.email,
          sourceOrganization: contact.organization_name,
        });
      }
      continue;
    }

    if (existing) {
      const response = await client.gqlData(
        `
          mutation UpdatePerson($id: UUID!, $data: PersonUpdateInput!) {
            updatePerson(id: $id, data: $data) {
              id
            }
          }
        `,
        {
          id: existing.id,
          data,
        },
      );

      personIdsByEmail.set(String(contact.email).toLowerCase(), response.updatePerson.id);
      result.updated.push({
        email: contact.email,
        id: response.updatePerson.id,
        sourceOrganization: contact.organization_name,
      });
      continue;
    }

    const response = await client.gqlData(
      `
        mutation CreatePerson($data: PersonCreateInput!) {
          createPerson(data: $data) {
            id
          }
        }
      `,
      {
        data,
      },
    );

    personIdsByEmail.set(String(contact.email).toLowerCase(), response.createPerson.id);
    result.created.push({
      email: contact.email,
      id: response.createPerson.id,
      sourceOrganization: contact.organization_name,
    });
  }

  report.people = result;
  return personIdsByEmail;
}

async function upsertOpportunities({
  client,
  orgs,
  contactsByOrg,
  companyIdsByOrg,
  personIdsByEmail,
  workspaceData,
  businessLineId,
  apply,
  report,
}) {
  const orgByName = new Map(orgs.map((org) => [org.organization_name, org]));
  const existingByNormName = new Map(
    workspaceData.opportunities.map((opportunity) => [
      normalizeString(opportunity.name),
      opportunity,
    ]),
  );
  const result = {
    created: [],
    updated: [],
    plannedCreates: [],
  };
  const plans = buildOpportunityPlans(orgs, contactsByOrg);

  for (const plan of plans) {
    const org = orgByName.get(plan.organizationName);
    const orgContacts = contactsByOrg.get(plan.organizationName) ?? [];
    const contacts = plan.splitByArea
      ? orgContacts.filter(
          (contact) =>
            String(contact.department_area ?? '').trim() === plan.departmentArea,
        )
      : orgContacts;
    const bestContact = chooseBestContact(contacts);
    const personId =
      bestContact && personIdsByEmail.get(String(bestContact.email).toLowerCase());
    const companyId = companyIdsByOrg.get(plan.organizationName) ?? null;
    const data = buildOpportunityData({
      org,
      plan,
      contacts,
      companyId,
      personId,
      businessLineId,
    });
    const existing = existingByNormName.get(normalizeString(data.name));

    if (!apply) {
      if (existing) {
        result.updated.push({
          name: data.name,
          id: existing.id,
          reason: 'existing_opportunity_name_match',
        });
      } else {
        result.plannedCreates.push({
          name: data.name,
        });
      }
      continue;
    }

    if (existing) {
      const response = await client.gqlData(
        `
          mutation UpdateOpportunity($id: UUID!, $data: OpportunityUpdateInput!) {
            updateOpportunity(id: $id, data: $data) {
              id
              name
            }
          }
        `,
        {
          id: existing.id,
          data,
        },
      );

      result.updated.push({
        id: response.updateOpportunity.id,
        name: response.updateOpportunity.name,
        reason: 'existing_opportunity_name_match',
      });
      continue;
    }

    const response = await client.gqlData(
      `
        mutation CreateOpportunity($data: OpportunityCreateInput!) {
          createOpportunity(data: $data) {
            id
            name
          }
        }
      `,
      {
        data,
      },
    );

    result.created.push({
      id: response.createOpportunity.id,
      name: response.createOpportunity.name,
    });
  }

  report.opportunities = result;
  report.opportunityPlanCount = plans.length;
}

async function createOpportunityViews(client, objects, apply, report) {
  const object = objects.find((item) => item.nameSingular === 'opportunity');
  if (!object) {
    throw new Error('Opportunity object metadata not found');
  }

  const existingViewsData = await client.gqlMetadata(
    `
      query ExistingOpportunityViews($objectMetadataId: String!) {
        getCoreViews(objectMetadataId: $objectMetadataId) {
          id
          name
          type
        }
      }
    `,
    {
      objectMetadataId: object.id,
    },
  );

  const existingByName = new Map(
    existingViewsData.getCoreViews.map((view) => [view.name, view]),
  );
  const fieldByName = new Map(object.fields.map((field) => [field.name, field]));
  const result = {
    created: [],
    reused: [],
    pendingManual: [],
  };

  for (const viewDef of OPPORTUNITY_VIEW_DEFS) {
    const existing = existingByName.get(viewDef.name);
    if (existing) {
      result.reused.push({
        name: existing.name,
        id: existing.id,
      });
      continue;
    }

    if (!apply) {
      result.pendingManual.push({
        name: viewDef.name,
        reason: 'planned_create',
      });
      continue;
    }

    const createdView = await client.gqlMetadata(
      `
        mutation CreateView($input: CreateViewInput!) {
          createCoreView(input: $input) {
            id
            name
            type
          }
        }
      `,
      {
        input: {
          name: viewDef.name,
          objectMetadataId: object.id,
          type: 'TABLE',
          icon: 'IconList',
          position: 100 + result.created.length,
          visibility: 'WORKSPACE',
        },
      },
    );

    const viewId = createdView.createCoreView.id;
    const createdFieldNames = [];

    for (const [fieldName, size] of OPPORTUNITY_VIEW_FIELDS) {
      const field = fieldByName.get(fieldName);
      if (!field) continue;

      await client.gqlMetadata(
        `
          mutation CreateViewField($input: CreateViewFieldInput!) {
            createCoreViewField(input: $input) {
              id
            }
          }
        `,
        {
          input: {
            fieldMetadataId: field.id,
            viewId,
            isVisible: true,
            size,
            position: createdFieldNames.length,
          },
        },
      );

      createdFieldNames.push(fieldName);
    }

    const baseFilters = [
      ['businessLineName', 'IS', BUSINESS_LINE_NAME],
      ['campaignName', 'IS', CAMPAIGN_NAME],
      ...viewDef.filters,
    ];

    for (const [fieldName, operand, value] of baseFilters) {
      const field = fieldByName.get(fieldName);
      if (!field) continue;

      await client.gqlMetadata(
        `
          mutation CreateViewFilter($input: CreateViewFilterInput!) {
            createCoreViewFilter(input: $input) {
              id
            }
          }
        `,
        {
          input: {
            fieldMetadataId: field.id,
            operand,
            value,
            viewId,
          },
        },
      );
    }

    result.created.push({
      id: viewId,
      name: viewDef.name,
      fields: createdFieldNames,
      filters: baseFilters.map(([fieldName, operand, value]) => ({
        fieldName,
        operand,
        value,
      })),
    });
  }

  report.views = result;
}

async function runQa(client, report, apply) {
  if (!apply) {
    report.qa = {
      status: 'dry_run_only',
    };
    return;
  }

  const qaQuery = `
    query ImportQa {
      companies(first: 250) {
        edges {
          node {
            id
            name
            businessLineName
            campaignName
          }
        }
      }
      people(first: 500) {
        edges {
          node {
            id
            emails {
              primaryEmail
            }
            businessLineName
            campaignName
          }
        }
      }
      opportunities(first: 500) {
        edges {
          node {
            id
            name
            businessLineName
            campaignName
            outreachStatus
            businessLine {
              id
              name
            }
          }
        }
      }
    }
  `;

  const data = await client.gqlData(qaQuery);
  const importedCompanies = data.companies.edges
    .map(({ node }) => node)
    .filter(
      (company) =>
        company.businessLineName === BUSINESS_LINE_NAME &&
        company.campaignName === CAMPAIGN_NAME,
    );
  const importedPeople = data.people.edges
    .map(({ node }) => node)
    .filter(
      (person) =>
        person.businessLineName === BUSINESS_LINE_NAME &&
        person.campaignName === CAMPAIGN_NAME,
    );
  const importedOpportunities = data.opportunities.edges
    .map(({ node }) => node)
    .filter(
      (opportunity) =>
        opportunity.businessLineName === BUSINESS_LINE_NAME &&
        opportunity.campaignName === CAMPAIGN_NAME,
    );

  report.qa = {
    companiesTagged: importedCompanies.length,
    peopleTagged: importedPeople.length,
    opportunitiesTagged: importedOpportunities.length,
    opportunitiesPendingFirstEmail: importedOpportunities.filter(
      (opportunity) => opportunity.outreachStatus === OUTREACH_STATUS,
    ).length,
    opportunitiesWithBusinessLineRelation: importedOpportunities.filter(
      (opportunity) => opportunity.businessLine?.name === BUSINESS_LINE_NAME,
    ).length,
  };
}

function renderMarkdownReport(report) {
  const lines = [];
  const modeLabel = report.mode === 'apply' ? 'apply' : 'dry-run';

  lines.push('# IA Mujeres CRM Import Report');
  lines.push('');
  lines.push(`- Date: ${report.generatedAt}`);
  lines.push(`- Mode: ${modeLabel}`);
  lines.push(`- Business Line: ${BUSINESS_LINE_NAME}`);
  lines.push(`- Campaign/Funnel field: ${CAMPAIGN_NAME}`);
  lines.push('');
  lines.push('## 1. Auditoria previa del CRM');
  lines.push('');
  lines.push(`- Existing companies: ${report.audit.existingCompanies}`);
  lines.push(`- Existing people: ${report.audit.existingPeople}`);
  lines.push(`- Existing opportunities: ${report.audit.existingOpportunities}`);
  lines.push(`- Exact organization name matches: ${report.audit.exactOrganizationNameMatches}`);
  lines.push(`- Domain matches: ${report.audit.domainMatches}`);
  lines.push(`- Exact people email matches: ${report.audit.exactPeopleEmailMatches}`);
  lines.push('');
  lines.push('## 2. Decision de arquitectura');
  lines.push('');
  lines.push(`- Stable business line object used: \`${BUSINESS_LINE_NAME}\`.`);
  lines.push(
    `- Campaign isolation implemented with custom field \`campaignName = ${CAMPAIGN_NAME}\` on Companies, People and Opportunities.`,
  );
  lines.push(
    '- Opportunity isolation uses both the native Business Line relation and a mirrored custom text field `businessLineName` for view/filter portability.',
  );
  lines.push(
    '- Separate pipeline object was not available in the audited schema; isolation is enforced through filtered opportunity views instead of a dedicated pipeline.',
  );
  lines.push('');
  lines.push('## 3. Plan de importacion');
  lines.push('');
  lines.push(`- Organizations in source: ${report.audit.sourceOrganizations}`);
  lines.push(`- Contacts in source: ${report.audit.sourceContacts}`);
  lines.push(`- Planned deals: ${report.audit.plannedDealCount}`);
  lines.push(
    '- Deal rule: one deal per organization by default, split by area only for cabildos with multiple clear areas in contact data.',
  );
  lines.push('');
  lines.push('## 4. Campos creados o reutilizados');
  lines.push('');
  lines.push(`- Fields created: ${report.fields.created.length}`);
  lines.push(`- Fields reused: ${report.fields.reused.length}`);
  lines.push('');
  lines.push('## 5. Business Line');
  lines.push('');
  lines.push(
    `- Status: ${report.businessLine.status}${report.businessLine.id ? ` (${report.businessLine.id})` : ''}`,
  );
  lines.push('');
  lines.push('## 6. Resultado de importacion');
  lines.push('');
  lines.push(`- Companies created: ${report.companies.created.length}`);
  lines.push(`- Companies updated/reused: ${report.companies.updated.length}`);
  lines.push(`- People created: ${report.people.created.length}`);
  lines.push(`- People updated/reused: ${report.people.updated.length}`);
  lines.push(`- Opportunities created: ${report.opportunities.created.length}`);
  lines.push(`- Opportunities updated/reused: ${report.opportunities.updated.length}`);
  lines.push('');
  lines.push('## 7. QA post-import');
  lines.push('');
  if (report.qa.status === 'dry_run_only') {
    lines.push('- Dry-run only: no live QA counters available.');
  } else {
    lines.push(`- Companies tagged for campaign: ${report.qa.companiesTagged}`);
    lines.push(`- People tagged for campaign: ${report.qa.peopleTagged}`);
    lines.push(`- Opportunities tagged for campaign: ${report.qa.opportunitiesTagged}`);
    lines.push(
      `- Opportunities still pending first email: ${report.qa.opportunitiesPendingFirstEmail}`,
    );
    lines.push(
      `- Opportunities with native Business Line relation set: ${report.qa.opportunitiesWithBusinessLineRelation}`,
    );
  }
  lines.push('');
  lines.push('## 8. Vistas');
  lines.push('');
  if (report.views) {
    lines.push(`- Views created: ${report.views.created.length}`);
    lines.push(`- Views reused: ${report.views.reused.length}`);
    lines.push(`- Views pending manual: ${report.views.pendingManual.length}`);
  } else {
    lines.push('- Views were skipped.');
  }
  lines.push('');
  lines.push('## 9. Conflictos y pendientes');
  lines.push('');
  if (!report.conflicts.length) {
    lines.push('- No blocking conflicts detected.');
  } else {
    for (const conflict of report.conflicts) {
      lines.push(`- ${conflict}`);
    }
  }
  lines.push('');
  lines.push('## 10. Recomendacion para Fase 4');
  lines.push('');
  lines.push(
    '- Proceed to workflow/funnel design only after validating the manual-review queue and deciding the first outbound batch on the new opportunity views.',
  );
  lines.push(
    '- If multi-line reuse becomes common on Companies or People, promote `businessLineName` from text to a richer relation or multi-select in a later schema pass.',
  );

  return `${lines.join('\n')}\n`;
}

function renderSpec(report, reportPaths) {
  const phase4Ready =
    report.mode === 'apply' &&
    report.qa.opportunitiesTagged === report.audit.plannedDealCount;
  const risks = report.conflicts.length
    ? report.conflicts
    : [
        'Company/Person isolation on this phase uses custom text fields; if the same records must span multiple business lines later, the schema should be revisited.',
        'The manual review queue remains large by design and should be worked inside Twenty before any outbound automation.',
      ];

  return `# 002 · IA Mujeres CRM Import

- Status: ${phase4Ready ? 'completed' : report.mode === 'apply' ? 'completed_with_risks' : 'in_progress'}
- Date: ${report.generatedAt}

## Hecho

- Auditada la workspace real de Twenty CRM.
- Asegurada la Business Line \`${BUSINESS_LINE_NAME}\`.
- Asegurados los campos minimos de aislamiento y segmentacion para Companies, People y Opportunities.
- Importadas o actualizadas organizaciones, contactos y deals iniciales de IA Mujeres 2026.
- Asegurada la aislacion operativa con \`businessLineName\`, \`campaignName\` y vistas filtradas de Opportunities.

## Outputs

- Report JSON: \`${path.relative(ROOT_DIR, reportPaths.jsonPath)}\`
- Report Markdown: \`${path.relative(ROOT_DIR, reportPaths.mdPath)}\`

## Riesgos

${risks.map((risk) => `- ${risk}`).join('\n')}

## Proximos pasos

- Revisar la vista \`IA Mujeres — Revisión manual\`.
- Seleccionar el primer lote de \`IA Mujeres — Alta prioridad\`.
- Diseñar workflows y funnel de Fase 4 sin tocar todavía envios reales hasta validar el lote inicial.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const credentials = readCredentials();
  const client = new TwentyClient(credentials);
  ensureDir(args.outputDir);

  const orgs = loadJson(path.join(args.sourceDir, 'organizations_clean.json'));
  const contacts = loadJson(path.join(args.sourceDir, 'contacts_clean.json'));
  const { orgByName, contactsByOrg } = buildSourceIndex(orgs, contacts);
  const metadataObjects = await fetchMetadataObjects(client);
  const workspaceData = await fetchExistingWorkspaceData(client);

  const report = {
    generatedAt: new Date().toISOString().slice(0, 10),
    mode: args.apply ? 'apply' : 'dry_run',
    sourceDir: args.sourceDir,
    businessLineName: BUSINESS_LINE_NAME,
    campaignName: CAMPAIGN_NAME,
    audit: computeAudit(orgs, contacts, workspaceData, contactsByOrg),
    conflicts: [],
  };

  await ensureFields(client, metadataObjects, args.apply, report);
  const businessLineId = await ensureBusinessLine(
    client,
    workspaceData,
    args.apply,
    report,
  );
  await ensureCustomTypesAvailable(client, args.apply, report);

  const refreshedWorkspaceData = await fetchExistingWorkspaceData(client);
  const companyIdsByOrg = await upsertCompanies({
    client,
    orgs,
    contactsByOrg,
    workspaceData: refreshedWorkspaceData,
    apply: args.apply,
    report,
  });
  const peopleWorkspaceData = await fetchExistingWorkspaceData(client);
  const personIdsByEmail = await upsertPeople({
    client,
    contacts,
    orgByName,
    companyIdsByOrg,
    workspaceData: peopleWorkspaceData,
    apply: args.apply,
    report,
  });
  const opportunitiesWorkspaceData = await fetchExistingWorkspaceData(client);
  await upsertOpportunities({
    client,
    orgs,
    contactsByOrg,
    companyIdsByOrg,
    personIdsByEmail,
    workspaceData: opportunitiesWorkspaceData,
    businessLineId,
    apply: args.apply,
    report,
  });

  if (args.createViews) {
    const latestObjects = await fetchMetadataObjects(client);
    await createOpportunityViews(client, latestObjects, args.apply, report);
  }

  await runQa(client, report, args.apply);

  const filenamePrefix = args.apply
    ? `${report.generatedAt}_ia_mujeres_crm_import_report`
    : `${report.generatedAt}_ia_mujeres_crm_import_dry_run`;
  const jsonPath = path.join(args.outputDir, `${filenamePrefix}.json`);
  const mdPath = path.join(args.outputDir, `${filenamePrefix}.md`);

  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  fs.writeFileSync(mdPath, renderMarkdownReport(report));

  if (args.apply) {
    ensureDir(path.dirname(args.specPath));
    fs.writeFileSync(args.specPath, renderSpec(report, { jsonPath, mdPath }));
  }

  console.log(
    JSON.stringify(
      {
        mode: report.mode,
        jsonPath,
        mdPath,
        businessLine: report.businessLine,
        qa: report.qa,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});

import { buildContactRegistryKey, getContactMapping } from './registry.mjs';

export async function resolveOrPrepareContact({
  client,
  registry,
  crmSnapshot,
  contactOverrides = {},
  interviewer = null,
}) {
  const warnings = [];
  const contactKey = buildContactRegistryKey(crmSnapshot);
  const existingMapping = getContactMapping(registry, contactKey);
  if (existingMapping?.contactId) {
    try {
      const contact = await client.getContact(existingMapping.contactId);
      return {
        mode: 'reuse',
        source: 'registry',
        contactKey,
        contact,
        warnings,
      };
    } catch {
      warnings.push(
        `Local contact mapping ${existingMapping.contactId} was stale and has been ignored.`,
      );
    }
  }

  const draft = buildContactDraft({ crmSnapshot, contactOverrides });
  const candidates = await searchContactCandidates({ client, draft, contactOverrides });

  const scored = scoreCandidates({ candidates, draft, contactOverrides });
  if (scored.length === 1) {
    return {
      mode: 'reuse',
      source: 'search',
      contactKey,
      contact: scored[0],
      warnings,
    };
  }

  if (scored.length > 1 && interviewer?.choose) {
    const chosen = await interviewer.choose(
      'He encontrado varios contactos posibles en AIKount. Elige uno o cancela la sesión si no estás seguro:',
      scored,
      (candidate) =>
        `${candidate.name} · ${candidate.email ?? 'sin email'} · ${candidate.vat ?? 'sin VAT'} · ${candidate.id}`,
    );
    warnings.push(`Resolved ${scored.length} AIKount contact candidates by interactive choice.`);
    return {
      mode: 'reuse',
      source: 'interactive_choice',
      contactKey,
      contact: chosen,
      warnings,
    };
  }

  return {
    mode: 'create',
    source: 'draft',
    contactKey,
    draft,
    warnings,
    candidates: scored,
  };
}

function buildContactDraft({ crmSnapshot, contactOverrides }) {
  const company = crmSnapshot.company;
  const person = crmSnapshot.pointOfContact;
  const name =
    contactOverrides.name ??
    company?.name ??
    person?.fullName ??
    crmSnapshot.name;
  return {
    name,
    legal_name: contactOverrides.legalName ?? company?.name ?? null,
    vat: contactOverrides.vat ?? null,
    email:
      contactOverrides.email ??
      person?.primaryEmail ??
      company?.email ??
      null,
    phone: contactOverrides.phone ?? company?.phone ?? null,
    address: company?.address?.street1 ?? null,
    address_line2: company?.address?.street2 ?? null,
    city: company?.address?.city ?? null,
    state: company?.address?.state ?? null,
    postal_code: company?.address?.postalCode ?? null,
    country: company?.address?.country ?? null,
    is_customer: true,
    is_supplier: false,
    customer_type: company ? 'business' : 'individual',
    currency: crmSnapshot.currencyCode ?? 'EUR',
    external_source: 'skilland-crm',
    notes: `Created from Twenty opportunity ${crmSnapshot.opportunityId}`,
  };
}

async function searchContactCandidates({ client, draft, contactOverrides }) {
  const terms = new Set(
    [
      contactOverrides.vat,
      contactOverrides.email,
      draft.email,
      draft.name,
      draft.legal_name,
    ].filter(Boolean),
  );
  const results = [];
  for (const term of terms) {
    const response = await client.listContacts({ search: term, limit: 10, kind: 'customer' });
    results.push(...(response.items ?? response.results ?? response.data ?? response ?? []));
  }

  const byId = new Map();
  for (const item of results) {
    if (item?.id && !byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return [...byId.values()];
}

function scoreCandidates({ candidates, draft, contactOverrides }) {
  const expectedName = normalizeText(draft.name);
  const expectedLegalName = normalizeText(draft.legal_name);
  const expectedEmail = normalizeText(contactOverrides.email ?? draft.email);
  const expectedVat = normalizeText(contactOverrides.vat ?? draft.vat);

  return candidates
    .map((candidate) => ({
      ...candidate,
      _score: scoreCandidate({
        candidate,
        expectedName,
        expectedLegalName,
        expectedEmail,
        expectedVat,
      }),
    }))
    .filter((candidate) => candidate._score > 0)
    .sort((left, right) => right._score - left._score)
    .filter((candidate, index, array) => index === 0 || candidate._score === array[0]._score)
    .map(({ _score, ...candidate }) => candidate);
}

function scoreCandidate({
  candidate,
  expectedName,
  expectedLegalName,
  expectedEmail,
  expectedVat,
}) {
  let score = 0;
  const candidateName = normalizeText(candidate.name);
  const candidateLegalName = normalizeText(candidate.legal_name);
  const candidateEmail = normalizeText(candidate.email);
  const candidateVat = normalizeText(candidate.vat);

  if (expectedVat && candidateVat === expectedVat) {
    score += 100;
  }
  if (expectedEmail && candidateEmail === expectedEmail) {
    score += 90;
  }
  if (expectedName && candidateName === expectedName) {
    score += 60;
  }
  if (expectedLegalName && candidateLegalName === expectedLegalName) {
    score += 40;
  }

  return score;
}

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

import fs from 'node:fs';
import path from 'node:path';

const REGISTRY_VERSION = 1;

export function defaultRegistry() {
  return {
    version: REGISTRY_VERSION,
    contacts: {},
    documents: {},
    sessions: [],
  };
}

export function getRegistryPath(outputDir) {
  return path.join(outputDir, 'state', 'registry.json');
}

export function loadRegistry(outputDir) {
  const filePath = getRegistryPath(outputDir);
  if (!fs.existsSync(filePath)) {
    return defaultRegistry();
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    ...defaultRegistry(),
    ...parsed,
    contacts: parsed.contacts ?? {},
    documents: parsed.documents ?? {},
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
  };
}

export function saveRegistry(outputDir, registry) {
  const filePath = getRegistryPath(outputDir);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(registry, null, 2));
  return filePath;
}

export function buildContactRegistryKey(crmSnapshot) {
  if (crmSnapshot?.company?.id) {
    return `company:${crmSnapshot.company.id}`;
  }
  if (crmSnapshot?.pointOfContact?.id) {
    return `person:${crmSnapshot.pointOfContact.id}`;
  }
  return `deal:${crmSnapshot?.opportunityId ?? 'unknown'}`;
}

export function getContactMapping(registry, contactKey) {
  return registry.contacts[contactKey] ?? null;
}

export function upsertContactMapping(registry, contactKey, entry) {
  registry.contacts[contactKey] = {
    ...registry.contacts[contactKey],
    ...entry,
    contactKey,
    updatedAt: new Date().toISOString(),
  };
  return registry.contacts[contactKey];
}

export function buildDocumentExternalId(dealId, documentKind, documentKey) {
  return `crm-opportunity/${dealId}/${documentKind}/${documentKey}`;
}

export function buildDocumentRegistryKey(dealId, documentKind, documentKey) {
  return `${dealId}:${documentKind}:${documentKey}`;
}

export function listDocumentMappings({ registry, dealId, documentKind }) {
  return Object.values(registry.documents)
    .filter((entry) => entry.dealId === dealId)
    .filter((entry) => !documentKind || entry.documentKind === documentKind)
    .sort((left, right) => left.documentKey.localeCompare(right.documentKey));
}

export function findDocumentMapping(registry, dealId, documentKind, documentKey) {
  const key = buildDocumentRegistryKey(dealId, documentKind, documentKey);
  return registry.documents[key] ?? null;
}

export function upsertDocumentMapping(registry, entry) {
  const key = buildDocumentRegistryKey(
    entry.dealId,
    entry.documentKind,
    entry.documentKey,
  );
  registry.documents[key] = {
    ...registry.documents[key],
    ...entry,
    updatedAt: new Date().toISOString(),
  };
  return registry.documents[key];
}

export function recordSession(registry, sessionEntry) {
  const sessions = [...registry.sessions, sessionEntry];
  registry.sessions = sessions.slice(-200);
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CONTAINER_VERSION = 1;
const VALID_KINDS = new Set(['quote', 'invoice']);
const VALID_SOURCE_MODES = new Set(['auto', 'structured', 'deliverable', 'mixed']);

export function defaultFileContainer() {
  return {
    version: CONTAINER_VERSION,
    items: [],
  };
}

export function getFileContainerManifestPath(outputDir) {
  return path.join(outputDir, 'state', 'file_container.json');
}

export function getFileContainerStorageDir(outputDir) {
  return path.join(outputDir, 'file_container');
}

export function loadFileContainer(outputDir) {
  const manifestPath = getFileContainerManifestPath(outputDir);
  if (!fs.existsSync(manifestPath)) {
    return defaultFileContainer();
  }

  const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return {
    ...defaultFileContainer(),
    ...parsed,
    items: Array.isArray(parsed.items) ? parsed.items : [],
  };
}

export function saveFileContainer(outputDir, container) {
  const manifestPath = getFileContainerManifestPath(outputDir);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(container, null, 2));
  return manifestPath;
}

export function addFileContainerItems({
  outputDir,
  inputPath = null,
  dataFilePath = null,
  kind = null,
  sourceMode = 'auto',
  dealLookup = null,
  documentKey = null,
  title = null,
  notes = null,
  requester = null,
  requestedAction = null,
}) {
  const container = loadFileContainer(outputDir);
  const inputFiles = inputPath ? collectInputFiles(inputPath) : [];
  const structuredData = dataFilePath
    ? readStructuredDataFile(dataFilePath)
    : null;
  const structuredEntries = structuredData
    ? expandStructuredEntries(structuredData)
    : [];

  if (!inputFiles.length && !structuredEntries.length) {
    throw new Error('Container add requires --container-add or --container-data-file.');
  }

  const entries = buildContainerAddEntries({ inputFiles, structuredEntries });
  const addedItems = entries.map((entry) =>
    createFileContainerItem({
      outputDir,
      filePath: entry.filePath,
      dataFilePath,
      structuredData: entry.structuredData,
      kind,
      sourceMode,
      dealLookup,
      documentKey,
      title,
      notes,
      requester,
      requestedAction,
    }),
  );

  container.items.push(...addedItems);
  saveFileContainer(outputDir, container);

  return addedItems;
}

export function selectFileContainerItems({
  container,
  itemIds = [],
  kind = null,
  includeBlocked = false,
  limit = null,
}) {
  const idSet = new Set(itemIds.filter(Boolean));
  let items = container.items;

  if (idSet.size) {
    items = items.filter((item) => idSet.has(item.id));
  } else {
    const selectableStatuses = new Set(['pending']);
    if (includeBlocked) {
      selectableStatuses.add('blocked');
    }
    items = items.filter((item) => selectableStatuses.has(item.status));
  }

  if (kind) {
    const normalizedKind = normalizeKind(kind);
    items = items.filter((item) => item.kind === normalizedKind);
  }

  const cappedItems =
    Number.isInteger(limit) && limit > 0 ? items.slice(0, limit) : items;

  if (idSet.size && cappedItems.length !== idSet.size) {
    const foundIds = new Set(cappedItems.map((item) => item.id));
    const missing = [...idSet].filter((id) => !foundIds.has(id));
    throw new Error(`Container item(s) not found: ${missing.join(', ')}`);
  }

  return cappedItems;
}

export function buildRequestFromContainerItem({
  item,
  requester,
  mode,
}) {
  const structuredRequest = item.structuredRequest ?? {};
  const action =
    structuredRequest.action ??
    item.requestedAction ??
    actionForDocumentKind(item.kind);

  if (!action) {
    throw new Error(
      `Container item ${item.id} needs a quote/invoice kind or a structured action.`,
    );
  }

  return {
    requester: structuredRequest.requester ?? requester,
    mode,
    action,
    intent:
      structuredRequest.intent ??
      `Registrar item del contenedor AIKount ${item.id}`,
    dealLookup: structuredRequest.dealLookup ?? item.dealLookup ?? {},
    selectedMappings: structuredRequest.selectedMappings ?? {},
    answers: mergeAnswers(
      {
        documentKey: item.documentKey ?? null,
      },
      structuredRequest.answers ?? {},
    ),
    constraints: structuredRequest.constraints ?? {},
    container: {
      itemIds: [item.id],
      sourceMode: item.sourceMode,
      files: item.files,
      title: item.title,
      notes: item.notes,
    },
  };
}

export function recordFileContainerAttempt(container, itemId, attempt) {
  const item = container.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error(`Container item not found: ${itemId}`);
  }

  const normalizedAttempt = {
    ...attempt,
    finishedAt: attempt.finishedAt ?? new Date().toISOString(),
  };

  item.attempts = [...(item.attempts ?? []), normalizedAttempt].slice(-50);
  item.updatedAt = new Date().toISOString();

  if (attempt.status === 'apply_completed') {
    item.status = 'registered';
    item.registeredAt = item.updatedAt;
    item.registeredRequestId = attempt.requestId ?? null;
  } else if (attempt.status === 'blocked') {
    item.status = 'blocked';
  } else if (attempt.status === 'dry_run_completed') {
    item.lastDryRunAt = item.updatedAt;
    item.lastDryRunRequestId = attempt.requestId ?? null;
  }

  return item;
}

export function formatFileContainerItems(items) {
  if (!items.length) {
    return 'No hay items en el contenedor.';
  }

  return items
    .map((item) => {
      const fileSummary = item.files?.length
        ? item.files.map((file) => file.fileName).join(', ')
        : 'sin archivo';
      const dataSummary = item.structuredRequest ? 'datos estructurados' : 'sin datos';
      return [
        `${item.id}`,
        `status=${item.status}`,
        `kind=${item.kind ?? 'unknown'}`,
        `source=${item.sourceMode}`,
        `files=${fileSummary}`,
        dataSummary,
      ].join(' · ');
    })
    .join('\n');
}

function createFileContainerItem({
  outputDir,
  filePath,
  dataFilePath,
  structuredData,
  kind,
  sourceMode,
  dealLookup,
  documentKey,
  title,
  notes,
  requester,
  requestedAction,
}) {
  const now = new Date().toISOString();
  const itemId = createContainerItemId();
  const itemDir = path.join(getFileContainerStorageDir(outputDir), itemId);
  fs.mkdirSync(itemDir, { recursive: true });

  const files = filePath ? [stageContainerFile(filePath, itemDir)] : [];
  const structuredRequest = structuredData
    ? normalizeStructuredRequest({
        raw: structuredData,
        requester,
        defaultAction: requestedAction ?? actionForDocumentKind(kind),
        defaultDealLookup: normalizeLookupValue(dealLookup),
        defaultDocumentKey: documentKey,
      })
    : null;

  const dataFile = dataFilePath ? stageDataFile(dataFilePath, itemDir) : null;
  const resolvedKind =
    normalizeKindOrNull(kind) ??
    documentKindForAction(structuredRequest?.action) ??
    null;
  if (!resolvedKind && !structuredRequest?.action) {
    throw new Error(
      'Container item needs --container-kind=quote|invoice or a structured action.',
    );
  }

  return {
    id: itemId,
    status: 'pending',
    kind: resolvedKind,
    sourceMode: resolveSourceMode({
      sourceMode,
      hasFiles: files.length > 0,
      hasStructuredData: Boolean(structuredRequest),
    }),
    requestedAction:
      structuredRequest?.action ?? requestedAction ?? actionForDocumentKind(resolvedKind),
    title: title ?? path.basename(filePath ?? dataFilePath ?? itemId),
    notes,
    dealLookup:
      structuredRequest?.dealLookup ?? normalizeLookupValue(dealLookup) ?? {},
    documentKey:
      structuredRequest?.answers?.documentKey ?? documentKey ?? null,
    files,
    dataFile,
    structuredRequest,
    createdBy: requester,
    createdAt: now,
    updatedAt: now,
    attempts: [],
  };
}

function collectInputFiles(inputPath) {
  const resolvedPath = path.resolve(inputPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Container input path does not exist: ${inputPath}`);
  }

  const stat = fs.statSync(resolvedPath);
  if (stat.isFile()) {
    return [resolvedPath];
  }
  if (!stat.isDirectory()) {
    throw new Error(`Container input path must be a file or directory: ${inputPath}`);
  }

  return fs
    .readdirSync(resolvedPath)
    .filter((entry) => !entry.startsWith('.'))
    .map((entry) => path.join(resolvedPath, entry))
    .filter((entryPath) => fs.statSync(entryPath).isFile())
    .sort((left, right) => left.localeCompare(right));
}

function stageContainerFile(filePath, itemDir) {
  const fileName = path.basename(filePath);
  const storedPath = path.join(itemDir, fileName);
  fs.copyFileSync(filePath, storedPath);
  const stat = fs.statSync(storedPath);

  return {
    fileName,
    originalPath: path.resolve(filePath),
    storedPath,
    size: stat.size,
    sha256: hashFile(storedPath),
    addedAt: new Date().toISOString(),
  };
}

function stageDataFile(dataFilePath, itemDir) {
  const fileName = path.basename(dataFilePath);
  const storedPath = path.join(itemDir, fileName);
  fs.copyFileSync(dataFilePath, storedPath);
  return {
    fileName,
    originalPath: path.resolve(dataFilePath),
    storedPath,
  };
}

function readStructuredDataFile(dataFilePath) {
  const resolvedPath = path.resolve(dataFilePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Container data file does not exist: ${dataFilePath}`);
  }
  return JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
}

function expandStructuredEntries(structuredData) {
  if (Array.isArray(structuredData)) {
    return structuredData;
  }
  if (isObject(structuredData) && Array.isArray(structuredData.items)) {
    return structuredData.items;
  }
  return [structuredData];
}

function normalizeStructuredRequest({
  raw,
  requester,
  defaultAction,
  defaultDealLookup,
  defaultDocumentKey,
}) {
  const source = isObject(raw.request) ? raw.request : raw;
  const answers = mergeAnswers(
    {
      documentKey: source.documentKey ?? raw.documentKey ?? defaultDocumentKey ?? null,
      document: normalizeDocumentAnswers(source.document ?? raw.document ?? source),
      lines: source.lines ?? raw.lines ?? [],
      followUpActions: source.followUpActions ?? raw.followUpActions ?? [],
      send: source.send ?? raw.send ?? {},
      contact: source.contact ?? raw.contact ?? {},
    },
    source.answers ?? raw.answers ?? {},
  );

  return {
    requester: source.requester ?? raw.requester ?? requester ?? null,
    action: source.action ?? raw.action ?? defaultAction ?? null,
    intent: source.intent ?? raw.intent ?? null,
    dealLookup:
      normalizeLookupValue(source.dealLookup ?? raw.dealLookup ?? raw.deal) ??
      defaultDealLookup ??
      {},
    selectedMappings:
      isObject(source.selectedMappings) ? source.selectedMappings : {},
    answers,
    constraints: isObject(source.constraints) ? source.constraints : {},
  };
}

function normalizeDocumentAnswers(source) {
  if (!isObject(source)) {
    return {};
  }

  return {
    docDate: source.docDate ?? source.doc_date ?? null,
    dueDate: source.dueDate ?? source.due_date ?? null,
    currency: source.currency ?? null,
    headerDiscountPct:
      source.headerDiscountPct ?? source.header_discount_pct ?? null,
    notes: source.notes ?? null,
    seriesId: source.seriesId ?? source.series_id ?? null,
  };
}

function mergeAnswers(base, override) {
  const merged = {
    ...base,
    ...override,
  };

  for (const nestedKey of ['document', 'send', 'contact']) {
    if (isObject(base[nestedKey]) || isObject(override[nestedKey])) {
      merged[nestedKey] = {
        ...(isObject(base[nestedKey]) ? base[nestedKey] : {}),
        ...(isObject(override[nestedKey]) ? override[nestedKey] : {}),
      };
    }
  }

  if (Array.isArray(override.lines)) {
    merged.lines = override.lines;
  } else if (Array.isArray(base.lines)) {
    merged.lines = base.lines;
  }

  if (Array.isArray(override.followUpActions)) {
    merged.followUpActions = override.followUpActions;
  } else if (Array.isArray(base.followUpActions)) {
    merged.followUpActions = base.followUpActions;
  }

  return compactObject(merged);
}

function resolveSourceMode({ sourceMode, hasFiles, hasStructuredData }) {
  if (!VALID_SOURCE_MODES.has(sourceMode)) {
    throw new Error(
      `--container-source must be one of: ${[...VALID_SOURCE_MODES].join(', ')}`,
    );
  }
  if (sourceMode !== 'auto') {
    return sourceMode;
  }
  if (hasFiles && hasStructuredData) {
    return 'mixed';
  }
  if (hasStructuredData) {
    return 'structured';
  }
  return 'deliverable';
}

function actionForDocumentKind(kind) {
  const normalizedKind = normalizeKindOrNull(kind);
  if (normalizedKind === 'quote') {
    return 'create_quote';
  }
  if (normalizedKind === 'invoice') {
    return 'create_invoice';
  }
  return null;
}

function documentKindForAction(action) {
  if (!action) {
    return null;
  }
  if (String(action).includes('quote')) {
    return 'quote';
  }
  if (String(action).includes('invoice')) {
    return 'invoice';
  }
  return null;
}

function normalizeKind(kind) {
  const normalizedKind = normalizeKindOrNull(kind);
  if (!normalizedKind) {
    throw new Error('--container-kind must be quote or invoice.');
  }
  return normalizedKind;
}

function normalizeKindOrNull(kind) {
  if (!kind) {
    return null;
  }
  const normalizedKind = String(kind).trim().toLowerCase();
  if (!VALID_KINDS.has(normalizedKind)) {
    throw new Error('--container-kind must be quote or invoice.');
  }
  return normalizedKind;
}

function normalizeLookupValue(value) {
  if (!value) {
    return null;
  }
  if (isObject(value)) {
    return value;
  }
  const lookup = String(value).trim();
  if (!lookup) {
    return null;
  }
  if (/^https?:\/\//i.test(lookup) || lookup.includes('/opportunities/')) {
    return { opportunityUrl: lookup };
  }
  if (
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
      lookup,
    )
  ) {
    return { opportunityId: lookup.match(/[0-9a-f-]{36}/i)[0] };
  }
  return { search: lookup };
}

function createContainerItemId() {
  return `aikountfile_${new Date().toISOString().replace(/[:.]/g, '-')}_${crypto
    .randomUUID()
    .slice(0, 8)}`;
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, child]) => child !== null && child !== undefined && child !== '',
    ),
  );
}

function buildContainerAddEntries({ inputFiles, structuredEntries }) {
  if (!inputFiles.length) {
    return structuredEntries.map((structuredEntry) => ({
      filePath: null,
      structuredData: structuredEntry,
    }));
  }

  return inputFiles.map((filePath, index) => ({
    filePath,
    structuredData: matchStructuredEntryForFile({
      filePath,
      index,
      inputFiles,
      structuredEntries,
    }),
  }));
}

function matchStructuredEntryForFile({
  filePath,
  index,
  inputFiles,
  structuredEntries,
}) {
  if (!structuredEntries.length) {
    return null;
  }
  if (structuredEntries.length === 1) {
    return structuredEntries[0];
  }

  const fileName = path.basename(filePath);
  const byName = structuredEntries.find((entry) => {
    const candidate = entry.fileName ?? entry.file ?? entry.path ?? null;
    return candidate && path.basename(String(candidate)) === fileName;
  });
  if (byName) {
    return byName;
  }

  if (structuredEntries.length === inputFiles.length) {
    return structuredEntries[index];
  }

  return null;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

import fs from 'node:fs';
import path from 'node:path';

const DOC_CANDIDATES = [
  {
    path: 'packages/twenty-docs/developers/extend/api.mdx',
    topics: ['api', 'rest', 'graphql', 'metadata', 'authentication'],
  },
  {
    path: 'packages/twenty-docs/developers/extend/capabilities/apis.mdx',
    topics: ['api', 'rest', 'graphql', 'metadata', 'batch'],
  },
  {
    path: 'packages/twenty-docs/user-guide/data-model/capabilities/objects.mdx',
    topics: ['opportunity', 'person', 'company', 'note', 'task', 'relationship'],
  },
  {
    path: 'packages/twenty-docs/user-guide/data-model/capabilities/fields.mdx',
    topics: ['field', 'custom field', 'select', 'metadata', 'option'],
  },
  {
    path: 'packages/twenty-docs/user-guide/data-migration/capabilities/field-mapping.mdx',
    topics: ['select', 'option', 'email', 'domain', 'field'],
  },
  {
    path: 'packages/twenty-docs/user-guide/workflows/overview.mdx',
    topics: ['workflow', 'automation'],
  },
  {
    path: 'packages/twenty-docs/user-guide/workflows/capabilities/workflow-actions.mdx',
    topics: ['workflow', 'action', 'update record', 'search records'],
  },
  {
    path: 'packages/twenty-docs/user-guide/workflows/how-tos/crm-automations/display-related-record-data.mdx',
    topics: ['workflow', 'note', 'task', 'relationship', 'api'],
  },
];

export function retrieveTwentyDocs({ request, cwd = process.cwd(), limit = 6 }) {
  const queryText = [
    request.intent,
    request.requestText,
    ...request.operations.map((operation) => operation.type),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const scored = DOC_CANDIDATES.map((candidate) => {
    const absolutePath = path.resolve(cwd, candidate.path);
    if (!fs.existsSync(absolutePath)) return null;

    const raw = fs.readFileSync(absolutePath, 'utf8');
    const lower = raw.toLowerCase();
    const topicScore = candidate.topics.filter((topic) =>
      queryText.includes(topic),
    ).length;
    const contentScore = candidate.topics.filter((topic) =>
      lower.includes(topic),
    ).length;

    return {
      ...candidate,
      absolutePath,
      raw,
      score: topicScore * 3 + contentScore,
    };
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);

  return scored.map((doc) => ({
    path: doc.path,
    reason: reasonForDoc(doc),
    summary: summarizeDoc(doc.raw),
    implications: implicationsForDoc(doc.path),
  }));
}

function reasonForDoc(doc) {
  if (doc.path.includes('/api')) return 'Core API / Metadata API reference.';
  if (doc.path.includes('/data-model/')) return 'Twenty object and field model.';
  if (doc.path.includes('/data-migration/')) {
    return 'Field value and select option format rules.';
  }
  if (doc.path.includes('/workflows/')) {
    return 'Workflow capability and v1 out-of-scope assessment.';
  }
  return 'Relevant Twenty local documentation.';
}

function summarizeDoc(raw) {
  const text = raw
    .replace(/^---[\s\S]*?---/m, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return text.slice(0, 360);
}

function implicationsForDoc(pathName) {
  if (pathName.includes('/developers/extend/')) {
    return [
      'Use Core API for CRM records.',
      'Use Metadata API for schema discovery only.',
      'Do not mutate metadata in v1.',
    ];
  }
  if (pathName.includes('/data-model/')) {
    return [
      'Validate object and field names against live metadata.',
      'Treat notes and tasks as linkable CRM objects.',
    ];
  }
  if (pathName.includes('/data-migration/')) {
    return ['Use API names for select values; do not create options implicitly.'];
  }
  if (pathName.includes('/workflows/')) {
    return ['Workflow editing is out of scope for CRM Execution Crew v1.'];
  }
  return [];
}


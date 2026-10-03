const OBJECT_TOOLS = [
  ['company', 'companies'],
  ['person', 'people'],
  ['opportunity', 'opportunities'],
  ['project', 'projects'],
  ['task', 'tasks'],
  ['note', 'notes'],
];

export const PROTOCOL_TOOL_NAMES = new Set([
  'get_tool_catalog',
  'learn_tools',
  'execute_tool',
]);

export const TARGET_TOOL_CONFIG = Object.freeze({
  create_note_target: {
    sourceId: 'noteId',
    restPath: '/rest/noteTargets',
    responseKey: 'createNoteTarget',
  },
  create_task_target: {
    sourceId: 'taskId',
    restPath: '/rest/taskTargets',
    responseKey: 'createTaskTarget',
  },
});

export const TARGET_ID_NAMES = Object.freeze([
  'targetProjectId',
  'targetCompanyId',
  'targetOpportunityId',
  'targetPersonId',
  'targetBusinessLineId',
]);

export const ALLOWED_DATABASE_TOOL_NAMES = new Set([
  ...OBJECT_TOOLS.flatMap(([singular, plural]) => [
    `find_${plural}`,
    `find_one_${singular}`,
    `create_${singular}`,
    `update_${singular}`,
  ]),
  'find_note_targets',
  'find_one_note_target',
  'create_note_target',
  'find_task_targets',
  'find_one_task_target',
  'create_task_target',
]);

export function isAllowedDatabaseTool(name) {
  return typeof name === 'string' && ALLOWED_DATABASE_TOOL_NAMES.has(name);
}

export function filterProtocolTools(envelope) {
  if (!Array.isArray(envelope?.result?.tools)) return envelope;

  return {
    ...envelope,
    result: {
      ...envelope.result,
      tools: envelope.result.tools.filter((tool) =>
        PROTOCOL_TOOL_NAMES.has(tool?.name),
      ),
    },
  };
}

export function filterCatalogEnvelope(envelope) {
  return rewriteTextResult(envelope, (payload) => {
    if (!payload?.catalog || typeof payload.catalog !== 'object') return payload;

    const catalog = Object.fromEntries(
      Object.entries(payload.catalog).map(([category, tools]) => [
        category,
        Array.isArray(tools)
          ? tools.filter((tool) => isAllowedDatabaseTool(tool?.name))
          : [],
      ]),
    );
    const count = Object.values(catalog).reduce(
      (total, tools) => total + tools.length,
      0,
    );

    return {
      ...payload,
      catalog,
      message: `Found ${count} CRM tool(s) available through Skilland CRM.`,
    };
  });
}

export function filterAndPatchLearnEnvelope(envelope, deniedNames = []) {
  return rewriteTextResult(envelope, (payload) => {
    if (!Array.isArray(payload?.tools)) return payload;

    const tools = payload.tools
      .filter((tool) => isAllowedDatabaseTool(tool?.name))
      .map((tool) =>
        TARGET_TOOL_CONFIG[tool.name]
          ? patchTargetCreateTool(tool, TARGET_TOOL_CONFIG[tool.name])
          : tool,
      );
    const notFound = [...new Set([...(payload.notFound ?? []), ...deniedNames])];

    return {
      ...payload,
      tools,
      notFound,
      message:
        notFound.length > 0
          ? `Learned ${tools.length} tool(s). Unavailable: ${notFound.join(', ')}.`
          : `Learned ${tools.length} tool(s): ${tools.map((tool) => tool.name).join(', ')}.`,
    };
  });
}

export function patchInitializeEnvelope(envelope) {
  if (!envelope?.result || typeof envelope.result !== 'object') return envelope;

  return {
    ...envelope,
    result: {
      ...envelope.result,
      serverInfo: {
        name: 'Skilland Twenty CRM Connector',
        version: '1.0.0',
      },
      instructions:
        'Thin connector for Skilland CRM. Use get_tool_catalog, then learn_tools, then execute_tool. Only Companies, People, Opportunities, Projects, Tasks, Notes and their targets are exposed. Relationship writes use UUID fields ending in Id.',
    },
  };
}

export function buildExecuteToolDeniedEnvelope(id, toolName) {
  return buildToolResultEnvelope(id, {
    toolName,
    error: {
      message: `Tool "${String(toolName)}" is not exposed by Skilland CRM.`,
      suggestion: 'Use get_tool_catalog to see the available CRM tools.',
    },
  });
}

export function buildToolResultEnvelope(id, payload, { isError = false } = {}) {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      content: [{ type: 'text', text: JSON.stringify(payload) }],
      isError,
    },
  };
}

export function validateTargetCreateArguments(toolName, input) {
  const config = TARGET_TOOL_CONFIG[toolName];

  if (!config) throw new Error(`Unsupported target tool: ${toolName}`);
  if (!isPlainObject(input)) throw new Error('Relationship arguments must be an object.');

  const allowedKeys = new Set([
    config.sourceId,
    ...TARGET_ID_NAMES,
    'position',
  ]);
  const unknown = Object.keys(input).filter((key) => !allowedKeys.has(key));

  if (unknown.length > 0) {
    throw new Error(`Unknown relationship fields: ${unknown.join(', ')}.`);
  }

  if (!isUuid(input[config.sourceId])) {
    throw new Error(`${config.sourceId} must be a UUID.`);
  }

  const targetKeys = TARGET_ID_NAMES.filter((key) => input[key] !== undefined);

  if (targetKeys.length !== 1) {
    throw new Error('Provide exactly one target UUID field ending in Id.');
  }
  if (!isUuid(input[targetKeys[0]])) {
    throw new Error(`${targetKeys[0]} must be a UUID.`);
  }
  if (
    input.position !== undefined &&
    typeof input.position !== 'number' &&
    !['first', 'last'].includes(input.position)
  ) {
    throw new Error('position must be a number, "first", or "last".');
  }

  return {
    config,
    payload: Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    ),
  };
}

function patchTargetCreateTool(tool, config) {
  const inputSchema = tool.inputSchema ?? {};
  const properties = Object.fromEntries(
    Object.entries(inputSchema.properties ?? {}).map(([name, schema]) => {
      if (!name.startsWith('target') || name.endsWith('Id')) return [name, schema];

      return [
        `${name}Id`,
        {
          ...schema,
          type: 'string',
          format: 'uuid',
          description: `${schema?.description ?? name} record UUID`,
        },
      ];
    }),
  );
  const targetIds = Object.keys(properties).filter(
    (name) => name.startsWith('target') && name.endsWith('Id'),
  );

  return {
    ...tool,
    description: `${tool.description} Use one target UUID field ending in Id.`,
    inputSchema: {
      ...inputSchema,
      type: 'object',
      properties,
      required: [config.sourceId],
      oneOf: targetIds.map((name) => ({ required: [name] })),
      additionalProperties: false,
    },
  };
}

function rewriteTextResult(envelope, transform) {
  const content = envelope?.result?.content;

  if (!Array.isArray(content)) return envelope;

  let changed = false;
  const rewritten = content.map((item) => {
    if (item?.type !== 'text' || typeof item.text !== 'string') return item;

    try {
      const payload = JSON.parse(item.text);
      const next = transform(payload);

      changed = true;
      return { ...item, text: JSON.stringify(next) };
    } catch {
      return item;
    }
  });

  if (!changed) return envelope;

  return {
    ...envelope,
    result: { ...envelope.result, content: rewritten },
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}

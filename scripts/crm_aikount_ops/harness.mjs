#!/usr/bin/env node

import fs from 'node:fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { collectInteractiveRequest, createReadlineInterviewer } from './kernel/interviewer.mjs';
import { formatAikountOpsResult, renderReviewMarkdown } from './kernel/formatter.mjs';
import {
  addFileContainerItems,
  buildRequestFromContainerItem,
  formatFileContainerItems,
  loadFileContainer,
  recordFileContainerAttempt,
  saveFileContainer,
  selectFileContainerItems,
} from './kernel/file-container.mjs';
import { CrmAikountLogger, DEFAULT_OUTPUT_DIR } from './kernel/logger.mjs';
import { parseAikountActionRequest } from './kernel/contracts.mjs';
import {
  AikountClient,
  readAikountCredentials,
} from './kernel/aikount-client.mjs';
import { runCrmAikountOps } from './workflows/crm-aikount-ops.workflow.mjs';
import {
  TwentyClient,
  readTwentyCredentials,
} from '../crm_manual_update_crew/twenty-client.mjs';

function parseArgs(argv) {
  const args = {
    requestFile: null,
    apply: false,
    yes: false,
    outputDir: undefined,
    containerAdd: null,
    containerDataFile: null,
    containerList: false,
    containerRegister: false,
    containerItemIds: [],
    containerKind: null,
    containerSource: 'auto',
    containerDeal: null,
    containerDocumentKey: null,
    containerTitle: null,
    containerNotes: null,
    containerAction: null,
    containerLimit: null,
    containerIncludeBlocked: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--request-file=')) {
      args.requestFile = arg.slice('--request-file='.length);
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--dry-run') {
      args.apply = false;
    } else if (arg === '--yes') {
      args.yes = true;
    } else if (arg.startsWith('--output-dir=')) {
      args.outputDir = arg.slice('--output-dir='.length);
    } else if (arg.startsWith('--container-add=')) {
      args.containerAdd = arg.slice('--container-add='.length);
    } else if (arg.startsWith('--container-data-file=')) {
      args.containerDataFile = arg.slice('--container-data-file='.length);
    } else if (arg === '--container-list') {
      args.containerList = true;
    } else if (arg === '--container-register') {
      args.containerRegister = true;
    } else if (arg.startsWith('--container-item=')) {
      args.containerItemIds.push(
        ...arg
          .slice('--container-item='.length)
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      );
    } else if (arg.startsWith('--container-kind=')) {
      args.containerKind = arg.slice('--container-kind='.length);
    } else if (arg.startsWith('--container-source=')) {
      args.containerSource = arg.slice('--container-source='.length);
    } else if (arg.startsWith('--container-deal=')) {
      args.containerDeal = arg.slice('--container-deal='.length);
    } else if (arg.startsWith('--container-document-key=')) {
      args.containerDocumentKey = arg.slice('--container-document-key='.length);
    } else if (arg.startsWith('--container-title=')) {
      args.containerTitle = arg.slice('--container-title='.length);
    } else if (arg.startsWith('--container-notes=')) {
      args.containerNotes = arg.slice('--container-notes='.length);
    } else if (arg.startsWith('--container-action=')) {
      args.containerAction = arg.slice('--container-action='.length);
    } else if (arg.startsWith('--container-limit=')) {
      args.containerLimit = Number(arg.slice('--container-limit='.length));
    } else if (arg === '--container-include-blocked') {
      args.containerIncludeBlocked = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.yes && !args.apply) {
    throw new Error('--yes only applies with --apply.');
  }
  if (
    args.containerLimit !== null &&
    (!Number.isInteger(args.containerLimit) || args.containerLimit < 1)
  ) {
    throw new Error('--container-limit must be a positive integer.');
  }

  const containerCommands = [
    Boolean(args.containerAdd || args.containerDataFile),
    args.containerList,
    args.containerRegister,
  ].filter(Boolean).length;
  if (containerCommands > 1) {
    throw new Error('Use only one container command at a time.');
  }
  if (containerCommands && args.requestFile) {
    throw new Error('--request-file cannot be combined with container commands.');
  }

  return args;
}

function printHelp() {
  console.log(`CRM AIKount Ops

Usage:
  yarn crm:aikount
  yarn crm:aikount --apply
  yarn crm:aikount --request-file=path/to/request.json
  yarn crm:aikount --request-file=path/to/request.json --apply --yes

Container:
  yarn crm:aikount --container-add=path/to/file-or-dir --container-kind=quote
  yarn crm:aikount --container-add=path/to/file.pdf --container-data-file=path/to/data.json --container-kind=invoice
  yarn crm:aikount --container-data-file=path/to/data.json --container-kind=quote
  yarn crm:aikount --container-list
  yarn crm:aikount --container-register --container-kind=quote
  yarn crm:aikount --container-register --container-item=aikountfile_... --apply --yes

Dry-run is the default. APPLY requires --apply and confirmation.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rl = readline.createInterface({ input, output });
  const interviewer = createReadlineInterviewer(rl);
  const outputDir = args.outputDir ?? DEFAULT_OUTPUT_DIR;

  try {
    if (args.containerAdd || args.containerDataFile) {
      const addedItems = addFileContainerItems({
        outputDir,
        inputPath: args.containerAdd,
        dataFilePath: args.containerDataFile,
        kind: args.containerKind,
        sourceMode: args.containerSource,
        dealLookup: args.containerDeal,
        documentKey: args.containerDocumentKey,
        title: args.containerTitle,
        notes: args.containerNotes,
        requester: process.env.USER ?? 'codex',
        requestedAction: args.containerAction,
      });
      console.log(`Añadidos ${addedItems.length} item(s) al contenedor AIKount.`);
      console.log(formatFileContainerItems(addedItems));
      return;
    }

    if (args.containerList) {
      const container = loadFileContainer(outputDir);
      console.log(formatFileContainerItems(container.items));
      return;
    }

    if (args.containerRegister) {
      await registerContainerItems({ args, interviewer, outputDir });
      return;
    }

    const rawRequest = args.requestFile
      ? JSON.parse(fs.readFileSync(args.requestFile, 'utf8'))
      : await collectInteractiveRequest({
          interviewer,
          defaultRequester: process.env.USER ?? 'codex',
          applyRequested: args.apply,
        });
    const finalResult = await runSingleRequest({
      rawRequest,
      args,
      interviewer: args.requestFile ? null : interviewer,
      outputDir,
    });

    console.log(formatAikountOpsResult(finalResult));
    if (finalResult.status === 'blocked') {
      process.exitCode = 1;
    }
  } finally {
    rl.close();
  }
}

async function registerContainerItems({ args, interviewer, outputDir }) {
  const container = loadFileContainer(outputDir);
  const items = selectFileContainerItems({
    container,
    itemIds: args.containerItemIds,
    kind: args.containerKind,
    includeBlocked: args.containerIncludeBlocked,
    limit: args.containerLimit,
  });

  if (!items.length) {
    console.log('No hay items pendientes en el contenedor para registrar.');
    return;
  }

  let blockedCount = 0;
  for (const item of items) {
    console.log(`\nRegistrando item del contenedor: ${item.id}`);
    try {
      const rawRequest = buildRequestFromContainerItem({
        item,
        requester: process.env.USER ?? 'codex',
        mode: args.apply ? 'apply' : 'dry_run',
      });
      const finalResult = await runSingleRequest({
        rawRequest,
        args,
        interviewer,
        outputDir,
      });

      recordFileContainerAttempt(container, item.id, {
        requestId: finalResult.requestId,
        action: finalResult.request.action,
        effectiveMode: finalResult.effectiveMode,
        status: finalResult.status,
        logPath: finalResult.logPath,
        reviewPath: finalResult.reviewPath,
      });
      saveFileContainer(outputDir, container);
      console.log(formatAikountOpsResult(finalResult));
      if (finalResult.status === 'blocked') {
        blockedCount += 1;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      blockedCount += 1;
      recordFileContainerAttempt(container, item.id, {
        effectiveMode: args.apply ? 'apply' : 'dry_run',
        status: 'blocked',
        error: message,
      });
      saveFileContainer(outputDir, container);
      console.error(`Bloqueado ${item.id}: ${message}`);
    }
  }

  if (blockedCount > 0) {
    process.exitCode = 1;
  }
}

async function runSingleRequest({
  rawRequest,
  args,
  interviewer,
  outputDir,
}) {
  const request = parseAikountActionRequest({
    ...rawRequest,
    mode: args.apply ? 'apply' : rawRequest.mode ?? 'dry_run',
  });

  const logger = new CrmAikountLogger({ outputDir });
  const twentyClient = new TwentyClient(readTwentyCredentials());
  const aikountClient = new AikountClient(readAikountCredentials());
  const effectiveMode = args.apply ? 'apply' : 'dry_run';

  const result = await runCrmAikountOps({
    request,
    twentyClient,
    aikountClient,
    effectiveMode,
    confirmationProvided: args.yes,
    interviewer,
    outputDir: logger.outputDir,
  });

  const reviewMarkdown = renderReviewMarkdown({
    ...result,
    requestId: request.requestId,
    effectiveMode,
  });
  const { logPath, reviewPath } = logger.finish({
    requestId: request.requestId,
    requester: request.requester,
    effectiveMode,
    request,
    crmSnapshot: result.crmSnapshot,
    agentArtifacts: result.agentArtifacts,
    operationPlan: result.operationPlan,
    review: result.review,
    executionResult: result.executionResult,
    warnings: result.warnings,
    blockingIssues: result.blockingIssues,
    reviewMarkdown,
  });

  return {
    ...result,
    requestId: request.requestId,
    effectiveMode,
    logPath,
    reviewPath,
  };
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

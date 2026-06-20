#!/usr/bin/env node

import fs from 'node:fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { collectInteractiveRequest, createReadlineInterviewer } from './kernel/interviewer.mjs';
import { formatAikountOpsResult, renderReviewMarkdown } from './kernel/formatter.mjs';
import { CrmAikountLogger } from './kernel/logger.mjs';
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

  return args;
}

function printHelp() {
  console.log(`CRM AIKount Ops

Usage:
  yarn crm:aikount
  yarn crm:aikount --apply
  yarn crm:aikount --request-file=path/to/request.json
  yarn crm:aikount --request-file=path/to/request.json --apply --yes

Dry-run is the default. APPLY requires --apply and confirmation.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rl = readline.createInterface({ input, output });
  const interviewer = createReadlineInterviewer(rl);
  const logger = new CrmAikountLogger({ outputDir: args.outputDir });

  try {
    const rawRequest = args.requestFile
      ? JSON.parse(fs.readFileSync(args.requestFile, 'utf8'))
      : await collectInteractiveRequest({
          interviewer,
          defaultRequester: process.env.USER ?? 'codex',
          applyRequested: args.apply,
        });
    const request = parseAikountActionRequest({
      ...rawRequest,
      mode: args.apply ? 'apply' : rawRequest.mode ?? 'dry_run',
    });

    const twentyClient = new TwentyClient(readTwentyCredentials());
    const aikountClient = new AikountClient(readAikountCredentials());
    const effectiveMode = args.apply ? 'apply' : 'dry_run';

    const result = await runCrmAikountOps({
      request,
      twentyClient,
      aikountClient,
      effectiveMode,
      confirmationProvided: args.yes,
      interviewer: args.requestFile ? null : interviewer,
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

    const finalResult = {
      ...result,
      requestId: request.requestId,
      effectiveMode,
      logPath,
      reviewPath,
    };

    console.log(formatAikountOpsResult(finalResult));
    if (finalResult.status === 'blocked') {
      process.exitCode = 1;
    }
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

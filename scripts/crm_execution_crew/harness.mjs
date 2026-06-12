#!/usr/bin/env node

import fs from 'node:fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { parseCrmActionRequest } from './kernel/contracts.mjs';
import { formatCrewResult, operationSummary } from './kernel/formatter.mjs';
import { CrmExecutionLogger } from './kernel/logger.mjs';
import { runDeterministicKernel } from './kernel/orchestrator.mjs';
import { runCrmExecutionCrew } from './workflows/crm-execution.workflow.mjs';
import {
  readTwentyCredentials,
  TwentyClient,
} from '../crm_manual_update_crew/twenty-client.mjs';

function parseArgs(argv) {
  const args = {
    requestFile: null,
    apply: false,
    dryRun: false,
    yes: false,
    outputDir: undefined,
    agentic: true,
  };

  for (const arg of argv) {
    if (arg.startsWith('--request-file=')) {
      args.requestFile = arg.slice('--request-file='.length);
    } else if (arg === '--apply') {
      args.apply = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--yes') {
      args.yes = true;
    } else if (arg.startsWith('--output-dir=')) {
      args.outputDir = arg.slice('--output-dir='.length);
    } else if (arg === '--agentic') {
      args.agentic = true;
    } else if (arg === '--deterministic') {
      args.agentic = false;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.requestFile) throw new Error('--request-file is required.');
  if (args.apply && args.dryRun) throw new Error('Use only one of --apply or --dry-run.');
  if (args.yes && !args.apply) throw new Error('--yes only applies with --apply.');

  return args;
}

function printHelp() {
  console.log(`CRM Execution Crew

Usage:
  yarn crm:execute --request-file=scripts/crm_execution_crew/examples/update-opportunity-note.request.json
  yarn crm:execute --request-file=... --dry-run
  yarn crm:execute --request-file=... --apply
  yarn crm:execute --request-file=... --apply --yes
  yarn crm:execute --request-file=... --agentic
  yarn crm:execute --request-file=... --deterministic

Dry-run is the default. Writes require --apply and, when requested by the
request constraints, --yes or interactive confirmation.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const request = parseCrmActionRequest(
    JSON.parse(fs.readFileSync(args.requestFile, 'utf8')),
  );
  const effectiveMode = args.apply ? 'apply' : 'dry_run';
  const client = createTwentyClient();
  const logger = new CrmExecutionLogger({ outputDir: args.outputDir });

  const result = args.agentic
    ? await runCrmExecutionCrew({
        request,
        client,
        effectiveMode,
        applyRequested: args.apply,
        confirmationProvided: args.yes,
        outputDir: args.outputDir,
        logger,
        canRequestConfirmation:
          effectiveMode === 'apply' && !args.yes && process.stdin.isTTY
            ? askForConfirmation
            : null,
      })
    : await runDeterministic({
        request,
        client,
        effectiveMode,
        applyRequested: args.apply,
        confirmationProvided: args.yes,
        logger,
      });

  console.log(formatCrewResult(result));
  if (result.status === 'blocked' || result.status === 'failed') {
    process.exitCode = 1;
  }
}

function createTwentyClient() {
  try {
    return new TwentyClient(readTwentyCredentials());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Twenty credentials are required for CRM Execution Crew runtime. ${message}`,
    );
  }
}

async function runDeterministic({
  request,
  client,
  effectiveMode,
  applyRequested,
  confirmationProvided,
  logger,
}) {
  const deterministic = await runDeterministicKernel({
    request,
    client,
    effectiveMode,
    applyRequested,
    confirmationProvided,
  });
  const agentArtifacts = [
    deterministic.metadataArtifact,
    deterministic.recordArtifact,
    deterministic.review,
    deterministic.executionArtifact,
  ];
  const warnings = agentArtifacts.flatMap((artifact) => artifact.warnings ?? []);
  const blockingIssues = agentArtifacts.flatMap(
    (artifact) => artifact.blockingIssues ?? [],
  );
  const logPath = logger.finish({
    requestId: request.requestId,
    requester: request.requester,
    effectiveMode,
    request,
    agentArtifacts,
    operationPlan: deterministic.operationPlan,
    review: deterministic.review,
    executionResult: deterministic.executionResult,
    warnings,
    blockingIssues,
  });

  return {
    requestId: request.requestId,
    requester: request.requester,
    effectiveMode,
    status: deterministic.review.approved
      ? deterministic.executionResult.status
      : 'blocked',
    agentArtifacts,
    operationPlan: deterministic.operationPlan,
    review: deterministic.review,
    executionResult: deterministic.executionResult,
    warnings,
    blockingIssues,
    logPath,
  };
}

async function askForConfirmation({ operationPlan }) {
  console.log('\nPlan validado para APPLY:');
  for (const operation of operationPlan.operations) {
    console.log(`- ${operationSummary(operation)}`);
  }

  const rl = readline.createInterface({ input, output });
  try {
    const answer = await rl.question('\nConfirmas la ejecucion? [y/N] ');
    return ['y', 'yes', 's', 'si'].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});


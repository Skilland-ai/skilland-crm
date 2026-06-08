#!/usr/bin/env node

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { executeOperations } from './executor.mjs';
import {
  operationSummary,
  printDealContext,
  printOperations,
} from './formatter.mjs';
import { SessionLogger } from './logger.mjs';
import { fetchCrmMetadata } from './metadata.mjs';
import { planOperationsFromInput } from './planner.mjs';
import {
  fetchBusinessLines,
  fetchOpportunities,
  filterOpportunities,
} from './retriever.mjs';
import { TwentyClient, readTwentyCredentials } from './twenty-client.mjs';

function parseArgs(argv) {
  const args = {
    apply: false,
    limit: null,
    businessLine: null,
    stage: null,
    outputDir: undefined,
  };

  for (const arg of argv) {
    if (arg === '--apply') args.apply = true;
    else if (arg === '--dry-run') args.apply = false;
    else if (arg.startsWith('--limit=')) args.limit = Number(arg.slice(8));
    else if (arg.startsWith('--business-line=')) {
      args.businessLine = arg.slice('--business-line='.length);
    } else if (arg.startsWith('--stage=')) {
      args.stage = arg.slice('--stage='.length);
    } else if (arg.startsWith('--output-dir=')) {
      args.outputDir = arg.slice('--output-dir='.length);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error('--limit must be a positive integer.');
  }

  return args;
}

function printHelp() {
  console.log(`CRM Manual Update Crew

Usage:
  yarn crm:review
  yarn crm:review --apply
  yarn crm:review --business-line="SkilLand IA Mujeres"
  yarn crm:review --stage=POSSIBLE_OPPORTUNITY

Dry-run is the default. Writes require --apply and per-deal confirmation.
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const credentials = readTwentyCredentials();
  const client = new TwentyClient(credentials);
  const rl = readline.createInterface({ input, output });
  const filters = { businessLine: args.businessLine, stage: args.stage };
  const logger = new SessionLogger({
    outputDir: args.outputDir,
    apply: args.apply,
    filters,
  });

  try {
    console.log('CRM Manual Update Crew');
    console.log(args.apply ? 'Mode: APPLY' : 'Mode: DRY-RUN');

    const metadata = await fetchCrmMetadata(client);
    const businessLines = await fetchBusinessLines(client).catch(() => []);
    const opportunities = await fetchOpportunities(client, metadata);
    await completeMissingFilters({ rl, filters, businessLines, metadata });

    let deals = filterOpportunities(opportunities, filters);
    if (args.limit) deals = deals.slice(0, args.limit);

    logger.record({
      type: 'session_loaded',
      totalOpportunities: opportunities.length,
      reviewDeals: deals.length,
      filters,
    });

    console.log(`\nHe encontrado ${deals.length} deals para revisar.`);
    if (deals.length === 0) return;

    const summary = { reviewed: 0, skipped: 0, changed: 0, errors: 0 };

    for (let index = 0; index < deals.length; index += 1) {
      const deal = deals[index];
      const outcome = await reviewDeal({
        rl,
        client,
        deal,
        index,
        total: deals.length,
        metadata,
        apply: args.apply,
        logger,
      });

      summary.reviewed += 1;
      if (outcome === 'cancel') break;
      if (outcome === 'skip') summary.skipped += 1;
      if (outcome === 'changed') summary.changed += 1;
      if (outcome === 'error') summary.errors += 1;
    }

    logger.finish(summary);
    console.log(`\nSesion terminada. Log: ${logger.filePath}`);
  } finally {
    rl.close();
  }
}

async function completeMissingFilters({ rl, filters, businessLines, metadata }) {
  if (filters.businessLine || filters.stage) return;

  console.log('\nQue quieres revisar?');
  console.log('1. Deals por Business Line');
  console.log('2. Deals por Stage');
  const mode = await askLine(rl, 'Elige opcion [1-2]: ');

  if (mode.trim() === '1') {
    const selected = await askChoice(
      rl,
      'Business Lines disponibles',
      businessLines,
      (item) => item.name,
    );
    filters.businessLine = selected.name;
    return;
  }

  const selected = await askChoice(
    rl,
    'Stages disponibles',
    metadata.stageOptions,
    (item) => `${item.label} (${item.value})`,
  );
  filters.stage = selected.value;
}

async function reviewDeal({
  rl,
  client,
  deal,
  index,
  total,
  metadata,
  apply,
  logger,
}) {
  const pendingOperations = [];

  printDealContext({ deal, index, total, metadata });

  while (true) {
    const answer = await askLine(rl, '\nQue ha cambiado con este deal? ');
    const plan = await planOperationsFromInput({
      input: answer,
      deal,
      metadata,
      askChoice: (question, items, label) => askChoice(rl, question, items, label),
    });

    if (plan.control === 'empty') continue;
    if (plan.control === 'skip') {
      logger.record({ type: 'deal_skipped', dealId: deal.id, dealName: deal.name });
      return 'skip';
    }
    if (plan.control === 'cancel') {
      logger.record({ type: 'session_cancelled', dealId: deal.id });
      return 'cancel';
    }
    if (plan.control === 'summary') {
      printOperations(pendingOperations, { apply });
      continue;
    }
    if (plan.control === 'dry-run') {
      console.log(apply ? 'Esta sesion esta en APPLY.' : 'Esta sesion ya esta en DRY-RUN.');
      continue;
    }
    if (plan.control === 'confirm') {
      return confirmAndExecute({ rl, client, deal, pendingOperations, apply, logger });
    }

    pendingOperations.push(...plan.operations);
    for (const warning of plan.warnings) console.log(`Aviso: ${warning}`);
    printOperations(pendingOperations, { apply });

    const next = await askLine(
      rl,
      '\nConfirmar, seguir, descartar, skip o cancelar? ',
    );
    const normalized = next.trim().toLowerCase();
    if (['confirmar', 'confirm', 'y', 'yes', 'si', 's'].includes(normalized)) {
      return confirmAndExecute({ rl, client, deal, pendingOperations, apply, logger });
    }
    if (['descartar', 'discard'].includes(normalized)) {
      pendingOperations.length = 0;
      console.log('Cambios pendientes descartados.');
      continue;
    }
    if (['skip', 'saltar'].includes(normalized)) {
      logger.record({ type: 'deal_skipped', dealId: deal.id, dealName: deal.name });
      return 'skip';
    }
    if (['cancelar', 'cancel'].includes(normalized)) {
      logger.record({ type: 'session_cancelled', dealId: deal.id });
      return 'cancel';
    }
  }
}

async function confirmAndExecute({
  rl,
  client,
  deal,
  pendingOperations,
  apply,
  logger,
}) {
  if (pendingOperations.length === 0) {
    console.log('No hay cambios pendientes para este deal.');
    return 'skip';
  }

  printOperations(pendingOperations, { apply });
  const confirmation = await askLine(rl, '\nConfirmas estos cambios? [y/N] ');
  if (!['y', 'yes', 's', 'si'].includes(confirmation.trim().toLowerCase())) {
    console.log('No se ha escrito nada.');
    logger.record({
      type: 'deal_changes_rejected',
      dealId: deal.id,
      operations: pendingOperations.map(operationSummary),
    });
    return 'skip';
  }

  try {
    const results = await executeOperations({
      client,
      deal,
      operations: pendingOperations,
      apply,
    });
    logger.record({
      type: apply ? 'deal_changes_applied' : 'deal_changes_planned',
      dealId: deal.id,
      dealName: deal.name,
      operations: pendingOperations,
      results,
    });
    console.log(apply ? 'Cambios aplicados.' : 'DRY-RUN: no se escribio en CRM.');
    return 'changed';
  } catch (error) {
    logger.record({
      type: 'deal_changes_failed',
      dealId: deal.id,
      dealName: deal.name,
      operations: pendingOperations,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`Error aplicando cambios: ${error.message}`);
    return 'error';
  }
}

async function askChoice(rl, title, items, label) {
  if (items.length === 0) throw new Error(`No options available for ${title}`);

  console.log(`\n${title}:`);
  items.forEach((item, index) => {
    console.log(`${index + 1}. ${label(item)}`);
  });

  while (true) {
    const answer = await askLine(rl, 'Elige numero: ');
    const index = Number(answer.trim()) - 1;
    if (Number.isInteger(index) && items[index]) return items[index];
    console.log('Opcion no valida.');
  }
}

async function askLine(rl, question) {
  try {
    return await rl.question(question);
  } catch (error) {
    if (error?.message === 'readline was closed') return 'cancelar';
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createDefaultAdapters } from './adapters/index.mjs';
import { createJsonStderrLogger } from './logger.mjs';
import { routeRepoHandoff } from './router.mjs';

const MAX_HANDOFF_BYTES = 256 * 1024;

function parseArgs(argv) {
  if (argv.length !== 1 || !argv[0].startsWith('--handoff-file=')) {
    throw new Error('INVALID_CLI_ARGUMENTS');
  }
  const filename = argv[0].slice('--handoff-file='.length);
  if (!filename) throw new Error('INVALID_CLI_ARGUMENTS');
  return filename;
}

async function readBoundedHandoff(filename) {
  let handle;
  try {
    const linkStat = await fs.lstat(filename);
    if (linkStat.isSymbolicLink() || !linkStat.isFile()) {
      throw new Error('INVALID_HANDOFF_FILE');
    }
    if (linkStat.size < 2 || linkStat.size > MAX_HANDOFF_BYTES) {
      throw new Error('INVALID_HANDOFF_FILE');
    }
    handle = await fs.open(filename, 'r');
    const text = await handle.readFile({ encoding: 'utf8' });
    if (Buffer.byteLength(text, 'utf8') > MAX_HANDOFF_BYTES) {
      throw new Error('INVALID_HANDOFF_FILE');
    }
    return JSON.parse(text);
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function runHarness({
  argv = process.argv.slice(2),
  stdout = process.stdout,
  stderr = process.stderr,
  clock = () => new Date(),
} = {}) {
  const logger = createJsonStderrLogger({ stream: stderr, clock });
  let handoff = null;
  try {
    const filename = parseArgs(argv);
    handoff = await readBoundedHandoff(filename);
  } catch {
    logger.event('harness.input_rejected', { errorCode: 'INVALID_HANDOFF' });
  }

  const rootDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
  );
  let adapters = Object.freeze({});
  if (handoff !== null) {
    try {
      adapters = await createDefaultAdapters({ rootDir, clock });
    } catch {
      logger.event('harness.adapter_initialization_failed', {
        errorCode: 'EXECUTION_FAILED',
      });
    }
  }

  const result = await routeRepoHandoff(handoff, {
    rootDir,
    adapters,
    clock,
    logger,
  });
  stdout.write(`${JSON.stringify(result)}\n`);
  return result.status === 'succeeded' || result.status === 'simulated'
    ? 0
    : result.status === 'blocked'
      ? 2
      : 1;
}

const isDirectRun =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectRun) {
  runHarness()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch(() => {
      process.stderr.write(
        `${JSON.stringify({ event: 'harness.failed_closed', errorCode: 'EXECUTION_FAILED' })}\n`,
      );
      process.exitCode = 1;
    });
}

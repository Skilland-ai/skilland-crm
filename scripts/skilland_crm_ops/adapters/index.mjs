import { createReportCrmExportAdapter } from './report-crm-export.mjs';

export function createDefaultAdapters({
  rootDir,
  clock,
  crmReaderFactory,
  artifactStoreFactory,
} = {}) {
  return new Map([
    [
      'report.crm.export',
      createReportCrmExportAdapter({
        rootDir,
        clock,
        crmReaderFactory,
        artifactStoreFactory,
      }),
    ],
  ]);
}

export { createCrmExportArtifactStore } from './artifact-store.mjs';
export { SafeAdapterError } from './errors.mjs';
export {
  createLiveQueryOnlyCrmReader,
  QueryOnlyTwentyReader,
  readBoundLiveCrmConfig,
} from './query-only-twenty.mjs';

import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

import { SafeAdapterError } from './errors.mjs';

export const CRM_EXPORT_OUTPUT_DIRECTORY =
  '04_outputs/crm_manual_update_session';
export const CRM_EXPORT_MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;

export function createCrmExportArtifactStore({
  rootDir,
  fileSystem = fs,
} = {}) {
  if (typeof rootDir !== 'string' || !path.isAbsolute(rootDir)) {
    throw new SafeAdapterError(
      'CRM_EXPORT_ROOT_INVALID',
      'El artifact store requiere una raiz absoluta del repositorio.',
    );
  }

  return Object.freeze({
    async writeMarkdown({ requestId, markdown, requestedMaxBytes }) {
      assertRequestId(requestId);
      if (typeof markdown !== 'string') {
        throw new SafeAdapterError(
          'CRM_EXPORT_ARTIFACT_INVALID',
          'El contenido del artefacto debe ser texto Markdown.',
        );
      }

      const maxBytes = resolveMaxBytes(requestedMaxBytes);
      const sizeBytes = Buffer.byteLength(markdown, 'utf8');
      if (sizeBytes > maxBytes) {
        throw new SafeAdapterError(
          'CRM_EXPORT_ARTIFACT_TOO_LARGE',
          `El artefacto supera el limite efectivo de ${maxBytes} bytes.`,
        );
      }

      const rootReal = await fileSystem.realpath(rootDir).catch((error) => {
        throw new SafeAdapterError(
          'CRM_EXPORT_ROOT_UNAVAILABLE',
          'No se pudo resolver la raiz del repositorio para el artifact store.',
          { outcome: 'failed', cause: error },
        );
      });
      const expectedOutputDir = path.join(rootReal, CRM_EXPORT_OUTPUT_DIRECTORY);
      await fileSystem.mkdir(expectedOutputDir, { recursive: true, mode: 0o700 });
      const outputDir = await fileSystem.realpath(expectedOutputDir);

      if (outputDir !== expectedOutputDir || !isWithin(rootReal, outputDir)) {
        throw new SafeAdapterError(
          'CRM_EXPORT_OUTPUT_PATH_UNSAFE',
          'La ruta de salida no esta confinada a la raiz esperada del repositorio.',
        );
      }

      const basename = `crm_export_para_chatgpt_${requestId}.md`;
      const absolutePath = path.join(outputDir, basename);
      if (!isWithin(outputDir, absolutePath)) {
        throw new SafeAdapterError(
          'CRM_EXPORT_OUTPUT_PATH_UNSAFE',
          'La ruta calculada para el artefacto no es segura.',
        );
      }

      let handle = null;
      let created = false;
      try {
        handle = await fileSystem.open(absolutePath, 'wx', 0o600);
        created = true;
        await handle.writeFile(markdown, 'utf8');
        await handle.sync();
        const stat = await handle.stat();
        if ((stat.mode & 0o777) !== 0o600 || stat.size !== sizeBytes) {
          throw new SafeAdapterError(
            'CRM_EXPORT_ARTIFACT_VERIFICATION_FAILED',
            'El artefacto no supero la verificacion local de permisos o tamano.',
            { outcome: 'failed' },
          );
        }
        await handle.close();
        handle = null;
      } catch (error) {
        if (handle) await handle.close().catch(() => {});
        if (created) await fileSystem.unlink(absolutePath).catch(() => {});

        if (error?.code === 'EEXIST') {
          throw new SafeAdapterError(
            'CRM_EXPORT_ARTIFACT_EXISTS',
            'Ya existe un artefacto para este requestId; overwrite esta bloqueado.',
          );
        }
        if (error instanceof SafeAdapterError) throw error;
        throw new SafeAdapterError(
          'CRM_EXPORT_ARTIFACT_WRITE_FAILED',
          'No se pudo publicar el artefacto local de forma atomica y segura.',
          { outcome: 'failed', cause: error },
        );
      }

      return Object.freeze({
        relativePath: path
          .relative(rootReal, absolutePath)
          .split(path.sep)
          .join('/'),
        mediaType: 'text/markdown; charset=utf-8',
        sizeBytes,
        sha256: `sha256:${createHash('sha256').update(markdown).digest('hex')}`,
      });
    },
  });
}

function assertRequestId(requestId) {
  if (!/^[a-z][a-z0-9_-]*_[A-Za-z0-9_-]+$/.test(String(requestId ?? ''))) {
    throw new SafeAdapterError(
      'CRM_EXPORT_REQUEST_ID_INVALID',
      'El requestId no puede utilizarse para crear un artefacto seguro.',
    );
  }
}

function resolveMaxBytes(requestedMaxBytes) {
  if (requestedMaxBytes === undefined) return CRM_EXPORT_MAX_ARTIFACT_BYTES;
  if (!Number.isInteger(requestedMaxBytes) || requestedMaxBytes < 1) {
    throw new SafeAdapterError(
      'CRM_EXPORT_ARTIFACT_LIMIT_INVALID',
      'maxArtifactBytes debe ser un entero positivo.',
    );
  }
  return Math.min(requestedMaxBytes, CRM_EXPORT_MAX_ARTIFACT_BYTES);
}

function isWithin(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

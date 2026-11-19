import { PassThrough, Readable } from 'node:stream';
import { v2 as cloudinary } from 'cloudinary';

import { getCloudinary } from '../../config/cloudinary';
import { AppError } from '../../utils/AppError';
import { logger } from '../../utils/logger';
import type {
  MigrationStorageWriter,
  StorageDriver,
  StorageMeta,
  StorageObjectMetadata,
} from './StorageDriver';

const SAFE_PUBLIC_ID =
  /^dainty-bloom\/private-artwork\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\.(?:pdf|svg))?$/i;
const FORMAT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'image/svg+xml': 'svg',
};
const RAW_MIME_TYPES = new Set(['application/pdf', 'image/svg+xml']);
const PRIVATE_DOWNLOAD_TTL_SECONDS = 60;
const CLOUDINARY_NOT_FOUND = 'ARTWORK_ASSET_NOT_FOUND';

export function isValidCloudinaryArtworkKey(key: string): boolean {
  return SAFE_PUBLIC_ID.test(key);
}

export class CloudinaryArtworkDriver
  implements StorageDriver, MigrationStorageWriter
{
  constructor(
    private readonly cloudinaryClient: () => typeof cloudinary = getCloudinary,
  ) {}

  async put(
    publicId: string,
    buffer: Buffer,
    meta: StorageMeta,
  ): Promise<void> {
    return this.upload(publicId, buffer, meta, true);
  }

  async putForMigration(
    publicId: string,
    buffer: Buffer,
    meta: StorageMeta,
  ): Promise<void> {
    return this.upload(publicId, buffer, meta, false);
  }

  private async upload(
    publicId: string,
    buffer: Buffer,
    meta: StorageMeta,
    cleanupUnexpectedMetadata: boolean,
  ): Promise<void> {
    const resourceType = requireResourceType(publicId, meta);
    const format = FORMAT_BY_MIME[meta.contentType];
    if (!format) throw unsupportedArtworkType();

    try {
      const result = await uploadBuffer(
        this.cloudinaryClient(),
        publicId,
        buffer,
        resourceType,
        format,
      );
      if (
        result.public_id !== publicId ||
        result.resource_type !== resourceType ||
        result.type !== 'authenticated'
      ) {
        if (cleanupUnexpectedMetadata) {
          await this.delete(publicId, meta).catch(() => {
            logger.error(
              { code: 'ARTWORK_UPLOAD_ROLLBACK_FAILED' },
              'Cloudinary artwork upload returned unexpected metadata and cleanup failed',
            );
          });
        }
        throw new AppError(
          'Private artwork storage returned unexpected metadata',
          502,
          'ARTWORK_STORAGE_ERROR',
        );
      }
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        'Private artwork upload failed',
        502,
        'ARTWORK_STORAGE_ERROR',
      );
    }
  }

  getStream(publicId: string, meta?: StorageMeta): Readable {
    const output = new PassThrough();
    void this.pipePrivateDownload(publicId, meta, output);
    return output;
  }

  async delete(publicId: string, meta?: StorageMeta): Promise<void> {
    const resourceType = requireResourceType(publicId, meta);
    try {
      const result = await this.cloudinaryClient().uploader.destroy(publicId, {
        invalidate: true,
        resource_type: resourceType,
        type: 'authenticated',
      });
      if (result.result !== 'ok' && result.result !== 'not found') {
        throw new Error('Deletion was not confirmed');
      }
    } catch {
      throw new AppError(
        'Private artwork storage could not delete the asset',
        502,
        'ARTWORK_STORAGE_ERROR',
      );
    }
  }

  async exists(publicId: string, meta?: StorageMeta): Promise<boolean> {
    try {
      await this.getMetadata(publicId, meta);
      return true;
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === CLOUDINARY_NOT_FOUND
      ) {
        return false;
      }
      throw error;
    }
  }

  async getMetadata(
    publicId: string,
    meta?: StorageMeta,
  ): Promise<StorageObjectMetadata> {
    const resourceType = requireResourceType(publicId, meta);
    const cloud = this.cloudinaryClient();
    const alternateResourceType = resourceType === 'image' ? 'raw' : 'image';
    const result = await getResourceMetadata(cloud, publicId, resourceType);
    if (result !== undefined) return result;
    const alternate = await getResourceMetadata(
      cloud,
      publicId,
      alternateResourceType,
    );
    if (alternate !== undefined) return alternate;
    throw new AppError(
      'Private artwork asset was not found',
      404,
      CLOUDINARY_NOT_FOUND,
    );
  }

  private async pipePrivateDownload(
    publicId: string,
    meta: StorageMeta | undefined,
    output: PassThrough,
  ): Promise<void> {
    try {
      const resourceType = requireResourceType(publicId, meta);
      const format = meta ? FORMAT_BY_MIME[meta.contentType] : undefined;
      if (!format) throw unsupportedArtworkType();
      const url = this.cloudinaryClient().utils.private_download_url(
        publicId,
        format,
        {
          resource_type: resourceType,
          type: 'authenticated',
          expires_at:
            Math.floor(Date.now() / 1000) + PRIVATE_DOWNLOAD_TTL_SECONDS,
          attachment: false,
        },
      );
      if (!url.startsWith('https://')) {
        throw new Error('Cloudinary returned a non-HTTPS delivery URL');
      }
      const response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok || !response.body) {
        throw new Error('Cloudinary artwork download failed');
      }
      const source = Readable.from(
        (async function* () {
          const reader = response.body!.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) return;
              yield value;
            }
          } finally {
            reader.releaseLock();
          }
        })(),
      );
      source.once('error', (error: Error) => output.destroy(error));
      source.pipe(output);
    } catch (error) {
      output.destroy(
        error instanceof AppError
          ? error
          : new AppError(
              'Private artwork could not be retrieved',
              502,
              'ARTWORK_STORAGE_ERROR',
            ),
      );
    }
  }
}

function requireResourceType(
  publicId: string,
  meta: StorageMeta | undefined,
): 'image' | 'raw' {
  if (!isValidCloudinaryArtworkKey(publicId) || !meta) {
    throw new AppError(
      'Invalid private artwork storage reference',
      500,
      'INVALID_STORAGE_REFERENCE',
    );
  }
  const expectedResourceType = RAW_MIME_TYPES.has(meta.contentType)
    ? 'raw'
    : 'image';
  if (
    !FORMAT_BY_MIME[meta.contentType] ||
    meta.resourceType !== expectedResourceType ||
    (expectedResourceType === 'raw' &&
      !publicId.endsWith(`.${FORMAT_BY_MIME[meta.contentType]}`)) ||
    (expectedResourceType === 'image' && /\.[^.]+$/.test(publicId))
  ) {
    throw unsupportedArtworkType();
  }
  return expectedResourceType;
}

function unsupportedArtworkType(): AppError {
  return new AppError(
    'This artwork format is not supported by private storage',
    415,
    'FILE_TYPE_NOT_ALLOWED',
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

async function getResourceMetadata(
  client: typeof cloudinary,
  publicId: string,
  resourceType: 'image' | 'raw',
): Promise<StorageObjectMetadata | undefined> {
  try {
    const result: unknown = await client.api.resource(publicId, {
      resource_type: resourceType,
      type: 'authenticated',
    });
    if (!isRecord(result)) return {};
    return {
      ...(typeof result.public_id === 'string'
        ? { publicId: result.public_id }
        : {}),
      ...(typeof result.bytes === 'number'
        ? { sizeBytes: result.bytes }
        : {}),
      ...(typeof result.resource_type === 'string'
        ? { resourceType: result.resource_type }
        : {}),
      ...(typeof result.type === 'string'
        ? { deliveryType: result.type }
        : {}),
    };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'http_code' in error &&
      error.http_code === 404
    ) {
      return undefined;
    }
    throw new AppError(
      'Private artwork provider metadata could not be checked',
      502,
      'ARTWORK_PROVIDER_ERROR',
    );
  }
}

function uploadBuffer(
  client: typeof cloudinary,
  publicId: string,
  buffer: Buffer,
  resourceType: 'image' | 'raw',
  format: string,
): Promise<{ public_id: string; resource_type: string; type: string }> {
  return new Promise((resolve, reject) => {
    const stream = client.uploader.upload_stream(
      {
        public_id: publicId,
        overwrite: false,
        resource_type: resourceType,
        type: 'authenticated',
        access_mode: 'authenticated',
        allowed_formats: [format],
        timeout: 60_000,
        headers: 'X-Robots-Tag: noindex',
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary returned no upload result'));
          return;
        }
        resolve(result);
      },
    );
    stream.end(buffer);
  });
}

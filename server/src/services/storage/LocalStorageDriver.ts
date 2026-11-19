import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';

import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import type {
  StorageDriver,
  StorageMeta,
  StorageObjectMetadata,
} from './StorageDriver';

const SAFE_KEY =
  /^\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]+\.(?:jpg|jpeg|png|webp|pdf|svg)$/i;

export class LocalStorageDriver implements StorageDriver {
  private readonly root = path.resolve(env.STORAGE_PRIVATE_DIR);

  async put(key: string, buffer: Buffer, _meta: StorageMeta): Promise<void> {
    const target = this.resolveKey(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buffer, { flag: 'wx' });
  }

  getStream(key: string, _meta?: StorageMeta) {
    return createReadStream(this.resolveKey(key));
  }

  async delete(key: string, _meta?: StorageMeta): Promise<void> {
    try {
      await unlink(this.resolveKey(key));
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return;
      throw error;
    }
  }

  async exists(key: string, _meta?: StorageMeta): Promise<boolean> {
    try {
      await stat(this.resolveKey(key));
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async getMetadata(
    key: string,
    _meta?: StorageMeta,
  ): Promise<StorageObjectMetadata> {
    const file = await stat(this.resolveKey(key));
    return { sizeBytes: file.size };
  }

  private resolveKey(key: string): string {
    if (!SAFE_KEY.test(key)) {
      throw new AppError(
        'Invalid private storage key',
        400,
        'INVALID_STORAGE_KEY',
      );
    }
    const resolved = path.resolve(this.root, key);
    if (!resolved.startsWith(`${this.root}${path.sep}`)) {
      throw new AppError(
        'Invalid private storage key',
        400,
        'INVALID_STORAGE_KEY',
      );
    }
    return resolved;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

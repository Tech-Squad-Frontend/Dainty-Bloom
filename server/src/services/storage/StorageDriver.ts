import type { Readable } from 'node:stream';

export interface StorageMeta {
  contentType: string;
  resourceType?: 'image' | 'raw';
}

export interface StorageObjectMetadata {
  publicId?: string;
  sizeBytes?: number;
  resourceType?: string;
  deliveryType?: string;
}

export interface StorageDriver {
  put(key: string, buffer: Buffer, meta: StorageMeta): Promise<void>;
  getStream(key: string, meta?: StorageMeta): Readable;
  delete(key: string, meta?: StorageMeta): Promise<void>;
  exists(key: string, meta?: StorageMeta): Promise<boolean>;
  getMetadata(
    key: string,
    meta?: StorageMeta,
  ): Promise<StorageObjectMetadata>;
}

export interface MigrationStorageWriter {
  putForMigration(
    key: string,
    buffer: Buffer,
    meta: StorageMeta,
  ): Promise<void>;
}

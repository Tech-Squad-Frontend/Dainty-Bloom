import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import type { StorageDriver } from './StorageDriver';
import { LocalStorageDriver } from './LocalStorageDriver';
import { CloudinaryArtworkDriver } from './CloudinaryArtworkDriver';

export type {
  StorageDriver,
  StorageMeta,
  StorageObjectMetadata,
} from './StorageDriver';

export type StorageDriverName = 'local' | 'cloudinary';

export function getStorageDriver(
  driverName: string = env.STORAGE_DRIVER,
): StorageDriver {
  if (driverName === 'local') {
    return new LocalStorageDriver();
  }
  if (driverName === 'cloudinary') {
    return new CloudinaryArtworkDriver();
  }
  throw new AppError(
    'Artwork record uses an unsupported storage driver',
    503,
    'STORAGE_DRIVER_NOT_CONFIGURED',
  );
}

export function getArtworkStorageMeta(artwork: {
  detectedMimeType: string;
  storageResourceType?: 'image' | 'raw';
}): { contentType: string; resourceType?: 'image' | 'raw' } {
  return {
    contentType: artwork.detectedMimeType,
    ...(artwork.storageResourceType
      ? { resourceType: artwork.storageResourceType }
      : {}),
  };
}

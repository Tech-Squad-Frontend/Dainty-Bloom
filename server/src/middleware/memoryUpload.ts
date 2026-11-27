import multer from 'multer';
import type { RequestHandler } from 'express';

import { env } from '../config/env';
import { SiteSettings } from '../models';
import { AppError } from '../utils/AppError';
import { malwareScanningDisabledError } from './requireMalwareScanning';

export function singleMemoryUpload(
  fieldName: string,
  maxBytes: (req: Express.Request) => Promise<number>,
  maxFields = 10,
): RequestHandler {
  const middleware: RequestHandler = (req, res, next): void => {
    void maxBytes(req)
      .then((limit) => {
        multer({
          storage: multer.memoryStorage(),
          limits: { fileSize: limit, files: 1, fields: maxFields },
        }).single(fieldName)(req, res, (error: unknown) => {
          if (!error) {
            next();
            return;
          }
          if (error instanceof multer.MulterError) {
            const isTooLarge = error.code === 'LIMIT_FILE_SIZE';
            next(
              new AppError(
                isTooLarge ? 'File exceeds the allowed size' : 'Invalid upload',
                isTooLarge ? 413 : 400,
                isTooLarge ? 'FILE_TOO_LARGE' : 'FILE_COUNT_INVALID',
              ),
            );
            return;
          }
          next(error);
        });
      })
      .catch(next);
  };
  return Object.assign(middleware, {
    routeProtection: { kind: 'upload' as const, value: 'multipart-memory' },
  });
}

export function messageMemoryUpload(
  maxBytes: (req: Express.Request) => Promise<number>,
  maxFields = 12,
): RequestHandler {
  const middleware: RequestHandler = (req, res, next): void => {
    void maxBytes(req)
      .then((limit) => {
        let fileRejectedBecauseScanningIsDisabled = false;
        multer({
          storage: multer.memoryStorage(),
          limits: { fileSize: limit, files: 1, fields: maxFields },
          fileFilter: (_request, _file, callback) => {
            if (!env.MALWARE_SCANNING_ENABLED) {
              fileRejectedBecauseScanningIsDisabled = true;
              callback(null, false);
              return;
            }
            callback(null, true);
          },
        }).fields([
          { name: 'file', maxCount: 1 },
          { name: 'referenceImage', maxCount: 1 },
        ])(req, res, (error: unknown) => {
          if (fileRejectedBecauseScanningIsDisabled) {
            next(malwareScanningDisabledError());
            return;
          }
          if (error) {
            if (error instanceof multer.MulterError) {
              const isTooLarge = error.code === 'LIMIT_FILE_SIZE';
              next(
                new AppError(
                  isTooLarge ? 'File exceeds the allowed size' : 'Invalid upload',
                  isTooLarge ? 413 : 400,
                  isTooLarge ? 'FILE_TOO_LARGE' : 'FILE_COUNT_INVALID',
                ),
              );
              return;
            }
            next(error);
            return;
          }
          const files = req.files as
            | Record<string, Express.Multer.File[]>
            | undefined;
          req.file = files?.referenceImage?.[0] ?? files?.file?.[0];
          next();
        });
      })
      .catch(next);
  };
  return Object.assign(middleware, {
    routeProtection: { kind: 'upload' as const, value: 'multipart-memory' },
  });
}

export async function memoryUploadLimit(): Promise<number> {
  const settings = await SiteSettings.findOne({ key: 'default' })
    .select('artworkLimits.maxBytes')
    .lean();
  const configuredLimit = settings?.artworkLimits?.maxBytes;
  return configuredLimit
    ? Math.min(configuredLimit, env.UPLOAD_MAX_BYTES)
    : env.UPLOAD_MAX_BYTES;
}

export const artworkUploadLimit = memoryUploadLimit;

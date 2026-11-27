import { Router } from 'express';
import { z } from 'zod';

import {
  cancelPrivacyDeletion,
  downloadPrivacyExport,
  requestPrivacyDeletion,
  requestPrivacyExport,
} from '../controllers/privacy.controller';
import { authenticate } from '../middleware/authenticate';
import { requireRole } from '../middleware/requireRole';
import { createRateLimiter as rateLimit } from '../middleware/rateLimiter';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/AppError';

const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (_req, _res, next) => {
    next(
      new AppError(
        'Too many privacy export requests',
        429,
        'RATE_LIMITED',
      ),
    );
  },
});

const deletionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const emptyObject = z.object({}).strict();
const objectId = z.string().regex(/^[a-f\d]{24}$/i);

const exportSchema = z.object({
  body: z.object({}),
  query: z.object({}),
  params: z.object({}),
});

const downloadSchema = z.object({
  body: z.object({}),
  query: z.object({
    token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  }),
  params: z.object({ exportId: objectId }),
});

const deletionSchema = z.object({
  body: z.object({
    password: z.string().min(1).max(128),
  }),
  query: emptyObject,
  params: emptyObject,
});

const deletionCancelSchema = z.object({
  body: z.object({
    email: z.string().trim().email().max(254),
    password: z.string().min(1).max(128),
  }),
  query: emptyObject,
  params: emptyObject,
});

export const privacyRoutes = Router();
privacyRoutes.post(
  '/data-export',
  authenticate,
  requireRole('customer'),
  exportLimiter,
  validate(exportSchema),
  requestPrivacyExport,
);
privacyRoutes.get(
  '/data-export/:exportId/download',
  authenticate,
  requireRole('customer'),
  validate(downloadSchema),
  downloadPrivacyExport,
);
privacyRoutes.post(
  '/delete-account/request',
  authenticate,
  requireRole('customer'),
  deletionLimiter,
  validate(deletionSchema),
  requestPrivacyDeletion,
);
privacyRoutes.post(
  '/delete-account/cancel',
  deletionLimiter,
  validate(deletionCancelSchema),
  cancelPrivacyDeletion,
);

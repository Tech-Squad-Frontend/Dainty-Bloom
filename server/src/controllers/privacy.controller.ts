import type { RequestHandler } from 'express';

import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import {
  cancelAccountDeletionByCredentials,
  createCustomerDataExport,
  getCustomerDataExport,
  requestAccountDeletion,
} from '../services/privacy.service';

export const requestPrivacyExport: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
    }
    const result = await createCustomerDataExport(req.user, req.ip);
    res.status(202).json({ success: true, data: result });
  },
);

export const downloadPrivacyExport: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
    }
    const token = req.query.token;
    if (typeof token !== 'string') {
      throw new AppError(
        'Export token is required',
        400,
        'PRIVACY_EXPORT_TOKEN_REQUIRED',
      );
    }
    const result = await getCustomerDataExport(
      req.user,
      req.params.exportId,
      token,
    );
    res.set({
      'Content-Type': 'application/json',
      'Content-Disposition': 'attachment; filename="dainty-bloom-data-export.json"',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(result.buffer);
  },
);

export const requestPrivacyDeletion: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
    }
    const result = await requestAccountDeletion(
      req.user,
      (req.body as { password: string }).password,
      req.ip,
    );
    res.status(202).json({
      success: true,
      data: {
        scheduledAt: result.scheduledAt,
        message:
          'Account deletion has been scheduled. Sign-in is suspended during the grace period.',
      },
    });
  },
);

export const cancelPrivacyDeletion: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const body = req.body as { email: string; password: string };
    await cancelAccountDeletionByCredentials(body.email, body.password, req.ip);
    res.json({
      success: true,
      data: { message: 'Pending account deletion was cancelled.' },
    });
  },
);

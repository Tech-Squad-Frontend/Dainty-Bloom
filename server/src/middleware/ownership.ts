import type { RequestHandler } from 'express';

import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';

export type OwnerResolver = (
  req: Parameters<RequestHandler>[0],
) => Promise<string | undefined>;

export function requireCustomerOwnership(
  resolveOwnerId: OwnerResolver,
): RequestHandler {
  const middleware: RequestHandler = asyncHandler(
    async (req, _res, next): Promise<void> => {
      if (!req.user || req.user.role !== 'customer') {
        next(new AppError('Authentication required', 401, 'UNAUTHENTICATED'));
        return;
      }
      const ownerId = await resolveOwnerId(req);
      if (!ownerId || ownerId !== req.user._id.toString()) {
        next(new AppError('Resource not found', 404, 'RESOURCE_NOT_FOUND'));
        return;
      }
      next();
    },
  );
  return Object.assign(middleware, {
    routeProtection: {
      kind: 'ownership' as const,
      value: 'customer',
    },
  });
}

export function requireGuestOwnership(
  resolveOwnerSessionId: OwnerResolver,
): RequestHandler {
  const middleware: RequestHandler = asyncHandler(
    async (req, _res, next): Promise<void> => {
      if (!req.guestSessionId) {
        next(new AppError('Guest session is missing', 401, 'UNAUTHENTICATED'));
        return;
      }
      const ownerSessionId = await resolveOwnerSessionId(req);
      if (!ownerSessionId || ownerSessionId !== req.guestSessionId) {
        next(new AppError('Resource not found', 404, 'RESOURCE_NOT_FOUND'));
        return;
      }
      next();
    },
  );
  return Object.assign(middleware, {
    routeProtection: {
      kind: 'ownership' as const,
      value: 'guest',
    },
  });
}

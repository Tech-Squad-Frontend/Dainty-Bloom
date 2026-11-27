import type { RequestHandler } from 'express';

import { AppError } from '../utils/AppError';

export function requireRecentMfa(_maxAgeMinutes = 10): RequestHandler {
  const middleware: RequestHandler = (req, _res, next): void => {
    const user = req.user;
    if (!user) {
      next(new AppError('Authentication required', 401, 'UNAUTHENTICATED'));
      return;
    }
    if (user.role === 'customer') {
      next();
      return;
    }
    if (!user.mfaEnabled) {
      next(new AppError('MFA setup is required', 403, 'MFA_SETUP_REQUIRED'));
      return;
    }
    if (
      !user.recentMfaExpiresAt ||
      user.recentMfaExpiresAt.getTime() <= Date.now()
    ) {
      next(
        new AppError(
          'Recent MFA verification is required',
          403,
          'RECENT_MFA_REQUIRED',
        ),
      );
      return;
    }
    next();
  };
  return Object.assign(middleware, {
    routeProtection: {
      kind: 'permission' as const,
      value: 'recent-mfa' as never,
    },
  });
}

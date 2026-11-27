import type { RequestHandler } from 'express';

import { AppError } from '../utils/AppError';
import { env } from '../config/env';
import { verifyCsrfToken } from '../services/csrf.service';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const csrfGuard: RequestHandler = (req, _res, next): void => {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (req.get('X-Requested-With') !== 'dainty-bloom') {
    next(
      new AppError('CSRF protection header is required', 403, 'CSRF_FORBIDDEN'),
    );
    return;
  }

  const origin = req.get('Origin');
  const referer = req.get('Referer');
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(env.CLIENT_URL).origin) {
        throw new Error('Cross-origin request');
      }
    } catch {
      next(new AppError('Cross-origin request is forbidden', 403, 'CSRF_FORBIDDEN'));
      return;
    }
  } else if (referer) {
    try {
      if (new URL(referer).origin !== new URL(env.CLIENT_URL).origin) {
        throw new Error('Cross-origin request');
      }
    } catch {
      next(new AppError('Cross-origin request is forbidden', 403, 'CSRF_FORBIDDEN'));
      return;
    }
  }

  const headerToken = req.get('X-CSRF-Token');
  const cookieToken = req.cookies?.daintyCsrfToken as string | undefined;
  if (headerToken || cookieToken) {
    if (
      !headerToken ||
      !cookieToken ||
      headerToken !== cookieToken ||
      !verifyCsrfToken(headerToken)
    ) {
      next(new AppError('CSRF token is invalid', 403, 'CSRF_TOKEN_INVALID'));
      return;
    }
  }

  next();
};
Object.assign(csrfGuard, { routeProtection: { kind: 'csrf' as const } });

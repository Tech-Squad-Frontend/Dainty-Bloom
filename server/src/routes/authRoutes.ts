import { Router } from 'express';
import { createRateLimiter as rateLimit } from '../middleware/rateLimiter';

import {
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  register,
  resetPasswordHandler,
  updateMe,
  updatePassword,
  verifyMfa,
  startMfaEnrollment,
  confirmMfa,
  disableMfaHandler,
  requestEmailVerificationHandler,
  verifyEmail,
  csrfToken,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { guestSession } from '../middleware/guestSession';
import { optionalAuth } from '../middleware/authenticate';
import { requireRecentMfa } from '../middleware/requireRecentMfa';
import { validate } from '../middleware/validate';
import { AppError } from '../utils/AppError';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
  mfaVerifySchema,
  mfaEnrollmentStartSchema,
  mfaEnrollmentConfirmSchema,
  mfaDisableSchema,
  emailVerificationSchema,
  emailVerificationRequestSchema,
} from '../validators/auth.validators';

const authRateLimit = (limit: number) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
    handler: (_req, _res, next) => {
      next(
        new AppError('Too many authentication attempts', 429, 'RATE_LIMITED'),
      );
    },
  });

export const authRoutes = Router();

authRoutes.get('/csrf', csrfToken);

authRoutes.post(
  '/register',
  authRateLimit(5),
  validate(registerSchema),
  register,
);
authRoutes.post(
  '/login',
  guestSession,
  authRateLimit(10),
  validate(loginSchema),
  login,
);
authRoutes.post('/logout', authenticate, logout);
authRoutes.post('/refresh', refresh);
authRoutes.get('/me', authenticate, me);
authRoutes.patch('/me', authenticate, validate(profileSchema), updateMe);
authRoutes.post(
  '/change-password',
  authenticate,
  requireRecentMfa(),
  validate(changePasswordSchema),
  updatePassword,
);
authRoutes.post(
  '/forgot-password',
  authRateLimit(5),
  validate(forgotPasswordSchema),
  forgotPassword,
);
authRoutes.post(
  '/reset-password',
  authRateLimit(5),
  validate(resetPasswordSchema),
  resetPasswordHandler,
);

authRoutes.post(
  '/mfa/verify',
  guestSession,
  authRateLimit(10),
  validate(mfaVerifySchema),
  verifyMfa,
);
authRoutes.post(
  '/mfa/enroll/start',
  optionalAuth,
  authRateLimit(10),
  validate(mfaEnrollmentStartSchema),
  startMfaEnrollment,
);
authRoutes.post(
  '/mfa/enroll/confirm',
  optionalAuth,
  authRateLimit(10),
  validate(mfaEnrollmentConfirmSchema),
  confirmMfa,
);
authRoutes.post(
  '/mfa/disable',
  authenticate,
  requireRecentMfa(),
  authRateLimit(5),
  validate(mfaDisableSchema),
  disableMfaHandler,
);
authRoutes.post(
  '/verify-email',
  authRateLimit(5),
  validate(emailVerificationSchema),
  verifyEmail,
);
authRoutes.post(
  '/verify-email/request',
  authRateLimit(5),
  validate(emailVerificationRequestSchema),
  requestEmailVerificationHandler,
);

import type { RequestHandler } from 'express';

import { env } from '../config/env';

import {
  clearAuthCookies,
  changePassword,
  loginUser,
  logoutUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  rotateRefreshToken,
  setAuthCookies,
  toSafeUser,
  updateProfile,
} from '../services/auth.service';
import { ROLE_PERMISSIONS } from '../constants/permissions';
import { AppError } from '../utils/AppError';
import { asyncHandler } from '../utils/asyncHandler';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  MfaVerifyInput,
  ProfileInput,
  RegisterInput,
  ResetPasswordInput,
} from '../validators/auth.validators';
import {
  beginMfaEnrollment,
  beginMfaEnrollmentForChallenge,
  confirmMfaEnrollment,
  confirmMfaEnrollmentForChallenge,
  disableMfa,
  verifyLoginMfaChallenge,
} from '../services/mfa.service';
import {
  requestEmailVerification,
  verifyEmailToken,
} from '../services/emailVerification.service';
import { createCsrfToken } from '../services/csrf.service';

export const register: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const user = await registerUser(req.body as RegisterInput);
    res.status(201).json({
      success: true,
      data: {
        user: toSafeUser(user),
        permissions: ROLE_PERMISSIONS[user.role],
      },
    });
  },
);

export const login: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const input = req.body as LoginInput;
    const result = await loginUser(
      input.email,
      input.password,
      req.ip,
      req.guestSessionId,
      input.portal,
    );
    if (result.mfaChallenge) {
      res.json({
        success: true,
        data: {
          mfaRequired: true,
          challenge: {
            id: result.mfaChallenge.challengeId,
            expiresAt: result.mfaChallenge.expiresAt,
            purpose: result.mfaChallenge.purpose,
          },
        },
      });
      return;
    }
    setAuthCookies(res, result.user);
    res.json({
      success: true,
      data: {
        user: toSafeUser(result.user),
        permissions: ROLE_PERMISSIONS[result.user.role],
      },
    });
  },
);

export const logout: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const user = getUser(req);
    await logoutUser(user, req.ip);
    clearAuthCookies(res);
    res.json({ success: true, data: { message: 'Logged out successfully' } });
  },
);

export const refresh: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const token = req.cookies?.daintyRefreshToken as string | undefined;
    if (!token) {
      throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
    }

    const user = await rotateRefreshToken(token);
    setAuthCookies(res, user);
    res.json({ success: true, data: { message: 'Session refreshed' } });
  },
);

export const me: RequestHandler = (req, res): void => {
  const user = getUser(req);
  res.json({
    success: true,
    data: {
      user: toSafeUser(user),
      permissions: ROLE_PERMISSIONS[user.role],
    },
  });
};

export const updateMe: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const user = await updateProfile(
      getUser(req)._id.toString(),
      req.body as ProfileInput,
    );
    if ((req.body as ProfileInput).email) {
      try {
        await requestEmailVerification(user.email, req.ip);
      } catch {
        // Email delivery is separate from profile persistence.
      }
    }
    res.json({ success: true, data: { user: toSafeUser(user) } });
  },
);

export const updatePassword: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const input = req.body as ChangePasswordInput;
    const user = await changePassword(
      getUser(req),
      input.currentPassword,
      input.newPassword,
      req.ip,
    );
    setAuthCookies(res, user);
    res.json({ success: true, data: { user: toSafeUser(user) } });
  },
);

export const forgotPassword: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const input = req.body as ForgotPasswordInput;
    try {
      await requestPasswordReset(input.email);
    } catch (error) {
      if (
        !(error instanceof AppError) ||
        !['EMAIL_NOT_CONFIGURED', 'EMAIL_DELIVERY_FAILED'].includes(error.code)
      ) {
        throw error;
      }
    }
    res.json({
      success: true,
      data: {
        message:
          'If an account exists for that email, the reset request has been received.',
      },
    });
  },
);

export const resetPasswordHandler: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const input = req.body as ResetPasswordInput;
    await resetPassword(input.token, input.password, req.ip);
    res.json({
      success: true,
      data: { message: 'Password reset successfully' },
    });
  },
);

export const csrfToken: RequestHandler = (_req, res): void => {
  const token = createCsrfToken();
  res.cookie('daintyCsrfToken', token, {
    httpOnly: false,
    secure: env.NODE_ENV === 'production' || env.COOKIE_SAMESITE === 'none',
    sameSite: env.COOKIE_SAMESITE,
    domain: env.COOKIE_DOMAIN,
    path: '/api',
    maxAge: 60 * 60 * 1000,
  });
  res.json({ success: true, data: { csrfToken: token } });
};

export const verifyMfa: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const input = req.body as MfaVerifyInput;
    const user = await verifyLoginMfaChallenge(
      input.challengeId,
      input.code,
      req.ip,
      req.guestSessionId,
    );
    setAuthCookies(res, user);
    res.json({
      success: true,
      data: {
        user: toSafeUser(user),
        permissions: ROLE_PERMISSIONS[user.role],
      },
    });
  },
);

export const startMfaEnrollment: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const body = req.body as { challengeId?: string };
    const enrollment = body.challengeId
      ? await beginMfaEnrollmentForChallenge(body.challengeId)
      : await beginMfaEnrollment(getUser(req));
    res.json({ success: true, data: enrollment });
  },
);

export const confirmMfa: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const body = req.body as { challengeId?: string; code: string };
    if (body.challengeId) {
      const result = await confirmMfaEnrollmentForChallenge(
        body.challengeId,
        body.code,
        req.ip,
      );
      setAuthCookies(res, result.user);
      res.json({
        success: true,
        data: {
          recoveryCodes: result.recoveryCodes,
          user: toSafeUser(result.user),
          permissions: ROLE_PERMISSIONS[result.user.role],
        },
      });
      return;
    }
    const result = await confirmMfaEnrollment(getUser(req), body.code);
    setAuthCookies(res, getUser(req));
    res.json({
      success: true,
      data: {
        recoveryCodes: result.recoveryCodes,
        user: toSafeUser(getUser(req)),
      },
    });
  },
);

export const disableMfaHandler: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const body = req.body as { code: string };
    await disableMfa(getUser(req), body.code);
    clearAuthCookies(res);
    res.json({ success: true, data: { message: 'MFA disabled' } });
  },
);

export const requestEmailVerificationHandler: RequestHandler =
  asyncHandler(async (req, res): Promise<void> => {
    const body = req.body as { email: string };
    await requestEmailVerification(body.email, req.ip);
    res.json({
      success: true,
      data: {
        message:
          'If an account exists and requires verification, a verification email has been sent.',
      },
    });
  });

export const verifyEmail: RequestHandler = asyncHandler(
  async (req, res): Promise<void> => {
    const body = req.body as { token: string };
    await verifyEmailToken(body.token, req.ip);
    res.json({
      success: true,
      data: { message: 'Email address verified successfully' },
    });
  },
);

function getUser(req: Parameters<RequestHandler>[0]) {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHENTICATED');
  }
  return req.user;
}

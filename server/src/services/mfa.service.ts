import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Secret, TOTP } from 'otpauth';
import QRCode from 'qrcode';

import { env } from '../config/env';
import { User, type IUser } from '../models/User';
import { AppError } from '../utils/AppError';
import {
  decryptMfaSecret,
  encryptMfaSecret,
  generateRecoveryCodes,
  hashSecurityToken,
  normalizeRecoveryCode,
} from '../utils/mfa';
import { logAuditEvent } from './audit.service';
import { mergeGuestCart } from './cart.service';
import { mergeGuestWishlist } from './wishlist.service';

const TOTP_WINDOW = 1;
const RECENT_MFA_MS = 10 * 60 * 1000;

export interface MfaChallenge {
  challengeId: string;
  expiresAt: Date;
  purpose: 'login' | 'setup';
}

export async function createLoginMfaChallenge(
  user: IUser,
  ip?: string,
): Promise<MfaChallenge> {
  const purpose = user.mfaEnabled ? 'login' : 'setup';
  const challengeId = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + durationToMs(env.MFA_CHALLENGE_TTL));
  await User.findByIdAndUpdate(user._id, {
    $set: {
      mfaChallengeHash: hashSecurityToken(challengeId),
      mfaChallengeExpiresAt: expiresAt,
      mfaChallengePurpose: purpose,
      mfaChallengeFailedAttempts: 0,
    },
  });
  await logAuditEvent({
    actor: user,
    action: 'mfa.challenge_created',
    targetType: 'User',
    targetId: user._id.toString(),
    metadata: { purpose },
    ip,
  });
  return { challengeId, expiresAt, purpose };
}

export async function verifyLoginMfaChallenge(
  challengeId: string,
  code: string,
  ip?: string,
  guestSessionId?: string,
): Promise<IUser> {
  const challengeHash = hashSecurityToken(challengeId);
  const user = await User.findOne({
    mfaChallengeHash: challengeHash,
    mfaChallengeExpiresAt: { $gt: new Date() },
  }).select(
    '+mfaSecretEncrypted +mfaRecoveryCodes +mfaRecoveryCodes.codeHash +mfaRecoveryCodes.usedAt +mfaChallengeFailedAttempts +recentMfaExpiresAt',
  );

  if (!user) {
    throw new AppError('MFA challenge is invalid or expired', 401, 'MFA_CHALLENGE_INVALID');
  }
  if (user.mfaChallengeFailedAttempts >= 5) {
    await clearChallenge(user);
    throw new AppError('Too many MFA attempts', 429, 'MFA_RATE_LIMITED');
  }

  let valid = false;
  if (user.mfaEnabled && user.mfaSecretEncrypted) {
    valid = verifyTotp(decryptMfaSecret(user.mfaSecretEncrypted), code);
  }
  if (!valid) {
    valid = await consumeRecoveryCode(user, code);
  }

  if (!valid) {
    user.mfaChallengeFailedAttempts += 1;
    await user.save();
    throw new AppError('Invalid MFA code', 401, 'INVALID_MFA_CODE');
  }

  user.mfaChallengeHash = undefined;
  user.mfaChallengeExpiresAt = undefined;
  user.mfaChallengePurpose = undefined;
  user.mfaChallengeFailedAttempts = 0;
  user.recentMfaExpiresAt = new Date(Date.now() + RECENT_MFA_MS);
  await user.save();
  await logAuditEvent({
    actor: user,
    action: 'mfa.verified',
    targetType: 'User',
    targetId: user._id.toString(),
    ip,
  });
  await mergeGuestCart(user, guestSessionId);
  await mergeGuestWishlist(user, guestSessionId);
  return user;
}

export async function beginMfaEnrollment(
  user: IUser,
): Promise<{ qrCodeDataUrl: string; secret: string }> {
  if (user.role === 'customer') {
    throw new AppError('MFA is not enabled for customer accounts', 403, 'FORBIDDEN');
  }
  if (user.mfaEnabled) {
    throw new AppError('MFA is already enabled', 409, 'MFA_ALREADY_ENABLED');
  }
  const secret = new Secret({ size: 20 }).base32;
  await User.findByIdAndUpdate(user._id, {
    $set: { mfaSecretEncrypted: encryptMfaSecret(secret) },
  });
  const totp = new TOTP({
    issuer: 'Dainty Bloom',
    label: user.email,
    secret,
  });
  const qrCodeDataUrl = await QRCode.toDataURL(totp.toString());
  return { qrCodeDataUrl, secret };
}

export async function beginMfaEnrollmentForChallenge(
  challengeId: string,
): Promise<{ qrCodeDataUrl: string; secret: string }> {
  const user = await findChallengeUser(challengeId, 'setup');
  if (!user) {
    throw new AppError(
      'MFA challenge is invalid or expired',
      401,
      'MFA_CHALLENGE_INVALID',
    );
  }
  return beginMfaEnrollment(user);
}

export async function confirmMfaEnrollmentForChallenge(
  challengeId: string,
  code: string,
  ip?: string,
): Promise<{ user: IUser; recoveryCodes: string[] }> {
  const user = await findChallengeUser(challengeId, 'setup');
  if (!user) {
    throw new AppError(
      'MFA challenge is invalid or expired',
      401,
      'MFA_CHALLENGE_INVALID',
    );
  }
  const result = await confirmMfaEnrollment(user, code);
  const confirmed = await User.findById(user._id).select(
    '+mfaSecretEncrypted +mfaRecoveryCodes',
  );
  if (!confirmed) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  await logAuditEvent({
    actor: confirmed,
    action: 'mfa.setup_completed',
    targetType: 'User',
    targetId: confirmed._id.toString(),
    ip,
  });
  return { user: confirmed, recoveryCodes: result.recoveryCodes };
}

async function findChallengeUser(
  challengeId: string,
  purpose: 'login' | 'setup',
): Promise<IUser | null> {
  return User.findOne({
    mfaChallengeHash: hashSecurityToken(challengeId),
    mfaChallengeExpiresAt: { $gt: new Date() },
    mfaChallengePurpose: purpose,
  }).select('+mfaSecretEncrypted +mfaRecoveryCodes');
}

export async function confirmMfaEnrollment(
  user: IUser,
  code: string,
): Promise<{ recoveryCodes: string[] }> {
  const stored = await User.findById(user._id).select(
    '+mfaSecretEncrypted +mfaRecoveryCodes +mfaRecoveryCodes.codeHash +mfaRecoveryCodes.usedAt +recentMfaExpiresAt',
  );
  if (!stored?.mfaSecretEncrypted) {
    throw new AppError('MFA enrollment was not started', 400, 'MFA_ENROLLMENT_REQUIRED');
  }
  if (!verifyTotp(decryptMfaSecret(stored.mfaSecretEncrypted), code)) {
    throw new AppError('Invalid MFA code', 401, 'INVALID_MFA_CODE');
  }

  const recoveryCodes = generateRecoveryCodes();
  stored.mfaRecoveryCodes = recoveryCodes.map((code) => ({
    codeHash: hashSecurityToken(normalizeRecoveryCode(code)),
  }));
  stored.mfaEnabled = true;
  stored.recentMfaExpiresAt = new Date(Date.now() + RECENT_MFA_MS);
  stored.mfaChallengeHash = undefined;
  stored.mfaChallengeExpiresAt = undefined;
  stored.mfaChallengePurpose = undefined;
  stored.mfaChallengeFailedAttempts = 0;
  stored.tokenVersion += 1;
  await stored.save();
  await logAuditEvent({
    actor: stored,
    action: 'mfa.enabled',
    targetType: 'User',
    targetId: stored._id.toString(),
  });
  return { recoveryCodes };
}

export async function disableMfa(
  user: IUser,
  code: string,
): Promise<void> {
  const stored = await User.findById(user._id).select(
    '+mfaSecretEncrypted +mfaRecoveryCodes +mfaRecoveryCodes.codeHash +mfaRecoveryCodes.usedAt +recentMfaExpiresAt',
  );
  if (!stored?.mfaEnabled) {
    throw new AppError('MFA is not enabled', 400, 'MFA_NOT_ENABLED');
  }
  if (!requireRecentMfa(stored)) {
    throw new AppError('Recent MFA verification is required', 403, 'RECENT_MFA_REQUIRED');
  }
  let valid = stored.mfaSecretEncrypted
    ? verifyTotp(decryptMfaSecret(stored.mfaSecretEncrypted), code)
    : false;
  if (!valid) valid = await consumeRecoveryCode(stored, code);
  if (!valid) throw new AppError('Invalid MFA code', 401, 'INVALID_MFA_CODE');

  stored.mfaEnabled = false;
  stored.mfaSecretEncrypted = undefined;
  stored.mfaRecoveryCodes = [];
  stored.recentMfaExpiresAt = undefined;
  stored.tokenVersion += 1;
  await stored.save();
  await logAuditEvent({
    actor: stored,
    action: 'mfa.disabled',
    targetType: 'User',
    targetId: stored._id.toString(),
  });
}

export function requireRecentMfa(user: IUser): boolean {
  return Boolean(
    user.recentMfaExpiresAt &&
      user.recentMfaExpiresAt.getTime() > Date.now(),
  );
}

export function verifyTotp(secret: string, code: string): boolean {
  const normalized = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const totp = new TOTP({ secret });
  return totp.validate({ token: normalized, window: TOTP_WINDOW }) !== null;
}

async function consumeRecoveryCode(
  user: IUser,
  code: string,
): Promise<boolean> {
  const normalizedHash = createHash('sha256')
    .update(normalizeRecoveryCode(code))
    .digest('hex');
  for (const recoveryCode of user.mfaRecoveryCodes) {
    if (
      !recoveryCode.usedAt &&
      timingSafeEqualStrings(recoveryCode.codeHash, normalizedHash)
    ) {
      recoveryCode.usedAt = new Date();
      await user.save();
      return true;
    }
  }
  return false;
}

function timingSafeEqualStrings(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

async function clearChallenge(user: IUser): Promise<void> {
  user.mfaChallengeHash = undefined;
  user.mfaChallengeExpiresAt = undefined;
  user.mfaChallengePurpose = undefined;
  user.mfaChallengeFailedAttempts = 0;
  await user.save();
}

function durationToMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d|w)$/.exec(duration);
  if (!match) throw new Error(`Unsupported duration format: ${duration}`);
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return Number(match[1]) * multipliers[match[2]]!;
}

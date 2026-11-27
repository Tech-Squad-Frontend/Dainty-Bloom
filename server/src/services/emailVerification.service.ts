import { randomBytes } from 'node:crypto';

import { env } from '../config/env';
import { User, type IUser } from '../models/User';
import { AppError } from '../utils/AppError';
import { hashSecurityToken } from '../utils/mfa';
import { logAuditEvent } from './audit.service';
import { getMailer } from './mailer';

export async function issueEmailVerification(
  user: IUser,
  ip?: string,
): Promise<void> {
  const token = randomBytes(32).toString('hex');
  user.emailVerificationTokenHash = hashSecurityToken(token);
  user.emailVerificationExpiresAt = new Date(
    Date.now() + durationToMs(env.EMAIL_VERIFICATION_TTL),
  );
  await user.save();

  const link = new URL('/verify-email', env.CLIENT_URL);
  link.searchParams.set('token', token);
  await getMailer().sendEmailVerification({
    to: user.email,
    name: user.name,
    verificationLink: link.toString(),
  });
  await logAuditEvent({
    actor: user,
    action: 'email_verification.requested',
    targetType: 'User',
    targetId: user._id.toString(),
    ip,
  });
}

export async function requestEmailVerification(
  email: string,
  ip?: string,
): Promise<void> {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || user.emailVerified) return;
  try {
    await issueEmailVerification(user, ip);
  } catch (error) {
    if (
      error instanceof AppError &&
      ['EMAIL_NOT_CONFIGURED', 'EMAIL_DELIVERY_FAILED'].includes(error.code)
    ) {
      return;
    }
    throw error;
  }
}

export async function verifyEmailToken(
  token: string,
  ip?: string,
): Promise<IUser> {
  const tokenHash = hashSecurityToken(token);
  const user = await User.findOneAndUpdate(
    {
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: { $gt: new Date() },
    },
    {
      $set: { emailVerified: true },
      $unset: {
        emailVerificationTokenHash: 1,
        emailVerificationExpiresAt: 1,
      },
    },
    { new: true },
  );
  if (!user) {
    throw new AppError(
      'Verification token is invalid or expired',
      400,
      'INVALID_EMAIL_VERIFICATION_TOKEN',
    );
  }
  await logAuditEvent({
    actor: user,
    action: 'email_verification.completed',
    targetType: 'User',
    targetId: user._id.toString(),
    ip,
  });
  return user;
}

function durationToMs(duration: string): number {
  const match = /^(\d+)(s|m|h|d|w)$/.exec(duration);
  if (!match) throw new Error(`Unsupported duration format: ${duration}`);
  const count = Number(match[1]);
  const unit = match[2];
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 604_800_000,
  };
  return count * multipliers[unit]!;
}

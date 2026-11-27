import { createHash } from 'node:crypto';

import bcrypt from 'bcryptjs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import jwt from 'jsonwebtoken';
import { TOTP } from 'otpauth';
import mongoose from 'mongoose';
import request from 'supertest';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const { createTransportMock, sendMailMock } = vi.hoisted(() => ({
  createTransportMock: vi.fn(),
  sendMailMock: vi.fn(),
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: createTransportMock },
}));

import { env } from '../src/config/env';
import { encryptMfaSecret } from '../src/utils/mfa';
import { ROLE_PERMISSIONS } from '../src/constants/permissions';
import { AuditEvent, Order, User } from '../src/models';
import { app } from '../src/app';
import { PrivacyExport } from '../src/models';
import { completeScheduledAccountDeletions } from '../src/services/privacy.service';
import { resetSmtpTransport } from '../src/services/mailer/smtpTransport';

const CSRF_HEADER = { 'X-Requested-With': 'dainty-bloom' };
const PASSWORD = 'a-secure-password-123';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), AuditEvent.init()]);
});

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) =>
      collection.deleteMany({}),
    ),
  );
  env.NODE_ENV = 'test';
  resetSmtpTransport();
});

beforeEach(() => {
  env.NODE_ENV = 'test';
  resetSmtpTransport();
  vi.clearAllMocks();
  createTransportMock.mockReturnValue({ sendMail: sendMailMock });
  sendMailMock.mockResolvedValue({ messageId: 'private-provider-response' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('Authentication and authorization', () => {
  it('registers customers and ignores submitted role fields', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set(CSRF_HEADER)
      .send({
        name: 'Test Customer',
        email: ' CUSTOMER@EXAMPLE.COM ',
        password: PASSWORD,
        role: 'admin',
      });

    expect(response.status).toBe(201);
    expect(response.body.data.user.role).toBe('customer');
    expect(response.body.data.user.email).toBe('customer@example.com');
    expect(response.body.data.permissions).toEqual(ROLE_PERMISSIONS.customer);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(await User.countDocuments({ role: 'admin' })).toBe(0);
  });

  it('sets httpOnly cookies on login without returning tokens in JSON', async () => {
    const user = await createUser({ role: 'admin' });
    const response = await login(user.email, PASSWORD, 'admin');

    expect(response.status).toBe(200);
    expect(response.body.data.mfaRequired).toBe(true);
    expect(response.body.data.challenge.purpose).toBe('setup');
    expect(authCookies(response)).toEqual([]);
    expect(JSON.stringify(response.body)).not.toMatch(
      /accessToken|refreshToken|eyJ/,
    );
  });

  it('returns identical responses for an unknown email and a wrong password', async () => {
    const user = await createUser();
    const knownEmail = await login(user.email, 'wrong-password');
    const unknownEmail = await login('missing@example.com', 'wrong-password');

    expect(knownEmail.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(knownEmail.body).toEqual(unknownEmail.body);
  });

  it('denies customer admin-portal login like invalid credentials without cookies', async () => {
    const user = await createUser();
    const invalid = await login(user.email, 'wrong-password');
    const failedAttemptsBeforePortal = (
      await User.findById(user._id).select('+failedLoginAttempts')
    )?.failedLoginAttempts;
    const portal = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({ email: user.email, password: PASSWORD, portal: 'admin' });

    expect(portal.status).toBe(invalid.status);
    expect(portal.body).toEqual(invalid.body);
    expect(setCookies(portal)).toEqual([]);
    expect(
      await User.findById(user._id).select('+failedLoginAttempts'),
    ).toMatchObject({
      failedLoginAttempts: (failedAttemptsBeforePortal ?? 0) + 1,
    });
    expect(
      await AuditEvent.exists({ action: 'auth.admin_portal_denied' }),
    ).toBeTruthy();
  });

  it('allows customer login only through the customer portal', async () => {
    const user = await createUser();

    for (const portal of [undefined, 'customer'] as const) {
      const response = await login(user.email, PASSWORD, portal);
      expect(response.status).toBe(200);
      expect(response.body.data.user.role).toBe('customer');
      expect(
        setCookies(response).some((cookie) =>
          cookie.startsWith('daintyAccessToken='),
        ),
      ).toBe(true);
    }
  });

  it('denies staff customer-portal login like invalid credentials', async () => {
    const user = await createUser({ role: 'production' });
    const invalid = await login(user.email, 'wrong-password');

    for (const portal of [undefined, 'customer'] as const) {
      const customerPortal = await login(user.email, PASSWORD, portal);
      expect(customerPortal.status).toBe(invalid.status);
      expect(customerPortal.body).toEqual(invalid.body);
      expect(authCookies(customerPortal)).toEqual([]);
    }
    expect(
      await AuditEvent.exists({ action: 'auth.customer_portal_denied' }),
    ).toBeTruthy();
  });

  it('rejects unsupported login portal values', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .send({
        email: 'staff@example.com',
        password: PASSWORD,
        portal: 'support',
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(authCookies(response)).toEqual([]);
  });

  it('locks an account after five failed logins and returns the generic response', async () => {
    const user = await createUser();
    let response = await login(user.email, 'wrong-password');
    for (let attempt = 1; attempt < 5; attempt += 1) {
      response = await login(user.email, 'wrong-password');
    }
    expect(response.status).toBe(401);

    const lockedUser = await User.findById(user._id).select(
      '+failedLoginAttempts +lockUntil',
    );
    expect(lockedUser?.failedLoginAttempts).toBe(5);
    expect(lockedUser?.lockUntil?.getTime()).toBeGreaterThan(Date.now());

    const lockedLogin = await login(user.email, PASSWORD);
    expect(lockedLogin.status).toBe(401);
    expect(lockedLogin.body).toEqual(response.body);
  });

  it('does not allow suspended accounts to log in', async () => {
    const user = await createUser({ accountState: 'suspended' });
    const response = await login(user.email);

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Invalid email or password');
  });

  it('requires authentication for /me and returns a safe profile', async () => {
    const unauthenticated = await request(app).get('/api/auth/me');
    expect(unauthenticated.status).toBe(401);

    const user = await createUser();
    const session = await login(user.email);
    const response = await request(app)
      .get('/api/auth/me')
      .set('Cookie', accessCookie(session));

    expect(response.status).toBe(200);
    expect(response.body.data.user.email).toBe(user.email);
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
  });

  it('rejects expired and tampered access tokens', async () => {
    const user = await createUser();
    const expiredToken = jwt.sign(
      { sub: user._id.toString(), ver: 0, typ: 'access' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: -1 },
    );

    for (const token of [expiredToken, 'tampered.jwt.value']) {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `daintyAccessToken=${token}`);
      expect(response.status).toBe(401);
    }
  });

  it('invalidates the current access token after logout', async () => {
    const user = await createUser();
    const session = await login(user.email);
    const oldAccessCookie = accessCookie(session);

    const logout = await request(app)
      .post('/api/auth/logout')
      .set(CSRF_HEADER)
      .set('Cookie', oldAccessCookie);
    expect(logout.status).toBe(200);
    expect((await User.findById(user._id))?.tokenVersion).toBe(1);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', oldAccessCookie);
    expect(me.status).toBe(401);
  });

  it('invalidates old access tokens and issues fresh cookies after password change', async () => {
    const user = await createUser();
    const session = await login(user.email);
    const oldAccessCookie = accessCookie(session);

    const changed = await request(app)
      .post('/api/auth/change-password')
      .set(CSRF_HEADER)
      .set('Cookie', oldAccessCookie)
      .send({
        currentPassword: PASSWORD,
        newPassword: 'another-secure-password-456',
      });

    expect(changed.status).toBe(200);
    expect((await User.findById(user._id))?.tokenVersion).toBe(1);
    expect(
      setCookies(changed).some((cookie) =>
        cookie.startsWith('daintyAccessToken='),
      ),
    ).toBe(true);
    expect(
      (await request(app).get('/api/auth/me').set('Cookie', oldAccessCookie))
        .status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/auth/me')
          .set('Cookie', accessCookie(changed))
      ).status,
    ).toBe(200);
  });

  it('rotates refresh tokens and invalidates the previous token', async () => {
    const user = await createUser();
    const session = await login(user.email);
    const oldRefreshCookie = namedCookie(session, 'daintyRefreshToken');

    const refreshResponse = await request(app)
      .post('/api/auth/refresh')
      .set(CSRF_HEADER)
      .set('Cookie', oldRefreshCookie);
    expect(refreshResponse.status).toBe(200);
    const newRefreshCookie = namedCookie(refreshResponse, 'daintyRefreshToken');
    expect(newRefreshCookie).not.toBe(oldRefreshCookie);
    expect(
      (
        await request(app)
          .get('/api/auth/me')
          .set('Cookie', accessCookie(refreshResponse))
      ).status,
    ).toBe(200);

    const replay = await request(app)
      .post('/api/auth/refresh')
      .set(CSRF_HEADER)
      .set('Cookie', oldRefreshCookie);
    expect(replay.status).toBe(401);
    expect(
      (
        await request(app)
          .get('/api/auth/me')
          .set('Cookie', accessCookie(refreshResponse))
      ).status,
    ).toBe(401);
  });

  it('enforces admin permissions for customer, admin, and unauthenticated requests', async () => {
    const unauthenticated = await request(app).get('/api/admin/ping');
    expect(unauthenticated.status).toBe(401);

    const user = await createUser();
    const session = await login(user.email);
    const customerResponse = await request(app)
      .get('/api/admin/ping')
      .set('Cookie', accessCookie(session));
    expect(customerResponse.status).toBe(403);

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          role: 'admin',
          mfaEnabled: true,
          recentMfaExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
        },
      },
    );
    const adminResponse = await request(app)
      .get('/api/admin/ping')
      .set('Cookie', accessCookie(session));
    expect(adminResponse.status).toBe(200);
  });

  it('enrolls staff MFA and consumes recovery codes once', async () => {
    const user = await createUser({ role: 'admin' });
    const firstLogin = await login(user.email, PASSWORD, 'admin');
    expect(firstLogin.body.data.challenge.purpose).toBe('setup');
    const challengeId = firstLogin.body.data.challenge.id as string;

    const enrollment = await request(app)
      .post('/api/auth/mfa/enroll/start')
      .set(CSRF_HEADER)
      .send({ challengeId });
    expect(enrollment.status).toBe(200);
    const secret = enrollment.body.data.secret as string;
    const code = TOTP.generate({ secret });

    const confirmed = await request(app)
      .post('/api/auth/mfa/enroll/confirm')
      .set(CSRF_HEADER)
      .send({ challengeId, code });
    expect(confirmed.status).toBe(200);
    expect(
      authCookies(confirmed).filter((cookie) =>
        /^(daintyAccessToken|daintyRefreshToken)=[^;]/.test(cookie),
      ).length,
    ).toBeGreaterThanOrEqual(2);
    expect(confirmed.body.data.recoveryCodes).toHaveLength(10);

    const stored = await User.findById(user._id).select(
      '+mfaSecretEncrypted +mfaRecoveryCodes',
    );
    expect(stored?.mfaEnabled).toBe(true);
    expect(stored?.mfaSecretEncrypted).not.toBe(secret);

    const recoveryCode = confirmed.body.data.recoveryCodes[0] as string;
    const subsequentLogin = await login(user.email, PASSWORD, 'admin');
    expect(subsequentLogin.body.data.challenge.purpose).toBe('login');
    const verified = await request(app)
      .post('/api/auth/mfa/verify')
      .set(CSRF_HEADER)
      .send({
        challengeId: subsequentLogin.body.data.challenge.id,
        code: recoveryCode,
      });
    expect(verified.status).toBe(200);

    const replayLogin = await login(user.email, PASSWORD, 'admin');
    const replay = await request(app)
      .post('/api/auth/mfa/verify')
      .set(CSRF_HEADER)
      .send({
        challengeId: replayLogin.body.data.challenge.id,
        code: recoveryCode,
      });
    expect(replay.status).toBe(401);
  });

  it('rate-limits repeated incorrect MFA codes', async () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const user = await createUser({
      role: 'admin',
      mfaEnabled: true,
      mfaSecretEncrypted: encryptMfaSecret(secret),
    });
    const loginResponse = await login(user.email, PASSWORD, 'admin');
    const challengeId = loginResponse.body.data.challenge.id as string;

    let last;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      last = await request(app)
        .post('/api/auth/mfa/verify')
        .set(CSRF_HEADER)
        .send({ challengeId, code: '000000' });
      expect([401, 429]).toContain(last.status);
    }

    const blocked = await request(app)
      .post('/api/auth/mfa/verify')
      .set(CSRF_HEADER)
      .send({ challengeId, code: '000000' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('MFA_RATE_LIMITED');
  });

  it('rejects staff without MFA and requires recent MFA for refunds', async () => {
    const user = await createUser({ role: 'admin', mfaEnabled: false });
    const accessToken = jwt.sign(
      { sub: user._id.toString(), ver: user.tokenVersion, typ: 'access' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' },
    );
    const adminPing = await request(app)
      .get('/api/admin/ping')
      .set('Cookie', `daintyAccessToken=${accessToken}`);
    expect(adminPing.status).toBe(403);
    expect(adminPing.body.error.code).toBe('MFA_SETUP_REQUIRED');

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          mfaEnabled: true,
        },
        $unset: { recentMfaExpiresAt: 1 },
      },
    );
    const recentToken = jwt.sign(
      { sub: user._id.toString(), ver: user.tokenVersion, typ: 'access' },
      env.JWT_ACCESS_SECRET,
      { expiresIn: '15m' },
    );
    const refund = await request(app)
      .post('/api/admin/orders/507f1f77bcf86cd799439011/refund')
      .set(CSRF_HEADER)
      .set('Cookie', `daintyAccessToken=${recentToken}`)
      .send({ amountMinor: 100, reason: 'customer request' });
    expect(refund.status).toBe(403);
    expect(refund.body.error.code).toBe('MFA_VERIFICATION_REQUIRED');
  });

  it('verifies email tokens once and invalidates verification on email change', async () => {
    const user = await createUser();
    env.NODE_ENV = 'production';
    await request(app)
      .post('/api/auth/verify-email/request')
      .set(CSRF_HEADER)
      .send({ email: user.email });

    const stored = await User.findById(user._id).select(
      '+emailVerificationTokenHash +emailVerificationExpiresAt',
    );
    expect(stored?.emailVerificationTokenHash).toBeTruthy();
    const token = stored?.emailVerificationTokenHash
      ? createHash('sha256').update('unused-in-test').digest('hex')
      : '';
    expect(token).not.toBe(stored?.emailVerificationTokenHash);

    const session = await login(user.email);
    const verificationToken = 'c'.repeat(64);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          emailVerificationTokenHash: createHash('sha256')
            .update(verificationToken)
            .digest('hex'),
          emailVerificationExpiresAt: new Date(Date.now() + 60_000),
        },
      },
    );
    const verified = await request(app)
      .post('/api/auth/verify-email')
      .set(CSRF_HEADER)
      .send({ token: verificationToken });
    expect(verified.status).toBe(200);
    expect((await User.findById(user._id))?.emailVerified).toBe(true);

    const replay = await request(app)
      .post('/api/auth/verify-email')
      .set(CSRF_HEADER)
      .send({ token: verificationToken });
    expect(replay.status).toBe(400);

    const changed = await request(app)
      .patch('/api/auth/me')
      .set(CSRF_HEADER)
      .set('Cookie', accessCookie(session))
      .send({ email: 'changed@example.com' });
    expect(changed.status).toBe(200);
    const changedUser = await User.findById(user._id);
    expect(changedUser?.emailVerified).toBe(false);
  });

  it('creates a private customer export and prevents cross-customer download', async () => {
    const owner = await createUser();
    const other = await createUser();
    await Order.create({
      orderNumber: `DB-${Math.random().toString(36).slice(2)}`,
      user: owner._id,
      contactSnapshot: {
        name: owner.name,
        email: owner.email,
      },
      shippingAddress: {
        line1: '1 Test Street',
        city: 'Testville',
        state: 'Test',
        postalCode: 'TE1 1ST',
        country: 'GB',
      },
      billingAddress: {
        line1: '1 Test Street',
        city: 'Testville',
        state: 'Test',
        postalCode: 'TE1 1ST',
        country: 'GB',
      },
      items: [],
      subtotalMinor: 100,
      discountMinor: 0,
      shippingMinor: 0,
      taxMinor: 0,
      totalMinor: 100,
      currency: 'GBP',
      payment: { provider: 'manual', status: 'paid' },
      status: 'completed',
      statusHistory: [],
    });

    const ownerSession = await login(owner.email);
    const requested = await request(app)
      .post('/api/privacy/data-export')
      .set(CSRF_HEADER)
      .set('Cookie', accessCookie(ownerSession));
    expect(requested.status).toBe(202);
    const exportId = requested.body.data.id as string;
    const downloadUrl = String(requested.body.data.downloadUrl);
    const token = new URL(
      downloadUrl,
      'http://localhost:3000',
    ).searchParams.get('token');
    expect(token).toBeTruthy();

    const ownerDownload = await request(app)
      .get(
        `/api/privacy/data-export/${exportId}/download?token=${encodeURIComponent(token!)}`,
      )
      .set(CSRF_HEADER)
      .set('Cookie', accessCookie(ownerSession));
    expect(ownerDownload.status).toBe(200);
    expect(ownerDownload.headers['content-type']).toContain('application/json');
    expect(JSON.stringify(ownerDownload.body)).not.toContain('passwordHash');

    const otherSession = await login(other.email);
    const otherDownload = await request(app)
      .get(
        `/api/privacy/data-export/${exportId}/download?token=${encodeURIComponent(token!)}`,
      )
      .set(CSRF_HEADER)
      .set('Cookie', accessCookie(otherSession));
    expect(otherDownload.status).toBe(404);

    await PrivacyExport.updateOne(
      { _id: exportId },
      { $set: { expiresAt: new Date(Date.now() - 1000) } },
    );
    const expired = await request(app)
      .get(
        `/api/privacy/data-export/${exportId}/download?token=${encodeURIComponent(token!)}`,
      )
      .set(CSRF_HEADER)
      .set('Cookie', accessCookie(ownerSession));
    expect(expired.status).toBe(404);
  });

  it('schedules deletion, blocks authentication, and preserves order reconciliation', async () => {
    const user = await createUser();
    const order = await Order.create({
      orderNumber: `DB-${Math.random().toString(36).slice(2)}`,
      user: user._id,
      contactSnapshot: { name: user.name, email: user.email },
      shippingAddress: {
        line1: '1 Test Street',
        city: 'Testville',
        state: 'Test',
        postalCode: 'TE1 1ST',
        country: 'GB',
      },
      billingAddress: {
        line1: '1 Test Street',
        city: 'Testville',
        state: 'Test',
        postalCode: 'TE1 1ST',
        country: 'GB',
      },
      items: [],
      subtotalMinor: 100,
      discountMinor: 0,
      shippingMinor: 0,
      taxMinor: 0,
      totalMinor: 100,
      currency: 'GBP',
      payment: { provider: 'manual', status: 'paid' },
      status: 'completed',
      statusHistory: [],
    });
    const session = await login(user.email);
    const scheduled = await request(app)
      .post('/api/privacy/delete-account/request')
      .set(CSRF_HEADER)
      .set('Cookie', accessCookie(session))
      .send({ password: PASSWORD });
    expect(scheduled.status).toBe(202);

    const denied = await login(user.email);
    expect(denied.status).toBe(401);

    await User.updateOne(
      { _id: user._id },
      { $set: { deletionScheduledAt: new Date(Date.now() - 1000) } },
    );
    const completion = await completeScheduledAccountDeletions();
    expect(completion.completed).toBe(1);
    const retained = await Order.findById(order._id);
    expect(retained?.user?.toString()).toBe(user._id.toString());
    const deleted = await User.findById(user._id).select('+deletionStatus');
    expect(deleted?.deletionStatus).toBe('completed');
    expect(deleted?.name).toBe('Deleted Customer');
  });

  it('rejects state-changing requests without the CSRF header', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ name: 'Test', email: 'test@example.com', password: PASSWORD });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_FORBIDDEN');
  });

  it('returns the same forgot-password response for known and unknown emails', async () => {
    const user = await createUser();
    const existing = await request(app)
      .post('/api/auth/forgot-password')
      .set(CSRF_HEADER)
      .send({ email: user.email });
    const missing = await request(app)
      .post('/api/auth/forgot-password')
      .set(CSRF_HEADER)
      .send({ email: 'missing@example.com' });

    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(existing.body).toEqual(missing.body);
  });

  it('sends production password resets only to the account email', async () => {
    const user = await createUser();
    env.NODE_ENV = 'production';

    const response = await request(app)
      .post('/api/auth/forgot-password')
      .set(CSRF_HEADER)
      .send({ email: user.email });

    expect(response.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const message = sendMailMock.mock.calls[0]?.[0] as {
      to: string;
      from: string;
      subject: string;
      text: string;
    };
    expect(message).toMatchObject({
      from: env.SMTP_FROM,
      to: user.email,
      subject: 'Reset your Dainty Bloom password',
    });
    expect(message.text).toContain(`${env.CLIENT_URL}/reset-password?token=`);
    const resetToken = message.text.match(/token=([a-f0-9]+)/)?.[1];
    expect(resetToken).toBeTruthy();
    expect(response.text).not.toContain(resetToken);
    expect(JSON.stringify(response.body)).not.toContain(resetToken);
  });

  it('keeps SMTP reset failures generic and does not expose provider details', async () => {
    const user = await createUser();
    env.NODE_ENV = 'production';
    sendMailMock.mockRejectedValueOnce(
      Object.assign(new Error('private SMTP response and password detail'), {
        code: 'EAUTH',
      }),
    );

    const response = await request(app)
      .post('/api/auth/forgot-password')
      .set(CSRF_HEADER)
      .send({ email: user.email });

    expect(response.status).toBe(200);
    expect(response.body.data.message).toMatch(
      /If an account exists for that email/,
    );
    expect(JSON.stringify(response.body)).not.toContain('private SMTP');
    expect(JSON.stringify(response.body)).not.toContain('EAUTH');
    expect(JSON.stringify(response.body)).not.toContain('token=');
  });

  it('allows a reset token once and rejects expired reset tokens', async () => {
    const user = await createUser();
    const token = 'a'.repeat(64);
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetTokenHash: tokenHash,
          passwordResetExpiresAt: new Date(Date.now() + 60_000),
        },
      },
    );

    const reset = await request(app)
      .post('/api/auth/reset-password')
      .set(CSRF_HEADER)
      .send({ token, password: 'new-secure-password-789' });
    expect(reset.status).toBe(200);

    const replay = await request(app)
      .post('/api/auth/reset-password')
      .set(CSRF_HEADER)
      .send({ token, password: 'another-secure-password-456' });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('INVALID_RESET_TOKEN');

    const expiredToken = 'b'.repeat(64);
    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordResetTokenHash: createHash('sha256')
            .update(expiredToken)
            .digest('hex'),
          passwordResetExpiresAt: new Date(Date.now() - 1000),
        },
      },
    );

    const expired = await request(app)
      .post('/api/auth/reset-password')
      .set(CSRF_HEADER)
      .send({ token: expiredToken, password: 'another-secure-password-456' });
    expect(expired.status).toBe(400);
    expect(expired.body.error.code).toBe('INVALID_RESET_TOKEN');
  });
});

async function createUser(
  overrides: Record<string, unknown> = {},
): Promise<InstanceType<typeof User>> {
  const suffix = Math.random().toString(36).slice(2);
  const passwordHash = await bcrypt.hash(PASSWORD, env.BCRYPT_COST);
  return User.create({
    name: 'Test Customer',
    email: `customer-${suffix}@example.com`,
    passwordHash,
    ...overrides,
  });
}

async function login(
  email: string,
  password = PASSWORD,
  portal?: 'customer' | 'admin',
): Promise<request.Response> {
  return request(app)
    .post('/api/auth/login')
    .set(CSRF_HEADER)
    .send({ email, password, ...(portal ? { portal } : {}) });
}

function setCookies(response: request.Response): string[] {
  const cookies = response.headers['set-cookie'];
  return Array.isArray(cookies) ? cookies : [];
}

function authCookies(response: request.Response): string[] {
  return setCookies(response).filter((cookie) =>
    /^(daintyAccessToken|daintyRefreshToken)=/.test(cookie),
  );
}

function namedCookie(response: request.Response, name: string): string {
  const cookie = setCookies(response).find(
    (value) =>
      value.startsWith(`${name}=`) &&
      value.split(';')[0].length > `${name}=`.length,
  );
  if (!cookie) throw new Error(`Missing ${name} cookie`);
  return cookie.split(';')[0];
}

function accessCookie(response: request.Response): string {
  return namedCookie(response, 'daintyAccessToken');
}

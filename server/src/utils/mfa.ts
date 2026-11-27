import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';

import { AppError } from './AppError';

const ALGORITHM = 'aes-256-gcm';
const TAG_LENGTH = 16;
const IV_LENGTH = 12;

export function encryptMfaSecret(secret: string): string {
  const key = mfaEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptMfaSecret(encrypted: string): string {
  const key = mfaEncryptionKey();
  const payload = Buffer.from(encrypted, 'base64');
  if (
    payload.byteLength < IV_LENGTH + TAG_LENGTH ||
    payload.toString('base64') !== Buffer.from(encrypted, 'base64').toString('base64')
  ) {
    throw new AppError(
      'MFA configuration is invalid',
      500,
      'MFA_CONFIGURATION_INVALID',
    );
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + TAG_LENGTH);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new AppError(
      'MFA configuration is invalid',
      500,
      'MFA_CONFIGURATION_INVALID',
    );
  }
}

export function hashSecurityToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function timingSafeTokenEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    `${randomInt(100000, 999999)}-${randomInt(100000, 999999)}`,
  );
}

export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, '').toLowerCase();
}

function mfaEncryptionKey(): Buffer {
  return Buffer.from(process.env.MFA_ENCRYPTION_KEY ?? '', 'hex');
}

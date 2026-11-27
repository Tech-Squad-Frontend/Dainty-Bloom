import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

import { env } from '../config/env';
import { AppError } from './AppError';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export function encryptSensitiveField(plaintext: string): string {
  const key = activeEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: TAG_LENGTH,
  });
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${Buffer.concat([iv, tag, ciphertext]).toString('base64')}`;
}

export function decryptSensitiveField(payload: string): string {
  const match = /^v(\d+):(.*)$/s.exec(payload);
  if (!match) throw encryptionError();
  const version = Number(match[1]);
  if (version !== 1) throw encryptionError();

  const bytes = Buffer.from(match[2], 'base64');
  if (
    bytes.byteLength < IV_LENGTH + TAG_LENGTH ||
    bytes.toString('base64') !== match[2]
  ) {
    throw encryptionError();
  }
  const iv = bytes.subarray(0, IV_LENGTH);
  const tag = bytes.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = bytes.subarray(IV_LENGTH + TAG_LENGTH);

  for (const key of keyRing()) {
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
      continue;
    }
  }
  throw encryptionError();
}

export function sensitivePayloadMatches(
  payload: string,
  plaintext: string,
): boolean {
  try {
    const decrypted = decryptSensitiveField(payload);
    const left = Buffer.from(decrypted);
    const right = Buffer.from(plaintext);
    return (
      left.byteLength === right.byteLength &&
      timingSafeEqual(left, right)
    );
  } catch {
    return false;
  }
}

function activeEncryptionKey(): Buffer {
  if (!env.DATA_ENCRYPTION_KEY) throw encryptionError();
  return Buffer.from(env.DATA_ENCRYPTION_KEY, 'hex');
}

function keyRing(): Buffer[] {
  const keys = [
    ...env.DATA_ENCRYPTION_PREVIOUS_KEYS,
    ...(env.DATA_ENCRYPTION_KEY ? [env.DATA_ENCRYPTION_KEY] : []),
  ];
  return keys.map((key) => Buffer.from(key, 'hex'));
}

function encryptionError(): AppError {
  return new AppError(
    'Sensitive data could not be decrypted',
    500,
    'DATA_ENCRYPTION_ERROR',
  );
}

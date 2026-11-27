import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { env } from '../config/env';

export function createCsrfToken(): string {
  const payload = randomBytes(32).toString('base64url');
  const signature = createHmac('sha256', env.COOKIE_SECRET)
    .update(payload)
    .digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyCsrfToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, signature] = parts;
  if (!payload || !signature) return false;
  const expected = createHmac('sha256', env.COOKIE_SECRET)
    .update(payload)
    .digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return (
    actualBuffer.byteLength === expectedBuffer.byteLength &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

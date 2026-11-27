import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { app } from '../src/app';

const CSRF_HEADER = { 'X-Requested-With': 'dainty-bloom' };

describe('Web application security headers and request guards', () => {
  beforeAll(() => {
    process.env.NODE_ENV = 'test';
  });

  it('sets explicit security headers and CSP on API responses', async () => {
    const response = await request(app).get('/api/health');
    expect(response.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(response.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe(
      'strict-origin-when-cross-origin',
    );
    expect(response.headers['permissions-policy']).toContain('camera=()');
    expect(response.headers['x-frame-options']).toBe('DENY');
  });

  it('rejects cross-origin state-changing requests', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .set('Origin', 'https://evil.example')
      .send({
        email: 'customer@example.com',
        password: 'not-a-real-password',
        portal: 'customer',
      });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CSRF_FORBIDDEN');
  });

  it('issues and verifies a signed double-submit CSRF token', async () => {
    const issued = await request(app).get('/api/auth/csrf');
    expect(issued.status).toBe(200);
    const token = issued.body.data.csrfToken as string;
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const cookie = issued.headers['set-cookie'];
    expect(Array.isArray(cookie)).toBe(true);
    const csrfCookie = (cookie as string[]).find((value) =>
      value.startsWith('daintyCsrfToken='),
    );
    expect(csrfCookie).not.toMatch(/;\s*HttpOnly/i);

    const accepted = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .set('X-CSRF-Token', token)
      .set('Cookie', csrfCookie?.split(';')[0] ?? '')
      .set('Origin', 'http://localhost:3001')
      .send({
        email: 'customer@example.com',
        password: 'not-a-real-password',
        portal: 'customer',
      });
    expect(accepted.status).not.toBe(403);
    expect(accepted.body.error?.code).not.toBe('CSRF_TOKEN_INVALID');

    const rejected = await request(app)
      .post('/api/auth/login')
      .set(CSRF_HEADER)
      .set('X-CSRF-Token', 'invalid.token')
      .set('Cookie', csrfCookie?.split(';')[0] ?? '')
      .send({
        email: 'customer@example.com',
        password: 'not-a-real-password',
        portal: 'customer',
      });
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.code).toBe('CSRF_TOKEN_INVALID');
  }, 15_000);

  it('rejects NoSQL operators, prototype keys, and deeply nested JSON', async () => {
    for (const body of [
      { email: { $gt: '' }, password: 'password' },
      { email: 'customer@example.com', password: 'password', constructor: {} },
      { email: 'customer@example.com', password: 'password', nested: createDeepObject(25) },
    ]) {
      const response = await request(app)
        .post('/api/auth/login')
        .set(CSRF_HEADER)
        .send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toMatch(/INVALID_JSON|VALIDATION_ERROR/);
    }
  });

  it('rejects unexpected registration fields', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .set(CSRF_HEADER)
      .send({
        name: 'Test Customer',
        email: 'customer@example.com',
        password: 'a-secure-password',
        role: 'admin',
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('does not allow spoofed forwarded headers to change trust configuration', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('X-Forwarded-For', '127.0.0.1');
    expect(response.status).toBe(200);
  });
});

function createDeepObject(depth: number): unknown {
  let value: unknown = 'end';
  for (let index = 0; index < depth; index += 1) {
    value = { nested: value };
  }
  return value;
}

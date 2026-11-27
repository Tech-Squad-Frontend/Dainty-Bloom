import { describe, expect, it } from 'vitest';

import { validateMongoConnection } from '../src/config/mongoConnection';

describe('MongoDB connection validation', () => {
  it('allows development and test unauthenticated local MongoDB', () => {
    expect(
      validateMongoConnection(
        'mongodb://127.0.0.1:27017/dainty-bloom',
        'test',
      ),
    ).toMatchObject({
      authenticated: false,
      explicitDatabase: true,
    });
  });

  it('requires authentication and TLS in production', () => {
    expect(() =>
      validateMongoConnection(
        'mongodb://127.0.0.1:27017/dainty-bloom',
        'production',
      ),
    ).toThrow(/username and password|require TLS/);

    expect(() =>
      validateMongoConnection(
        'mongodb://app-user:password@db.example.test/dainty-bloom',
        'production',
      ),
    ).toThrow(/tls=true|mongodb\+srv/);
  });

  it('accepts authenticated explicitly-TLS MongoDB and MongoDB SRV', () => {
    expect(
      validateMongoConnection(
        'mongodb://app-user:password@db.example.test:27017/dainty-bloom?tls=true',
        'production',
      ),
    ).toMatchObject({ authenticated: true, tls: true });
    expect(
      validateMongoConnection(
        'mongodb+srv://app-user:password@cluster.example.test/dainty-bloom',
        'production',
      ),
    ).toMatchObject({ authenticated: true, tls: true });
  });

  it('rejects certificate-validation bypass options', () => {
    for (const bypass of [
      'tlsAllowInvalidCertificates=true',
      'tlsAllowInvalidHostnames=true',
      'tlsInsecure=true',
      'sslValidate=false',
    ]) {
      expect(() =>
        validateMongoConnection(
          `mongodb://app-user:password@db.example.test/dainty-bloom?tls=true&${bypass}`,
          'production',
        ),
      ).toThrow(/forbids/);
    }
  });

  it('requires an explicit database name for host-only and trailing-slash URIs', () => {
    for (const uri of [
      'mongodb+srv://app-user:dummy-password@cluster.example.test',
      'mongodb+srv://app-user:dummy-password@cluster.example.test/',
      'mongodb://app-user:dummy-password@db.example.test/',
    ]) {
      expect(() => validateMongoConnection(uri, 'production')).toThrow(
        /database/,
      );
    }
  });
});

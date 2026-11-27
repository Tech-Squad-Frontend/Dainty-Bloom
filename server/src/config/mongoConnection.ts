export interface MongoConnectionValidation {
  authenticated: boolean;
  tls: boolean;
  explicitDatabase: boolean;
}

export function validateMongoConnection(
  uri: string,
  nodeEnv: 'development' | 'test' | 'production',
): MongoConnectionValidation {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error('MONGODB_URI is not a valid MongoDB connection URL');
  }

  if (!['mongodb:', 'mongodb+srv:'].includes(parsed.protocol)) {
    throw new Error('MONGODB_URI must use mongodb or mongodb+srv');
  }
  const databaseName = parsed.pathname.replace(/^\/+|\/+$/g, '');
  if (!databaseName || databaseName.includes('/')) {
    throw new Error('MONGODB_URI must explicitly identify a database');
  }
  const authenticated =
    parsed.username.length > 0 && parsed.password.length > 0;

  if (nodeEnv === 'production') {
    if (!authenticated) {
      throw new Error(
        'Production MONGODB_URI must include username and password',
      );
    }
    const insecureOptions = [
      'tls',
      'ssl',
      'tlsAllowInvalidCertificates',
      'tlsAllowInvalidHostnames',
      'tlsInsecure',
      'sslValidate',
    ];
    for (const key of insecureOptions) {
      const value = parsed.searchParams.get(key)?.toLowerCase();
      if (
        (key === 'tls' || key === 'ssl') &&
        value &&
        value !== 'true'
      ) {
        throw new Error(`Production MONGODB_URI forbids ${key}=false`);
      }
      if (
        [
          'tlsAllowInvalidCertificates',
          'tlsAllowInvalidHostnames',
          'tlsInsecure',
        ].includes(key) &&
        value === 'true'
      ) {
        throw new Error(`Production MONGODB_URI forbids ${key}=true`);
      }
      if (key === 'sslValidate' && value === 'false') {
        throw new Error('Production MONGODB_URI forbids sslValidate=false');
      }
    }
    const explicitlyDisabledTls =
      parsed.searchParams.get('tls')?.toLowerCase() === 'false' ||
      parsed.searchParams.get('ssl')?.toLowerCase() === 'false';
    if (parsed.protocol === 'mongodb:' && explicitlyDisabledTls) {
      throw new Error('Production MongoDB connections require TLS');
    }
  }

  const tls =
    parsed.protocol === 'mongodb+srv:' ||
    parsed.searchParams.get('tls')?.toLowerCase() === 'true' ||
    parsed.searchParams.get('ssl')?.toLowerCase() === 'true';

  if (nodeEnv === 'production' && parsed.protocol === 'mongodb:' && !tls) {
    throw new Error(
      'Production MongoDB connections require tls=true or mongodb+srv',
    );
  }

  return {
    authenticated,
    tls: nodeEnv === 'production' ? tls : true,
    explicitDatabase: Boolean(databaseName),
  };
}

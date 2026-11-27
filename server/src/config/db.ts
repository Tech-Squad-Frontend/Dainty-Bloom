import mongoose from 'mongoose';

import { env } from './env';
import { logger } from '../utils/logger';
import { validateMongoConnection } from './mongoConnection';

export async function connectDatabase(): Promise<void> {
  validateMongoConnection(env.MONGODB_URI, env.NODE_ENV);
  try {
    await mongoose.connect(env.MONGODB_URI, {
      ...(env.NODE_ENV === 'production'
        ? {
            tls: true,
            tlsAllowInvalidCertificates: false,
            tlsAllowInvalidHostnames: false,
            serverSelectionTimeoutMS: 10_000,
            connectTimeoutMS: 10_000,
          }
        : {}),
    });
    logger.info('Connected to MongoDB');
  } catch {
    logger.error(
      { code: 'MONGODB_CONNECTION_FAILED' },
      'MongoDB connection failed',
    );
    throw new Error('Database connection unavailable');
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info('Disconnected from MongoDB');
}

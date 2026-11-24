import { disconnectDatabase, connectDatabase } from '../config/db';
import { logger } from '../utils/logger';
import { ensureBusinessCategories } from './categoryDefinitions';

async function run(): Promise<void> {
  await connectDatabase();
  try {
    await ensureBusinessCategories(true);
    logger.info('Business categories synchronized');
  } finally {
    await disconnectDatabase();
  }
}

void run().catch((error: unknown) => {
  logger.error({ err: error }, 'Category synchronization failed');
  process.exitCode = 1;
});

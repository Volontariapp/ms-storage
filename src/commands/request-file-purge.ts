import 'reflect-metadata';
import { configureLogger } from '@volontariapp/config';
import { FileModel, PostgresFileRepository } from '@volontariapp/domain-storage';
import { Logger } from '@volontariapp/logger';
import { AppDataSource, appConfig } from '../config/data-source.js';
import { requestFilePurge } from './request-file-purge.command.js';

/** Entry point of the ms-storage-purge CronJob: `node dist/commands/request-file-purge.js`. */
configureLogger(appConfig.logger);
const logger = new Logger({ context: 'RequestFilePurgeCommand' });

requestFilePurge({
  dataSource: AppDataSource,
  createRepository: () => new PostgresFileRepository(AppDataSource.getRepository(FileModel)),
}).catch((error: unknown) => {
  logger.error('File purge request failed', error);
  process.exitCode = 1;
});

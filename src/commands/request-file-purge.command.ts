import { randomUUID } from 'node:crypto';
import type { PostgresFileRepository } from '@volontariapp/domain-storage';
import { Logger } from '@volontariapp/logger';

export interface RequestFilePurgeDeps {
  /** The part of a TypeORM `DataSource` the command uses. */
  dataSource: {
    readonly isInitialized: boolean;
    initialize: () => Promise<unknown>;
    destroy: () => Promise<void>;
  };
  createRepository: () => Pick<PostgresFileRepository, 'requestPurge'>;
  emitterId?: string;
}

const logger = new Logger({ context: 'RequestFilePurgeCommand' });

/**
 * Periodic safety net of the file purge (docs/stockage-fichiers/07-nettoyage-et-orphelins.md,
 * section 3), run by the ms-storage-purge CronJob: writes one storage.cleanup_files job when
 * ORPHANED files are waiting (domain-storage requestPurge). outbox-storage, BullMQ and
 * worker-storage do the purge. The connection is always closed. Returns whether a job was written.
 */
export async function requestFilePurge(deps: RequestFilePurgeDeps): Promise<boolean> {
  const emitterId = deps.emitterId ?? randomUUID();
  if (!deps.dataSource.isInitialized) {
    await deps.dataSource.initialize();
  }
  try {
    const requested = await deps.createRepository().requestPurge(emitterId);
    logger.log(
      requested
        ? `File purge requested (emitter ${emitterId})`
        : 'No ORPHANED file, no purge requested',
    );
    return requested;
  } finally {
    await deps.dataSource.destroy();
  }
}

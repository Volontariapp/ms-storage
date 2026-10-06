import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { DataSource } from 'typeorm';
import { FileModel, ReleasedEntityModel } from '@volontariapp/domain-storage/models';
import { InitialStorageSchema1776700000000 } from '../../migrations/domain/1776700000000-InitialStorageSchema.js';
import { CreateFilesAndReleasedEntities1791300000000 } from '../../migrations/domain/1791300000000-CreateFilesAndReleasedEntities.js';

/**
 * Applies the domain migrations of ms-storage on an empty database and checks the
 * resulting schema against docs/stockage-fichiers/08-contrats-et-evolutions.md (section 8)
 * and against the TypeORM metadata of `FileModel` / `ReleasedEntityModel`.
 *
 * Opt-in: the suite runs only when MS_STORAGE_MIGRATION_TEST_DB_HOST is set (the shared CI
 * runs `yarn test` without a Postgres service). The target database is wiped (DROP SCHEMA public
 * CASCADE), so it must be a throwaway local database: its name must end with `_test`, which
 * keeps the suite away from the development database `ms_storage` of config/local.config.json.
 * `yarn test:migration` after starting one, for example
 * `docker run --rm -d -p 127.0.0.1:5438:5432 -e POSTGRES_USER=user -e POSTGRES_PASSWORD=password -e POSTGRES_DB=ms_storage_migration_test postgres:16-alpine`.
 */
const dbHost = process.env.MS_STORAGE_MIGRATION_TEST_DB_HOST;
const DB_NAME = process.env.MS_STORAGE_MIGRATION_TEST_DB_NAME ?? 'ms_storage_migration_test';
const DB_PORT = Number(process.env.MS_STORAGE_MIGRATION_TEST_DB_PORT ?? 5438);
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1'];
const describeWithDatabase = dbHost === undefined || dbHost === '' ? describe.skip : describe;

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

interface IndexRow {
  indexname: string;
  indexdef: string;
}

interface ConstraintRow {
  column_name: string;
}

const FILES_COLUMNS: Record<string, { type: string; nullable: boolean; default: string | null }> =
  {
    id: { type: 'uuid', nullable: false, default: null },
    owner_id: { type: 'uuid', nullable: false, default: null },
    entity_type: { type: 'character varying', nullable: false, default: null },
    entity_id: { type: 'uuid', nullable: true, default: null },
    status: { type: 'character varying', nullable: false, default: `'PENDING'::character varying` },
    scan_status: {
      type: 'character varying',
      nullable: false,
      default: `'AWAITING_UPLOAD'::character varying`,
    },
    rejection_reason: { type: 'character varying', nullable: true, default: null },
    declared_mime_type: { type: 'character varying', nullable: false, default: null },
    declared_size: { type: 'bigint', nullable: false, default: null },
    actual_size: { type: 'bigint', nullable: true, default: null },
    quarantine_key: { type: 'character varying', nullable: false, default: null },
    public_key: { type: 'character varying', nullable: true, default: null },
    scan_attempts: { type: 'integer', nullable: false, default: '0' },
    rescan_scheduled_at: { type: 'timestamp with time zone', nullable: true, default: null },
    validation_mode: { type: 'character varying', nullable: false, default: null },
    upload_expires_at: { type: 'timestamp with time zone', nullable: false, default: null },
    confirmed_at: { type: 'timestamp with time zone', nullable: true, default: null },
    scanned_at: { type: 'timestamp with time zone', nullable: true, default: null },
    reserved_at: { type: 'timestamp with time zone', nullable: true, default: null },
    attached_at: { type: 'timestamp with time zone', nullable: true, default: null },
    created_at: { type: 'timestamp with time zone', nullable: false, default: 'now()' },
    updated_at: { type: 'timestamp with time zone', nullable: false, default: 'now()' },
  };

const RELEASED_ENTITIES_COLUMNS: typeof FILES_COLUMNS = {
  entity_type: { type: 'character varying', nullable: false, default: null },
  entity_id: { type: 'uuid', nullable: false, default: null },
  released_at: { type: 'timestamp with time zone', nullable: false, default: 'now()' },
};

const FILES_INDEXES: Record<string, { columns: string; where: string | null }> = {
  idx_files_entity: { columns: '(entity_type, entity_id)', where: null },
  idx_files_owner: { columns: '(owner_id)', where: null },
  idx_files_awaiting: {
    columns: '(upload_expires_at)',
    where: `(scan_status)::text = 'AWAITING_UPLOAD'::text`,
  },
  idx_files_scanning: { columns: '(confirmed_at)', where: `(scan_status)::text = 'SCANNING'::text` },
  idx_files_unused: { columns: '(confirmed_at)', where: `(status)::text = 'PENDING'::text` },
  idx_files_reserved: { columns: '(reserved_at)', where: `(status)::text = 'RESERVED'::text` },
  idx_files_orphaned: { columns: '(updated_at)', where: `(status)::text = 'ORPHANED'::text` },
};

describeWithDatabase('ms-storage domain migrations (empty database)', () => {
  let dataSource: DataSource;

  const listColumns = async (table: string): Promise<Record<string, ColumnRow>> => {
    const rows: ColumnRow[] = await dataSource.query(
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    return Object.fromEntries(rows.map((row) => [row.column_name, row]));
  };

  const listIndexes = async (table: string): Promise<IndexRow[]> =>
    dataSource.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname`,
      [table],
    );

  const tableExists = async (table: string): Promise<boolean> => {
    const rows: unknown[] = await dataSource.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    return rows.length > 0;
  };

  beforeAll(async () => {
    const host = dbHost ?? 'localhost';
    if (!LOCAL_HOSTS.includes(host)) {
      throw new Error(`Refusing to wipe a non local database (${host})`);
    }
    if (!DB_NAME.endsWith('_test')) {
      throw new Error(
        `Refusing to wipe the database '${DB_NAME}': the name of a throwaway database must end with '_test'`,
      );
    }

    dataSource = new DataSource({
      type: 'postgres',
      host,
      port: DB_PORT,
      username: process.env.MS_STORAGE_MIGRATION_TEST_DB_USER ?? 'user',
      password: process.env.MS_STORAGE_MIGRATION_TEST_DB_PASSWORD ?? 'password',
      database: DB_NAME,
      entities: [FileModel, ReleasedEntityModel],
      migrations: [InitialStorageSchema1776700000000, CreateFilesAndReleasedEntities1791300000000],
      synchronize: false,
    });
    await dataSource.initialize();
    await dataSource.query('DROP SCHEMA public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
    await dataSource.runMigrations();
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('creates the files table with the documented columns, types, nullability and defaults', async () => {
    const columns = await listColumns('files');

    expect(Object.keys(columns).sort()).toEqual(Object.keys(FILES_COLUMNS).sort());
    for (const [name, expected] of Object.entries(FILES_COLUMNS)) {
      expect(columns[name]?.data_type).toBe(expected.type);
      expect(columns[name]?.is_nullable === 'YES').toBe(expected.nullable);
      expect(columns[name]?.column_default).toBe(expected.default);
    }
  });

  it('creates the released_entities table with the documented columns', async () => {
    const columns = await listColumns('released_entities');

    expect(Object.keys(columns).sort()).toEqual(Object.keys(RELEASED_ENTITIES_COLUMNS).sort());
    for (const [name, expected] of Object.entries(RELEASED_ENTITIES_COLUMNS)) {
      expect(columns[name]?.data_type).toBe(expected.type);
      expect(columns[name]?.is_nullable === 'YES').toBe(expected.nullable);
      expect(columns[name]?.column_default).toBe(expected.default);
    }
  });

  it('creates the seven documented indexes on files, five of them partial', async () => {
    const indexes = (await listIndexes('files')).filter((row) => !row.indexname.startsWith('PK_'));

    expect(indexes.map((row) => row.indexname).sort()).toEqual(Object.keys(FILES_INDEXES).sort());
    expect(indexes.filter((row) => row.indexdef.includes(' WHERE '))).toHaveLength(5);
    for (const row of indexes) {
      const expected = FILES_INDEXES[row.indexname];
      expect(row.indexdef).toContain(`USING btree ${expected?.columns ?? ''}`);
      if (expected?.where === null) {
        expect(row.indexdef).not.toContain(' WHERE ');
      } else {
        expect(row.indexdef).toContain(`WHERE (${expected?.where ?? ''})`);
      }
    }
  });

  it('uses id as the primary key of files and a composite key on released_entities', async () => {
    const primaryKey = async (table: string): Promise<string[]> => {
      const rows: ConstraintRow[] = await dataSource.query(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
         WHERE tc.table_schema = 'public' AND tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
         ORDER BY kcu.ordinal_position`,
        [table],
      );
      return rows.map((row) => row.column_name);
    };

    expect(await primaryKey('files')).toEqual(['id']);
    expect(await primaryKey('released_entities')).toEqual(['entity_type', 'entity_id']);
  });

  it('applies the column defaults on insert', async () => {
    await dataSource.query(
      `INSERT INTO files (id, owner_id, entity_type, declared_mime_type, declared_size, quarantine_key, validation_mode, upload_expires_at)
       VALUES ($1, $2, 'POST_IMAGE', 'image/png', 10, 'quarantine/x', 'SYNC', now())`,
      ['7c9e6679-7425-40de-944b-e07fc1f90ae7', '3b241101-e2bb-4255-8caf-4136c566a962'],
    );
    const rows: Array<{ status: string; scan_status: string; scan_attempts: number }> =
      await dataSource.query(`SELECT status, scan_status, scan_attempts FROM files`);

    expect(rows).toEqual([{ status: 'PENDING', scan_status: 'AWAITING_UPLOAD', scan_attempts: 0 }]);
  });

  it('matches the TypeORM metadata of FileModel and ReleasedEntityModel (no pending change)', async () => {
    const sqlInMemory = await dataSource.driver.createSchemaBuilder().log();

    expect(sqlInMemory.upQueries.map((query) => query.query)).toEqual([]);
    expect(sqlInMemory.downQueries.map((query) => query.query)).toEqual([]);
  });

  it('reverts cleanly and can be applied again', async () => {
    await dataSource.undoLastMigration();

    expect(await tableExists('files')).toBe(false);
    expect(await tableExists('released_entities')).toBe(false);
    expect(await listIndexes('files')).toEqual([]);

    await dataSource.runMigrations();

    expect(await tableExists('files')).toBe(true);
    expect(await tableExists('released_entities')).toBe(true);
    expect((await listIndexes('files')).length).toBe(8);
  });
});

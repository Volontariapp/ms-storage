import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { DataSource, In, type Repository } from 'typeorm';
import {
  EntityType as GrpcEntityType,
  ScanStatus as GrpcScanStatus,
} from '@volontariapp/contracts-nest';
import {
  AttachmentRefusalReason,
  EntityType as DomainEntityType,
  FileAttachmentRefusedException,
  FileModel,
  FileNotFoundException,
  FileStatus,
  PostgresFileRepository,
  ReleasedEntityModel,
  ScanStatus,
  TooManyFilesException,
  ValidationMode,
} from '@volontariapp/domain-storage';
import { PresignedPostSigner, S3StorageClient } from '@volontariapp/storage-pipeline';
import { EventQueueModel, JobsOutboxModel, JobAuditModel } from '@volontariapp/database';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CustomConfig } from '../../config/base-config.js';
import { StorageService } from '../../modules/storage/services/storage.service.js';
import { StorageCommandController } from '../../modules/storage/controllers/commands/storage.command.controller.js';
import { ConfirmFileAttachmentCommandDTO } from '../../modules/storage/dto/request/command/confirm-file-attachment.command.dto.js';
import { createTestAuthUser } from '../unit/modules/storage/storage.factory.js';

const dbHost = process.env.MS_STORAGE_TEST_DB_HOST;
const describeWithDb = dbHost ? describe : describe.skip;

describeWithDb('ConfirmFileAttachment Integration Test', () => {
  let dataSource: DataSource;
  let fileModelRepo: Repository<FileModel>;
  let fileRepository: PostgresFileRepository;
  let presignedPostSigner: PresignedPostSigner;
  let storageService: StorageService;
  let controller: StorageCommandController;
  let appConfigService: AppConfigService;

  const ownerId = '11111111-1111-4111-a111-111111111111';
  const otherOwnerId = '22222222-2222-4222-a222-222222222222';
  const entityId = '33333333-3333-4333-a333-333333333333';
  const otherEntityId = '44444444-4444-4444-a444-444444444444';
  const createdFileIds: string[] = [];

  beforeAll(async () => {
    const rawConfig: Partial<CustomConfig> = {
      port: 3006,
      db: {
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5437),
        username: process.env.DB_USERNAME ?? 'user',
        password: process.env.DB_PASSWORD ?? 'password',
        database: process.env.DB_NAME ?? 'ms_storage',
        maxPoolSize: 5,
        ssl: false,
      },
      s3: {
        endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
        region: 'us-east-1',
        accessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
        secretKey: process.env.S3_SECRET_KEY ?? 'minioadminpassword',
        publicBucket: process.env.S3_PUBLIC_BUCKET ?? 'volontariapp-public',
        privateBucket: process.env.S3_PRIVATE_BUCKET ?? 'volontariapp-private',
        publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? 'http://127.0.0.1:9000',
        publicBaseUrl:
          process.env.S3_PUBLIC_BASE_URL ?? `http://127.0.0.1:9000/volontariapp-public`,
        presignedUrlTtl: 900,
        usePathStyle: true,
      },
    };

    appConfigService = new AppConfigService(rawConfig as CustomConfig);

    dataSource = new DataSource({
      type: 'postgres',
      host: appConfigService.db.host,
      port: appConfigService.db.port,
      username: appConfigService.db.username,
      password: appConfigService.db.password,
      database: appConfigService.db.database,
      entities: [FileModel, ReleasedEntityModel, EventQueueModel, JobsOutboxModel, JobAuditModel],
      synchronize: false,
    });
    await dataSource.initialize();

    fileModelRepo = dataSource.getRepository(FileModel);
    fileRepository = new PostgresFileRepository(fileModelRepo);

    presignedPostSigner = new PresignedPostSigner({
      endpoint: appConfigService.s3.endpoint,
      publicEndpoint: appConfigService.s3.publicEndpoint,
      region: appConfigService.s3.region,
      accessKeyId: appConfigService.s3.accessKey,
      secretAccessKey: appConfigService.s3.secretKey,
      privateBucket: appConfigService.s3.privateBucket,
      publicBucket: appConfigService.s3.publicBucket,
      forcePathStyle: appConfigService.s3.usePathStyle,
    });

    const s3StorageClient = new S3StorageClient({
      endpoint: appConfigService.s3.endpoint,
      publicEndpoint: appConfigService.s3.publicEndpoint,
      region: appConfigService.s3.region,
      accessKeyId: appConfigService.s3.accessKey,
      secretAccessKey: appConfigService.s3.secretKey,
      privateBucket: appConfigService.s3.privateBucket,
      publicBucket: appConfigService.s3.publicBucket,
      publicBaseUrl: appConfigService.s3.publicBaseUrl,
      forcePathStyle: appConfigService.s3.usePathStyle,
    });

    storageService = new StorageService(
      fileRepository,
      presignedPostSigner,
      s3StorageClient,
      appConfigService,
    );
    controller = new StorageCommandController(storageService);
  });

  afterEach(async () => {
    if (createdFileIds.length > 0) {
      await fileModelRepo.delete({ id: In(createdFileIds) });
      createdFileIds.length = 0;
    }
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  async function insertFile(overrides: Partial<FileModel> = {}): Promise<FileModel> {
    const id = overrides.id ?? randomUUID();
    const file: Partial<FileModel> = {
      id,
      ownerId: overrides.ownerId ?? ownerId,
      entityType: overrides.entityType ?? DomainEntityType.POST,
      entityId: overrides.entityId ?? null,
      status: overrides.status ?? FileStatus.PENDING,
      scanStatus: overrides.scanStatus ?? ScanStatus.CLEAN,
      rejectionReason: overrides.rejectionReason ?? null,
      declaredMimeType: overrides.declaredMimeType ?? 'image/jpeg',
      declaredSize: overrides.declaredSize ?? 1024,
      actualSize: overrides.actualSize ?? 1024,
      quarantineKey: overrides.quarantineKey ?? `quarantine/${id}`,
      publicKey:
        overrides.publicKey ??
        (overrides.scanStatus === ScanStatus.CLEAN ? `public/${id}.jpg` : null),
      scanAttempts: overrides.scanAttempts ?? 0,
      rescanScheduledAt: overrides.rescanScheduledAt ?? null,
      validationMode: overrides.validationMode ?? ValidationMode.ASYNC,
      uploadExpiresAt: overrides.uploadExpiresAt ?? new Date(Date.now() + 900000),
      confirmedAt: overrides.confirmedAt ?? new Date(),
      scannedAt:
        overrides.scannedAt ?? (overrides.scanStatus === ScanStatus.CLEAN ? new Date() : null),
      reservedAt: overrides.reservedAt ?? null,
      attachedAt: overrides.attachedAt ?? null,
      ...overrides,
    };
    await fileModelRepo.insert(file);
    createdFileIds.push(id);
    return fileModelRepo.findOneByOrFail({ id });
  }

  it('should reserve CLEAN and SCANNING files for a post in input order and populate reservedAt', async () => {
    const cleanFile = await insertFile({ scanStatus: ScanStatus.CLEAN });
    const scanningFile = await insertFile({ scanStatus: ScanStatus.SCANNING });

    const command = new ConfirmFileAttachmentCommandDTO();
    command.fileIds = [scanningFile.id, cleanFile.id];
    command.entityType = GrpcEntityType.ENTITY_TYPE_POST;
    command.entityId = entityId;

    const response = await storageService.confirmFileAttachment(ownerId, command);

    expect(response.success).toBe(true);
    expect(response.updatedCount).toBe(2);
    expect(response.files).toHaveLength(2);

    // Verify ordering is preserved
    expect(response.files[0]?.id).toBe(scanningFile.id);
    expect(response.files[0]?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_SCANNING);
    expect(response.files[0]?.objectKey).toBe('');
    expect(response.files[0]?.publicUrl).toBeUndefined();

    expect(response.files[1]?.id).toBe(cleanFile.id);
    expect(response.files[1]?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_CLEAN);
    expect(response.files[1]?.objectKey).toBe(`public/${cleanFile.id}.jpg`);
    expect(response.files[1]?.publicUrl).toBe(
      `http://127.0.0.1:9000/volontariapp-public/post/${cleanFile.id}.webp`,
    );

    // Verify database state
    const rows = await fileModelRepo.findBy({ id: In([cleanFile.id, scanningFile.id]) });
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe(FileStatus.RESERVED);
      expect(row.entityId).toBe(entityId);
      expect(row.reservedAt).not.toBeNull();
    }
  });

  it('should be idempotent when replaying reservation for the same entity', async () => {
    const file = await insertFile({ scanStatus: ScanStatus.CLEAN });

    const command = new ConfirmFileAttachmentCommandDTO();
    command.fileIds = [file.id];
    command.entityType = GrpcEntityType.ENTITY_TYPE_POST;
    command.entityId = entityId;

    const firstResponse = await storageService.confirmFileAttachment(ownerId, command);
    expect(firstResponse.success).toBe(true);
    expect(firstResponse.updatedCount).toBe(1);

    const firstRow = await fileModelRepo.findOneByOrFail({ id: file.id });
    expect(firstRow.status).toBe(FileStatus.RESERVED);
    expect(firstRow.entityId).toBe(entityId);
    const initialReservedAt = firstRow.reservedAt;

    // Second call with same entity
    const replayResponse = await storageService.confirmFileAttachment(ownerId, command);
    expect(replayResponse.success).toBe(true);
    expect(replayResponse.updatedCount).toBe(1);
    expect(replayResponse.files[0]?.id).toBe(file.id);

    const secondRow = await fileModelRepo.findOneByOrFail({ id: file.id });
    expect(secondRow.status).toBe(FileStatus.RESERVED);
    expect(secondRow.entityId).toBe(entityId);
    expect(secondRow.reservedAt?.getTime()).toBe(initialReservedAt?.getTime());
  });

  it('should throw FileNotFoundException when file belongs to another user (owner mismatch)', async () => {
    const file = await insertFile({
      ownerId: otherOwnerId,
      scanStatus: ScanStatus.CLEAN,
    });

    const command = new ConfirmFileAttachmentCommandDTO();
    command.fileIds = [file.id];
    command.entityType = GrpcEntityType.ENTITY_TYPE_POST;
    command.entityId = entityId;

    await expect(storageService.confirmFileAttachment(ownerId, command)).rejects.toThrow(
      FileNotFoundException,
    );
  });

  it('should throw FileNotFoundException when file does not exist', async () => {
    const nonExistentId = randomUUID();

    const command = new ConfirmFileAttachmentCommandDTO();
    command.fileIds = [nonExistentId];
    command.entityType = GrpcEntityType.ENTITY_TYPE_POST;
    command.entityId = entityId;

    await expect(storageService.confirmFileAttachment(ownerId, command)).rejects.toThrow(
      FileNotFoundException,
    );
  });

  it('should throw FileAttachmentRefusedException when file is already reserved by another entity', async () => {
    const file = await insertFile({
      status: FileStatus.RESERVED,
      entityId: otherEntityId,
      scanStatus: ScanStatus.CLEAN,
      reservedAt: new Date(),
    });

    const command = new ConfirmFileAttachmentCommandDTO();
    command.fileIds = [file.id];
    command.entityType = GrpcEntityType.ENTITY_TYPE_POST;
    command.entityId = entityId;

    await expect(storageService.confirmFileAttachment(ownerId, command)).rejects.toThrow(
      FileAttachmentRefusedException,
    );
  });

  it('should throw FileAttachmentRefusedException when entity type does not match declaration', async () => {
    const file = await insertFile({
      entityType: DomainEntityType.USER_AVATAR,
      scanStatus: ScanStatus.CLEAN,
    });

    const command = new ConfirmFileAttachmentCommandDTO();
    command.fileIds = [file.id];
    command.entityType = GrpcEntityType.ENTITY_TYPE_POST;
    command.entityId = entityId;

    await expect(storageService.confirmFileAttachment(ownerId, command)).rejects.toThrow(
      FileAttachmentRefusedException,
    );
  });

  it('should throw FileAttachmentRefusedException when file is awaiting upload', async () => {
    const file = await insertFile({
      scanStatus: ScanStatus.AWAITING_UPLOAD,
    });

    const command = new ConfirmFileAttachmentCommandDTO();
    command.fileIds = [file.id];
    command.entityType = GrpcEntityType.ENTITY_TYPE_POST;
    command.entityId = entityId;

    await expect(storageService.confirmFileAttachment(ownerId, command)).rejects.toThrow(
      FileAttachmentRefusedException,
    );
  });

  it('should throw FileAttachmentRefusedException when file is rejected', async () => {
    const file = await insertFile({
      scanStatus: ScanStatus.REJECTED,
    });

    const command = new ConfirmFileAttachmentCommandDTO();
    command.fileIds = [file.id];
    command.entityType = GrpcEntityType.ENTITY_TYPE_POST;
    command.entityId = entityId;

    await expect(storageService.confirmFileAttachment(ownerId, command)).rejects.toThrow(
      FileAttachmentRefusedException,
    );
  });

  it('should throw FileAttachmentRefusedException when SCANNING file is reserved for an entity type without async (USER_AVATAR)', async () => {
    const file = await insertFile({
      entityType: DomainEntityType.USER_AVATAR,
      scanStatus: ScanStatus.SCANNING,
    });

    const command = new ConfirmFileAttachmentCommandDTO();
    command.fileIds = [file.id];
    command.entityType = GrpcEntityType.ENTITY_TYPE_USER_AVATAR;
    command.entityId = entityId;

    const error = await storageService
      .confirmFileAttachment(ownerId, command)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(FileAttachmentRefusedException);
    expect((error as FileAttachmentRefusedException).details?.reason).toBe(
      AttachmentRefusalReason.SCAN_STATUS_NOT_ACCEPTED,
    );
  });

  it('should throw TooManyFilesException when file count exceeds policy maximum', async () => {
    const file1 = await insertFile({
      entityType: DomainEntityType.USER_AVATAR,
      scanStatus: ScanStatus.CLEAN,
    });
    const file2 = await insertFile({
      entityType: DomainEntityType.USER_AVATAR,
      scanStatus: ScanStatus.CLEAN,
    });

    const command = new ConfirmFileAttachmentCommandDTO();
    command.fileIds = [file1.id, file2.id]; // USER_AVATAR max is 1
    command.entityType = GrpcEntityType.ENTITY_TYPE_USER_AVATAR;
    command.entityId = entityId;

    await expect(storageService.confirmFileAttachment(ownerId, command)).rejects.toThrow(
      TooManyFilesException,
    );
  });

  it('should execute end-to-end through StorageCommandController with @CurrentUser()', async () => {
    const file = await insertFile({ scanStatus: ScanStatus.CLEAN });
    const authUser = createTestAuthUser({ id: ownerId });

    const command = new ConfirmFileAttachmentCommandDTO();
    command.fileIds = [file.id];
    command.entityType = GrpcEntityType.ENTITY_TYPE_POST;
    command.entityId = entityId;

    const response = await controller.confirmFileAttachment(command, authUser);

    expect(response.success).toBe(true);
    expect(response.updatedCount).toBe(1);
    expect(response.files[0]?.id).toBe(file.id);
  });
});

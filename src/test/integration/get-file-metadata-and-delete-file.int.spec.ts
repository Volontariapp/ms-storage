import 'reflect-metadata';
import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { DataSource, type Repository } from 'typeorm';
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import {
  EntityType as GrpcEntityType,
  FileStatus as GrpcFileStatus,
  ScanStatus as GrpcScanStatus,
} from '@volontariapp/contracts-nest';
import {
  FileModel,
  FileStatus,
  FileNotFoundException,
  PostgresFileRepository,
  ReleasedEntityModel,
} from '@volontariapp/domain-storage';
import {
  PresignedPostSigner,
  S3StorageClient,
  StoragePipelineService,
  type S3StorageConfig,
} from '@volontariapp/storage-pipeline';
import { EventQueueModel, JobsOutboxModel, JobAuditModel } from '@volontariapp/database';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CustomConfig } from '../../config/base-config.js';
import { StorageService } from '../../modules/storage/services/storage.service.js';
import { GenerateUploadUrlCommandDTO } from '../../modules/storage/dto/request/command/generate-upload-url.command.dto.js';
import { GetFileMetadataQueryDTO } from '../../modules/storage/dto/request/query/get-file-metadata.query.dto.js';
import { DeleteFileCommandDTO } from '../../modules/storage/dto/request/command/delete-file.command.dto.js';
import { FileDeletionNotAllowedException } from '../../modules/storage/exceptions/file-deletion-not-allowed.exception.js';

const dbHost = process.env.MS_STORAGE_TEST_DB_HOST;
const describeWithDb = dbHost ? describe : describe.skip;

describeWithDb('GetFileMetadata and DeleteFile Integration Test', () => {
  let dataSource: DataSource;
  let fileModelRepo: Repository<FileModel>;
  let fileRepository: PostgresFileRepository;
  let presignedPostSigner: PresignedPostSigner;
  let s3StorageClient: S3StorageClient;
  let storagePipelineService: StoragePipelineService;
  let storageService: StorageService;
  let s3Client: S3Client;
  let appConfigService: AppConfigService;

  const privateBucket = process.env.S3_PRIVATE_BUCKET ?? 'volontariapp-private';
  const publicBucket = process.env.S3_PUBLIC_BUCKET ?? 'volontariapp-public';
  const ownerId = '44444444-4444-4444-4444-444444444444';
  const otherOwnerId = '55555555-5555-5555-5555-555555555555';
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
        publicBucket,
        privateBucket,
        publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? 'http://127.0.0.1:9000',
        publicBaseUrl:
          process.env.S3_PUBLIC_BASE_URL ?? 'http://127.0.0.1:9000/volontariapp-public',
        presignedUrlTtl: 900,
        usePathStyle: true,
      },
      scanner: {
        host: process.env.SCANNER_HOST ?? 'localhost',
        port: Number(process.env.SCANNER_PORT ?? 3310),
        timeoutMs: 5000,
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

    s3Client = new S3Client({
      endpoint: appConfigService.s3.endpoint,
      region: appConfigService.s3.region,
      credentials: {
        accessKeyId: appConfigService.s3.accessKey,
        secretAccessKey: appConfigService.s3.secretKey,
      },
      forcePathStyle: appConfigService.s3.usePathStyle,
    });

    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: privateBucket }));
    } catch {
      // Bucket already exists
    }
    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: publicBucket }));
    } catch {
      // Bucket already exists
    }

    const s3Config: S3StorageConfig = {
      endpoint: appConfigService.s3.endpoint,
      publicEndpoint: appConfigService.s3.publicEndpoint,
      region: appConfigService.s3.region,
      accessKeyId: appConfigService.s3.accessKey,
      secretAccessKey: appConfigService.s3.secretKey,
      privateBucket,
      publicBucket,
      publicBaseUrl: appConfigService.s3.publicBaseUrl,
      forcePathStyle: appConfigService.s3.usePathStyle,
    };

    presignedPostSigner = new PresignedPostSigner(s3Config);
    s3StorageClient = new S3StorageClient(s3Config);
    storagePipelineService = new StoragePipelineService({
      s3: s3Config,
      scanner: {
        host: appConfigService.scanner.host,
        port: appConfigService.scanner.port,
        timeoutMs: appConfigService.scanner.timeoutMs,
      },
    });

    storageService = new StorageService(
      fileRepository,
      presignedPostSigner,
      s3StorageClient,
      storagePipelineService,
      appConfigService,
    );
  });

  afterEach(async () => {
    for (const fileId of createdFileIds) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: privateBucket,
            Key: `quarantine/${fileId}`,
          }),
        );
      } catch {
        // ignore cleanup error
      }
      try {
        await fileModelRepo.delete({ id: fileId });
      } catch {
        // ignore cleanup error
      }
    }
    createdFileIds.length = 0;
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  describe('GetFileMetadata', () => {
    it('should return metadata of a pending file without exposing quarantineKey', async () => {
      const genCommand = new GenerateUploadUrlCommandDTO();
      genCommand.mimeType = 'image/jpeg';
      genCommand.sizeBytes = 100 * 1024;
      genCommand.entityType = GrpcEntityType.ENTITY_TYPE_USER_AVATAR;

      const genRes = await storageService.generateUploadUrl(ownerId, genCommand);
      createdFileIds.push(genRes.fileId);

      const query = new GetFileMetadataQueryDTO();
      query.fileId = genRes.fileId;

      const metadataRes = await storageService.getFileMetadata(ownerId, query);

      expect(metadataRes.file).toBeDefined();
      expect(metadataRes.file?.id).toBe(genRes.fileId);
      expect(metadataRes.file?.ownerId).toBe(ownerId);
      expect(metadataRes.file?.status).toBe(GrpcFileStatus.FILE_STATUS_PENDING);
      expect(metadataRes.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_AWAITING_UPLOAD);
      expect(metadataRes.file?.objectKey).toBe('');
      expect(metadataRes.file?.publicUrl).toBeUndefined();
    });

    it('should throw FileNotFoundException when queried by another user (zero information leak)', async () => {
      const genCommand = new GenerateUploadUrlCommandDTO();
      genCommand.mimeType = 'image/jpeg';
      genCommand.sizeBytes = 100 * 1024;
      genCommand.entityType = GrpcEntityType.ENTITY_TYPE_POST;

      const genRes = await storageService.generateUploadUrl(ownerId, genCommand);
      createdFileIds.push(genRes.fileId);

      const query = new GetFileMetadataQueryDTO();
      query.fileId = genRes.fileId;

      await expect(storageService.getFileMetadata(otherOwnerId, query)).rejects.toThrow(
        FileNotFoundException,
      );
    });

    it('should throw FileNotFoundException when file does not exist', async () => {
      const query = new GetFileMetadataQueryDTO();
      query.fileId = '00000000-0000-4000-a000-000000000000';

      await expect(storageService.getFileMetadata(ownerId, query)).rejects.toThrow(
        FileNotFoundException,
      );
    });
  });

  describe('DeleteFile', () => {
    it('should delete a PENDING file, remove quarantine object from S3, and mark as DELETED', async () => {
      const genCommand = new GenerateUploadUrlCommandDTO();
      genCommand.mimeType = 'image/jpeg';
      genCommand.sizeBytes = 50 * 1024;
      genCommand.entityType = GrpcEntityType.ENTITY_TYPE_USER_AVATAR;

      const genRes = await storageService.generateUploadUrl(ownerId, genCommand);
      const fileId = genRes.fileId;
      createdFileIds.push(fileId);

      // Upload dummy object to quarantine
      await s3Client.send(
        new PutObjectCommand({
          Bucket: privateBucket,
          Key: `quarantine/${fileId}`,
          Body: Buffer.from('dummy-file-content'),
          ContentType: 'image/jpeg',
        }),
      );

      // Verify object exists in quarantine
      const headBefore = await s3Client.send(
        new HeadObjectCommand({
          Bucket: privateBucket,
          Key: `quarantine/${fileId}`,
        }),
      );
      expect(headBefore.ContentLength).toBeGreaterThan(0);

      // Delete file
      const delCommand = new DeleteFileCommandDTO();
      delCommand.fileId = fileId;

      const delRes = await storageService.deleteFile(ownerId, delCommand);
      expect(delRes.success).toBe(true);

      // Verify status in DB is DELETED
      const row = await fileModelRepo.findOne({ where: { id: fileId } });
      expect(row?.status).toBe(FileStatus.DELETED);

      // Verify object in S3 quarantine is deleted
      await expect(
        s3Client.send(
          new HeadObjectCommand({
            Bucket: privateBucket,
            Key: `quarantine/${fileId}`,
          }),
        ),
      ).rejects.toThrow();

      // Subsequent GetFileMetadata should throw FileNotFoundException (deleted)
      const getQuery = new GetFileMetadataQueryDTO();
      getQuery.fileId = fileId;
      await expect(storageService.getFileMetadata(ownerId, getQuery)).rejects.toThrow(
        FileNotFoundException,
      );

      // Subsequent DeleteFile call should be idempotent
      const retryDel = await storageService.deleteFile(ownerId, delCommand);
      expect(retryDel.success).toBe(true);
    });

    it('should throw FileNotFoundException when another user attempts to delete the file', async () => {
      const genCommand = new GenerateUploadUrlCommandDTO();
      genCommand.mimeType = 'image/jpeg';
      genCommand.sizeBytes = 50 * 1024;
      genCommand.entityType = GrpcEntityType.ENTITY_TYPE_POST;

      const genRes = await storageService.generateUploadUrl(ownerId, genCommand);
      const fileId = genRes.fileId;
      createdFileIds.push(fileId);

      const delCommand = new DeleteFileCommandDTO();
      delCommand.fileId = fileId;

      await expect(storageService.deleteFile(otherOwnerId, delCommand)).rejects.toThrow(
        FileNotFoundException,
      );

      // Verify status in DB is still PENDING
      const row = await fileModelRepo.findOne({ where: { id: fileId } });
      expect(row?.status).toBe(FileStatus.PENDING);
    });

    it('should refuse deletion with FileDeletionNotAllowedException when file is RESERVED or ATTACHED', async () => {
      const genCommand = new GenerateUploadUrlCommandDTO();
      genCommand.mimeType = 'image/jpeg';
      genCommand.sizeBytes = 50 * 1024;
      genCommand.entityType = GrpcEntityType.ENTITY_TYPE_POST;

      const genRes = await storageService.generateUploadUrl(ownerId, genCommand);
      const fileId = genRes.fileId;
      createdFileIds.push(fileId);

      // Move file to RESERVED
      await fileModelRepo.update({ id: fileId }, { status: FileStatus.RESERVED });

      const delCommand = new DeleteFileCommandDTO();
      delCommand.fileId = fileId;

      // Attempt deletion on RESERVED file
      await expect(storageService.deleteFile(ownerId, delCommand)).rejects.toThrow(
        FileDeletionNotAllowedException,
      );

      // Move file to ATTACHED
      await fileModelRepo.update({ id: fileId }, { status: FileStatus.ATTACHED });

      // Attempt deletion on ATTACHED file
      await expect(storageService.deleteFile(ownerId, delCommand)).rejects.toThrow(
        FileDeletionNotAllowedException,
      );
    });
  });
});

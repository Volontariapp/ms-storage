import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { DataSource } from 'typeorm';
import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { EntityType as GrpcEntityType } from '@volontariapp/contracts-nest';
import {
  FileModel,
  FileStatus,
  PostgresFileRepository,
  ReleasedEntityModel,
  ScanStatus,
  ValidationMode,
} from '@volontariapp/domain-storage';
import {
  PresignedPostSigner,
  S3StorageClient,
  StoragePipelineService,
} from '@volontariapp/storage-pipeline';
import { EventQueueModel, JobsOutboxModel, JobAuditModel } from '@volontariapp/database';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CustomConfig } from '../../config/base-config.js';
import { StorageService } from '../../modules/storage/services/storage.service.js';
import { GenerateUploadUrlCommandDTO } from '../../modules/storage/dto/request/command/generate-upload-url.command.dto.js';

const dbHost = process.env.MS_STORAGE_TEST_DB_HOST;
const describeWithDb = dbHost ? describe : describe.skip;

describeWithDb('GenerateUploadUrl E2E Integration Test', () => {
  let dataSource: DataSource;
  let fileRepository: PostgresFileRepository;
  let presignedPostSigner: PresignedPostSigner;
  let storageService: StorageService;
  let s3Client: S3Client;
  let appConfigService: AppConfigService;

  const privateBucket = process.env.S3_PRIVATE_BUCKET ?? 'volontariapp-private';
  const ownerId = '33333333-3333-3333-3333-333333333333';
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
        privateBucket,
        publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? 'http://127.0.0.1:9000',
        publicBaseUrl:
          process.env.S3_PUBLIC_BASE_URL ?? `http://127.0.0.1:9000/volontariapp-public`,
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

    const repo = dataSource.getRepository(FileModel);
    fileRepository = new PostgresFileRepository(repo);

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

    s3Client = new S3Client({
      endpoint: appConfigService.s3.endpoint,
      region: appConfigService.s3.region,
      credentials: {
        accessKeyId: appConfigService.s3.accessKey,
        secretAccessKey: appConfigService.s3.secretKey,
      },
      forcePathStyle: appConfigService.s3.usePathStyle,
    });

    // Ensure private quarantine bucket exists
    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: privateBucket }));
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'name' in err &&
        (err.name === 'BucketAlreadyOwnedByYou' || err.name === 'BucketAlreadyExists')
      ) {
        // already exists
      } else {
        throw err;
      }
    }

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

    const storagePipelineService = new StoragePipelineService({
      s3: {
        endpoint: appConfigService.s3.endpoint,
        publicEndpoint: appConfigService.s3.publicEndpoint,
        region: appConfigService.s3.region,
        accessKeyId: appConfigService.s3.accessKey,
        secretAccessKey: appConfigService.s3.secretKey,
        privateBucket: appConfigService.s3.privateBucket,
        publicBucket: appConfigService.s3.publicBucket,
        publicBaseUrl: appConfigService.s3.publicBaseUrl,
        forcePathStyle: appConfigService.s3.usePathStyle,
      },
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

  afterAll(async () => {
    // Cleanup files in MinIO and DB
    for (const fileId of createdFileIds) {
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: privateBucket,
            Key: `quarantine/${fileId}`,
          }),
        );
      } catch {
        // ignore
      }
      try {
        await dataSource.getRepository(FileModel).delete({ id: fileId });
      } catch {
        // ignore
      }
    }

    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  it('should generate upload URL, insert row in DB, and allow multipart POST upload to MinIO quarantine', async () => {
    const command = new GenerateUploadUrlCommandDTO();
    command.mimeType = 'image/jpeg';
    command.sizeBytes = 2 * 1024 * 1024; // 2 MB -> ASYNC for POST
    command.entityType = GrpcEntityType.ENTITY_TYPE_POST;
    command.isPublic = true;

    // 1. Generate upload URL via StorageService
    const result = await storageService.generateUploadUrl(ownerId, command);
    expect(result.fileId).toBeDefined();
    expect(result.uploadUrl).toBeDefined();
    expect(result.uploadFields).toBeDefined();
    expect(result.expiresAt).toBeDefined();

    createdFileIds.push(result.fileId);

    // 2. Verify DB persistence
    const fileRow = await dataSource.getRepository(FileModel).findOneBy({ id: result.fileId });
    expect(fileRow).not.toBeNull();
    expect(fileRow?.ownerId).toBe(ownerId);
    expect(fileRow?.entityType).toBe('POST');
    expect(fileRow?.status).toBe(FileStatus.PENDING);
    expect(fileRow?.scanStatus).toBe(ScanStatus.AWAITING_UPLOAD);
    expect(fileRow?.validationMode).toBe(ValidationMode.ASYNC);
    expect(fileRow?.declaredMimeType).toBe('image/jpeg');
    expect(fileRow?.quarantineKey).toBe(`quarantine/${result.fileId}`);

    // 3. Perform multipart POST upload directly to MinIO quarantine using returned fields
    const formData = new FormData();
    for (const [key, value] of Object.entries(result.uploadFields)) {
      formData.append(key, value);
    }
    const sampleImageContent = Buffer.from('fake-image-bytes-for-test-upload');
    const blob = new Blob([sampleImageContent], { type: 'image/jpeg' });
    formData.append('file', blob);

    const uploadResponse = await fetch(result.uploadUrl, {
      method: 'POST',
      body: formData,
    });

    // S3/MinIO returns 204 No Content or 200 OK for successful POST
    expect([200, 204]).toContain(uploadResponse.status);

    // 4. Verify the object is actually in MinIO quarantine bucket
    const headResult = await s3Client.send(
      new HeadObjectCommand({
        Bucket: privateBucket,
        Key: `quarantine/${result.fileId}`,
      }),
    );
    expect(headResult.ContentLength).toBe(sampleImageContent.length);
  });
});

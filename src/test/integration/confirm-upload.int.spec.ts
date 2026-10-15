import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { DataSource, In, type Repository } from 'typeorm';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  FileStatus as GrpcFileStatus,
  ScanStatus as GrpcScanStatus,
  ValidationMode as GrpcValidationMode,
} from '@volontariapp/contracts-nest';
import {
  EntityType as DomainEntityType,
  FileModel,
  FileNotFoundException,
  FileStatus,
  PostgresFileRepository,
  RejectionReason,
  ReleasedEntityModel,
  ScanStatus,
  ValidationMode,
} from '@volontariapp/domain-storage';
import {
  PresignedPostSigner,
  S3StorageClient,
  StoragePipelineService,
  ScannerTechnicalError,
} from '@volontariapp/storage-pipeline';
import { EventQueueModel, JobAuditModel, JobsOutboxModel } from '@volontariapp/database';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CustomConfig } from '../../config/base-config.js';
import { StorageService } from '../../modules/storage/services/storage.service.js';
import { StorageCommandController } from '../../modules/storage/controllers/commands/storage.command.controller.js';
import { ConfirmUploadCommandDTO } from '../../modules/storage/dto/request/command/confirm-upload.command.dto.js';
import { UploadConfirmationFailedException } from '../../modules/storage/exceptions/upload-confirmation-failed.exception.js';
import { createTestAuthUser } from '../unit/modules/storage/storage.factory.js';

const dbHost = process.env.MS_STORAGE_TEST_DB_HOST;
const describeWithDb = dbHost ? describe : describe.skip;

describeWithDb('ConfirmUpload Integration Test', () => {
  let dataSource: DataSource;
  let fileModelRepo: Repository<FileModel>;
  let jobsOutboxRepo: Repository<JobsOutboxModel>;
  let fileRepository: PostgresFileRepository;
  let presignedPostSigner: PresignedPostSigner;
  let s3StorageClient: S3StorageClient;
  let storagePipelineService: StoragePipelineService;
  let s3Client: S3Client;
  let storageService: StorageService;
  let controller: StorageCommandController;
  let appConfigService: AppConfigService;

  const privateBucket = process.env.S3_PRIVATE_BUCKET ?? 'volontariapp-private';
  const publicBucket = process.env.S3_PUBLIC_BUCKET ?? 'volontariapp-public';
  const ownerId = '11111111-1111-4111-a111-111111111111';
  const otherOwnerId = '22222222-2222-4222-a222-222222222222';
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
    jobsOutboxRepo = dataSource.getRepository(JobsOutboxModel);
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

    try {
      await s3Client.send(new CreateBucketCommand({ Bucket: publicBucket }));
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

    s3StorageClient = new S3StorageClient({
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

    storagePipelineService = new StoragePipelineService({
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
    controller = new StorageCommandController(storageService);
  });

  afterEach(async () => {
    jest.restoreAllMocks();

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
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: publicBucket,
            Key: `user-avatar/${fileId}.webp`,
          }),
        );
      } catch {
        // ignore
      }
      try {
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: publicBucket,
            Key: `post/${fileId}.webp`,
          }),
        );
      } catch {
        // ignore
      }
    }

    if (createdFileIds.length > 0) {
      await fileModelRepo.delete({ id: In(createdFileIds) });
      await jobsOutboxRepo
        .createQueryBuilder()
        .delete()
        .where("payload->>'fileId' IN (:...ids)", { ids: createdFileIds })
        .execute();
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
      scanStatus: overrides.scanStatus ?? ScanStatus.AWAITING_UPLOAD,
      rejectionReason: overrides.rejectionReason ?? null,
      declaredMimeType: overrides.declaredMimeType ?? 'image/jpeg',
      declaredSize: overrides.declaredSize ?? 1024,
      actualSize: overrides.actualSize ?? null,
      quarantineKey: overrides.quarantineKey ?? `quarantine/${id}`,
      publicKey:
        overrides.publicKey ??
        (overrides.scanStatus === ScanStatus.CLEAN ? `public/post/${id}.webp` : null),
      scanAttempts: overrides.scanAttempts ?? 0,
      rescanScheduledAt: overrides.rescanScheduledAt ?? null,
      validationMode: overrides.validationMode ?? ValidationMode.ASYNC,
      uploadExpiresAt: overrides.uploadExpiresAt ?? new Date(Date.now() + 900000),
      confirmedAt: overrides.confirmedAt ?? null,
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

  function buildValidJpegBuffer(size: number): Buffer {
    const buf = Buffer.alloc(size, 0x00);
    buf[0] = 0xff;
    buf[1] = 0xd8;
    buf[2] = 0xff;
    buf[3] = 0xe0;
    buf[size - 2] = 0xff;
    buf[size - 1] = 0xd9;
    return buf;
  }

  async function putQuarantineObject(
    fileId: string,
    content: string | Buffer = 'test-file-content-bytes',
  ) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: privateBucket,
        Key: `quarantine/${fileId}`,
        Body: typeof content === 'string' ? Buffer.from(content) : content,
        ContentType: 'image/jpeg',
      }),
    );
  }

  it('moves an ASYNC file to SCANNING, updates actualSize and creates 1 job in jobs_outbox', async () => {
    const file = await insertFile({ validationMode: ValidationMode.ASYNC });
    const content = 'test-payload-bytes-12345';
    await putQuarantineObject(file.id, content);

    const command = new ConfirmUploadCommandDTO();
    command.fileId = file.id;

    const result = await storageService.confirmUpload(ownerId, command);

    expect(result.file).toBeDefined();
    expect(result.file?.id).toBe(file.id);
    expect(result.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_SCANNING);
    expect(result.file?.status).toBe(GrpcFileStatus.FILE_STATUS_PENDING);
    expect(result.file?.publicUrl).toBeUndefined();

    // Verify row state
    const updated = await fileModelRepo.findOneByOrFail({ id: file.id });
    expect(updated.scanStatus).toBe(ScanStatus.SCANNING);
    expect(updated.actualSize).toBe(content.length);
    expect(updated.scanAttempts).toBe(1);
    expect(updated.confirmedAt).toBeInstanceOf(Date);

    // Verify jobs_outbox state
    const jobs = await jobsOutboxRepo
      .createQueryBuilder('job')
      .where("job.payload->>'fileId' = :fileId", { fileId: file.id })
      .getMany();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.type).toBe('storage.scan_file');
    expect(jobs[0]?.target).toBe('storage-queue');
    expect(jobs[0]?.payload).toEqual({ fileId: file.id });
    expect(jobs[0]?.emitterId).toBe(ownerId);
  });

  it('is idempotent when replayed on a SCANNING file: does not create duplicate jobs or increment scanAttempts', async () => {
    const file = await insertFile({ validationMode: ValidationMode.ASYNC });
    await putQuarantineObject(file.id, 'repeatable-content');

    const command = new ConfirmUploadCommandDTO();
    command.fileId = file.id;

    const firstResult = await storageService.confirmUpload(ownerId, command);
    expect(firstResult.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_SCANNING);

    const replayResult = await storageService.confirmUpload(ownerId, command);
    expect(replayResult.file?.id).toBe(file.id);
    expect(replayResult.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_SCANNING);

    const updated = await fileModelRepo.findOneByOrFail({ id: file.id });
    expect(updated.scanAttempts).toBe(1);

    const jobs = await jobsOutboxRepo
      .createQueryBuilder('job')
      .where("job.payload->>'fileId' = :fileId", { fileId: file.id })
      .getMany();
    expect(jobs).toHaveLength(1);
  });

  it('returns current state idempotently when file is already CLEAN', async () => {
    const file = await insertFile({
      scanStatus: ScanStatus.CLEAN,
      publicKey: 'post/sample.webp',
      actualSize: 2048,
    });

    const command = new ConfirmUploadCommandDTO();
    command.fileId = file.id;

    const result = await storageService.confirmUpload(ownerId, command);
    expect(result.file?.id).toBe(file.id);
    expect(result.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_CLEAN);
    expect(result.file?.publicUrl).toBe(
      `http://127.0.0.1:9000/volontariapp-public/post/${file.id}.webp`,
    );

    const jobs = await jobsOutboxRepo
      .createQueryBuilder('job')
      .where("job.payload->>'fileId' = :fileId", { fileId: file.id })
      .getMany();
    expect(jobs).toHaveLength(0);
  });

  it('returns current state idempotently when file is already REJECTED', async () => {
    const file = await insertFile({
      scanStatus: ScanStatus.REJECTED,
      rejectionReason: RejectionReason.MALWARE,
      actualSize: 1024,
    });

    const command = new ConfirmUploadCommandDTO();
    command.fileId = file.id;

    const result = await storageService.confirmUpload(ownerId, command);
    expect(result.file?.id).toBe(file.id);
    expect(result.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_REJECTED);
    expect(result.file?.publicUrl).toBeUndefined();

    const jobs = await jobsOutboxRepo
      .createQueryBuilder('job')
      .where("job.payload->>'fileId' = :fileId", { fileId: file.id })
      .getMany();
    expect(jobs).toHaveLength(0);
  });

  it('throws UploadConfirmationFailedException (422) if object is missing from S3 quarantine', async () => {
    const file = await insertFile({ validationMode: ValidationMode.ASYNC });
    // Intentionally NOT uploading object to quarantine S3

    const command = new ConfirmUploadCommandDTO();
    command.fileId = file.id;

    await expect(storageService.confirmUpload(ownerId, command)).rejects.toThrow(
      UploadConfirmationFailedException,
    );

    // Row is unchanged
    const unchanged = await fileModelRepo.findOneByOrFail({ id: file.id });
    expect(unchanged.scanStatus).toBe(ScanStatus.AWAITING_UPLOAD);
    expect(unchanged.scanAttempts).toBe(0);

    // Outbox has no job
    const jobs = await jobsOutboxRepo
      .createQueryBuilder('job')
      .where("job.payload->>'fileId' = :fileId", { fileId: file.id })
      .getMany();
    expect(jobs).toHaveLength(0);
  });

  it('throws UploadConfirmationFailedException (422) if upload URL has expired', async () => {
    const file = await insertFile({
      validationMode: ValidationMode.ASYNC,
      uploadExpiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
    });
    await putQuarantineObject(file.id, 'expired-content');

    const command = new ConfirmUploadCommandDTO();
    command.fileId = file.id;

    await expect(storageService.confirmUpload(ownerId, command)).rejects.toThrow(
      UploadConfirmationFailedException,
    );

    const unchanged = await fileModelRepo.findOneByOrFail({ id: file.id });
    expect(unchanged.scanStatus).toBe(ScanStatus.AWAITING_UPLOAD);
    expect(unchanged.scanAttempts).toBe(0);

    const jobs = await jobsOutboxRepo
      .createQueryBuilder('job')
      .where("job.payload->>'fileId' = :fileId", { fileId: file.id })
      .getMany();
    expect(jobs).toHaveLength(0);
  });

  it('throws FileNotFoundException (404) for unknown file or mismatched owner', async () => {
    const command = new ConfirmUploadCommandDTO();
    command.fileId = randomUUID();

    await expect(storageService.confirmUpload(ownerId, command)).rejects.toThrow(
      FileNotFoundException,
    );

    const file = await insertFile();
    await putQuarantineObject(file.id, 'wrong-owner');
    const wrongOwnerCommand = new ConfirmUploadCommandDTO();
    wrongOwnerCommand.fileId = file.id;

    await expect(storageService.confirmUpload(otherOwnerId, wrongOwnerCommand)).rejects.toThrow(
      FileNotFoundException,
    );
  });

  it('works end-to-end through StorageCommandController', async () => {
    const file = await insertFile({ validationMode: ValidationMode.ASYNC });
    await putQuarantineObject(file.id, 'controller-test-bytes');

    const command = new ConfirmUploadCommandDTO();
    command.fileId = file.id;

    const response = await controller.confirmUpload(command, createTestAuthUser({ id: ownerId }));

    expect(response).toBeDefined();
    expect(response.file?.id).toBe(file.id);
    expect(response.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_SCANNING);
    expect(response.file?.status).toBe(GrpcFileStatus.FILE_STATUS_PENDING);
  });

  describe('SYNC validation and fallback', () => {
    it('processes SYNC upload nominally (USER_AVATAR <= 1MB) and returns CLEAN with public_url in one request', async () => {
      const file = await insertFile({
        entityType: DomainEntityType.USER_AVATAR,
        validationMode: ValidationMode.SYNC,
        declaredSize: 1024,
        declaredMimeType: 'image/jpeg',
      });
      await putQuarantineObject(file.id, buildValidJpegBuffer(1024));

      const expectedPublicKey = `user-avatar/${file.id}.webp`;
      const expectedPublicUrl = `http://127.0.0.1:9000/volontariapp-public/${expectedPublicKey}`;

      jest.spyOn(storagePipelineService, 'processFile').mockResolvedValue({
        status: 'CLEAN',
        publicKey: expectedPublicKey,
        publicUrl: expectedPublicUrl,
        actualSize: 800,
        originalSize: 1024,
        format: 'webp',
        mimeType: 'image/webp',
        width: 512,
        height: 512,
      });

      const command = new ConfirmUploadCommandDTO();
      command.fileId = file.id;

      const response = await storageService.confirmUpload(ownerId, command);

      expect(response.file).toBeDefined();
      expect(response.file?.id).toBe(file.id);
      expect(response.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_CLEAN);
      expect(response.file?.publicUrl).toBe(expectedPublicUrl);

      // Verify DB row
      const updated = await fileModelRepo.findOneByOrFail({ id: file.id });
      expect(updated.scanStatus).toBe(ScanStatus.CLEAN);
      expect(updated.publicKey).toBe(expectedPublicKey);
      expect(updated.scannedAt).toBeInstanceOf(Date);

      // Verify no job in jobs_outbox (it was processed synchronously)
      const jobs = await jobsOutboxRepo
        .createQueryBuilder('job')
        .where("job.payload->>'fileId' = :fileId", { fileId: file.id })
        .getMany();
      expect(jobs).toHaveLength(0);
    });

    it('switches to ASYNC and returns SCANNING with job in outbox when clamd is down on POST', async () => {
      const file = await insertFile({
        entityType: DomainEntityType.POST,
        validationMode: ValidationMode.SYNC,
        declaredSize: 1024,
        declaredMimeType: 'image/jpeg',
      });
      await putQuarantineObject(file.id, buildValidJpegBuffer(1024));

      // ClamAV daemon is intentionally down (connection refused on port 3310)
      const command = new ConfirmUploadCommandDTO();
      command.fileId = file.id;

      const response = await storageService.confirmUpload(ownerId, command);

      expect(response.file).toBeDefined();
      expect(response.file?.id).toBe(file.id);
      expect(response.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_SCANNING);
      expect(response.file?.validationMode).toBe(GrpcValidationMode.VALIDATION_MODE_ASYNC);

      // Verify DB row transitioned to ASYNC
      const updated = await fileModelRepo.findOneByOrFail({ id: file.id });
      expect(updated.scanStatus).toBe(ScanStatus.SCANNING);
      expect(updated.validationMode).toBe(ValidationMode.ASYNC);

      // Verify 1 job storage.scan_file was created in jobs_outbox
      const jobs = await jobsOutboxRepo
        .createQueryBuilder('job')
        .where("job.payload->>'fileId' = :fileId", { fileId: file.id })
        .getMany();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]?.type).toBe('storage.scan_file');
    });

    it('resets to AWAITING_UPLOAD and throws 503 UNAVAILABLE when clamd is down on USER_AVATAR', async () => {
      const file = await insertFile({
        entityType: DomainEntityType.USER_AVATAR,
        validationMode: ValidationMode.SYNC,
        declaredSize: 1024,
        declaredMimeType: 'image/jpeg',
      });
      await putQuarantineObject(file.id, buildValidJpegBuffer(1024));

      // ClamAV daemon is intentionally down
      const command = new ConfirmUploadCommandDTO();
      command.fileId = file.id;

      let caughtError: unknown;
      try {
        await storageService.confirmUpload(ownerId, command);
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeInstanceOf(ScannerTechnicalError);
      const scannerError = caughtError as ScannerTechnicalError;
      expect(scannerError.statusCode).toBe(503);

      // Verify DB row was reset to AWAITING_UPLOAD with extended expiration
      const updated = await fileModelRepo.findOneByOrFail({ id: file.id });
      expect(updated.scanStatus).toBe(ScanStatus.AWAITING_UPLOAD);
      expect(updated.uploadExpiresAt.getTime()).toBeGreaterThan(Date.now() + 14 * 60 * 1000);

      // Verify no job in jobs_outbox
      const jobs = await jobsOutboxRepo
        .createQueryBuilder('job')
        .where("job.payload->>'fileId' = :fileId", { fileId: file.id })
        .getMany();
      expect(jobs).toHaveLength(0);
    });

    it('rejects SYNC upload when pipeline detects MALWARE, calls rejectScan and throws 422 FAILED_PRECONDITION', async () => {
      const file = await insertFile({
        entityType: DomainEntityType.USER_AVATAR,
        validationMode: ValidationMode.SYNC,
        declaredSize: 1024,
        declaredMimeType: 'image/jpeg',
      });
      await putQuarantineObject(file.id, buildValidJpegBuffer(1024));

      jest.spyOn(storagePipelineService, 'processFile').mockResolvedValue({
        status: 'REJECTED',
        rejectionReason: RejectionReason.MALWARE,
        details: { virusName: 'Eicar-Test-Signature' },
      });

      const command = new ConfirmUploadCommandDTO();
      command.fileId = file.id;

      await expect(storageService.confirmUpload(ownerId, command)).rejects.toThrow(
        UploadConfirmationFailedException,
      );

      // Verify DB row
      const updated = await fileModelRepo.findOneByOrFail({ id: file.id });
      expect(updated.scanStatus).toBe(ScanStatus.REJECTED);
      expect(updated.rejectionReason).toBe(RejectionReason.MALWARE);

      // Verify no job in jobs_outbox
      const jobs = await jobsOutboxRepo
        .createQueryBuilder('job')
        .where("job.payload->>'fileId' = :fileId", { fileId: file.id })
        .getMany();
      expect(jobs).toHaveLength(0);
    });
  });
});

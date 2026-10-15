import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  EntityType as GrpcEntityType,
  FileStatus as GrpcFileStatus,
  ScanStatus as GrpcScanStatus,
  ValidationMode as GrpcValidationMode,
} from '@volontariapp/contracts-nest';
import {
  AttachmentRefusalReason,
  EntityType as DomainEntityType,
  FileAttachmentRefusedException,
  FileNotFoundException,
  FileSizeNotAllowedException,
  FileStatus,
  InvalidEntityTypeException,
  InvalidFileExtensionException,
  type PostgresFileRepository,
  RejectionReason,
  ScanStatus,
  TooManyFilesException,
  ValidationMode,
} from '@volontariapp/domain-storage';
import {
  ScannerTechnicalError,
  type PresignedPostSigner,
  type S3StorageClient,
  type StoragePipelineService,
} from '@volontariapp/storage-pipeline';
import { StorageService } from '../../../../modules/storage/services/storage.service.js';
import { UploadConfirmationFailedException } from '../../../../modules/storage/exceptions/upload-confirmation-failed.exception.js';
import type { AppConfigService } from '../../../../config/app-config.service.js';
import {
  createMockAppConfigService,
  createMockFileRepository,
  createMockPresignedPostSigner,
  createMockS3StorageClient,
  createMockStoragePipelineService,
} from './storage.mock.js';
import {
  createTestConfirmFileAttachmentCommand,
  createTestConfirmUploadCommand,
  createTestFileEntity,
  createTestGenerateUploadUrlCommand,
  createTestPresignedPostResult,
} from './storage.factory.js';

describe('StorageService (Unit)', () => {
  let service: StorageService;
  let mockFileRepository: jest.Mocked<PostgresFileRepository>;
  let mockPresignedPostSigner: jest.Mocked<PresignedPostSigner>;
  let mockS3StorageClient: jest.Mocked<S3StorageClient>;
  let mockStoragePipelineService: jest.Mocked<StoragePipelineService>;
  let mockAppConfig: jest.Mocked<AppConfigService>;

  let createPendingSpy: jest.SpiedFunction<PostgresFileRepository['createPending']>;
  let reserveSpy: jest.SpiedFunction<PostgresFileRepository['reserve']>;
  let confirmUploadSpy: jest.SpiedFunction<PostgresFileRepository['confirmUpload']>;
  let findByIdSpy: jest.SpiedFunction<PostgresFileRepository['findById']>;
  let completeScanSpy: jest.SpiedFunction<PostgresFileRepository['completeScan']>;
  let rejectScanSpy: jest.SpiedFunction<PostgresFileRepository['rejectScan']>;
  let switchToAsyncSpy: jest.SpiedFunction<PostgresFileRepository['switchToAsync']>;
  let resetToAwaitingUploadSpy: jest.SpiedFunction<PostgresFileRepository['resetToAwaitingUpload']>;
  let presignedPostSpy: jest.SpiedFunction<PresignedPostSigner['generatePresignedPost']>;
  let headQuarantineSpy: jest.SpiedFunction<S3StorageClient['headQuarantineObject']>;
  let deletePublicObjectSpy: jest.SpiedFunction<S3StorageClient['deletePublicObject']>;
  let processFileSpy: jest.SpiedFunction<StoragePipelineService['processFile']>;

  const OWNER_ID = '11111111-1111-4111-a111-111111111111';
  const FILE_ID = '22222222-2222-4222-a222-222222222222';

  beforeEach(() => {
    mockFileRepository = createMockFileRepository();
    mockPresignedPostSigner = createMockPresignedPostSigner();
    mockS3StorageClient = createMockS3StorageClient();
    mockStoragePipelineService = createMockStoragePipelineService();
    mockAppConfig = createMockAppConfigService();

    createPendingSpy = jest.spyOn(mockFileRepository, 'createPending');
    reserveSpy = jest.spyOn(mockFileRepository, 'reserve');
    confirmUploadSpy = jest.spyOn(mockFileRepository, 'confirmUpload');
    findByIdSpy = jest.spyOn(mockFileRepository, 'findById');
    completeScanSpy = jest.spyOn(mockFileRepository, 'completeScan');
    rejectScanSpy = jest.spyOn(mockFileRepository, 'rejectScan');
    switchToAsyncSpy = jest.spyOn(mockFileRepository, 'switchToAsync');
    resetToAwaitingUploadSpy = jest.spyOn(mockFileRepository, 'resetToAwaitingUpload');
    presignedPostSpy = jest.spyOn(mockPresignedPostSigner, 'generatePresignedPost');
    headQuarantineSpy = jest.spyOn(mockS3StorageClient, 'headQuarantineObject');
    deletePublicObjectSpy = jest.spyOn(mockS3StorageClient, 'deletePublicObject');
    processFileSpy = jest.spyOn(mockStoragePipelineService, 'processFile');

    service = new StorageService(
      mockFileRepository,
      mockPresignedPostSigner,
      mockS3StorageClient,
      mockStoragePipelineService,
      mockAppConfig,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateUploadUrl', () => {
    it('should generate an upload URL for a valid SYNC upload (USER_AVATAR <= 1MB)', async () => {
      const command = createTestGenerateUploadUrlCommand({
        entityType: GrpcEntityType.ENTITY_TYPE_USER_AVATAR,
        mimeType: 'image/jpeg',
        sizeBytes: 500 * 1024,
      });

      const file = createTestFileEntity({
        id: 'file-avatar-123',
        ownerId: OWNER_ID,
        entityType: DomainEntityType.USER_AVATAR,
        declaredMimeType: 'image/jpeg',
        declaredSize: 500 * 1024,
        validationMode: ValidationMode.SYNC,
      });

      const presignedResult = createTestPresignedPostResult({
        url: 'http://localhost:9000/volontariapp-private',
        fields: {
          key: 'quarantine/file-avatar-123',
          'Content-Type': 'image/jpeg',
        },
      });

      createPendingSpy.mockResolvedValue(file);
      presignedPostSpy.mockResolvedValue(presignedResult);

      const result = await service.generateUploadUrl(OWNER_ID, command);

      expect(createPendingSpy).toHaveBeenCalledTimes(1);
      expect(createPendingSpy).toHaveBeenCalledWith({
        ownerId: OWNER_ID,
        entityType: DomainEntityType.USER_AVATAR,
        declaredMimeType: 'image/jpeg',
        declaredSize: 500 * 1024,
        presignedUrlTtlSeconds: 900,
      });

      expect(presignedPostSpy).toHaveBeenCalledTimes(1);
      expect(presignedPostSpy).toHaveBeenCalledWith({
        fileId: 'file-avatar-123',
        declaredMimeType: 'image/jpeg',
        maxSizeBytes: 1024 * 1024, // USER_AVATAR maxSizeBytes
        ttlSeconds: 900,
      });

      expect(result.fileId).toBe('file-avatar-123');
      expect(result.uploadUrl).toBe('http://localhost:9000/volontariapp-private');
      expect(result.uploadFields).toEqual({
        key: 'quarantine/file-avatar-123',
        'Content-Type': 'image/jpeg',
      });
      expect(result.expiresAt).toBeDefined();
    });

    it('should generate an upload URL for a valid ASYNC upload (POST > 1MB)', async () => {
      const command = createTestGenerateUploadUrlCommand({
        entityType: GrpcEntityType.ENTITY_TYPE_POST,
        mimeType: 'image/webp',
        sizeBytes: 5 * 1024 * 1024, // 5 MB
      });

      const file = createTestFileEntity({
        id: 'file-post-456',
        ownerId: OWNER_ID,
        entityType: DomainEntityType.POST,
        declaredMimeType: 'image/webp',
        declaredSize: 5 * 1024 * 1024,
        validationMode: ValidationMode.ASYNC,
      });

      const presignedResult = createTestPresignedPostResult({
        url: 'http://localhost:9000/volontariapp-private',
        fields: {
          key: 'quarantine/file-post-456',
          'Content-Type': 'image/webp',
        },
      });

      createPendingSpy.mockResolvedValue(file);
      presignedPostSpy.mockResolvedValue(presignedResult);

      const result = await service.generateUploadUrl(OWNER_ID, command);

      expect(createPendingSpy).toHaveBeenCalledWith({
        ownerId: OWNER_ID,
        entityType: DomainEntityType.POST,
        declaredMimeType: 'image/webp',
        declaredSize: 5 * 1024 * 1024,
        presignedUrlTtlSeconds: 900,
      });

      expect(presignedPostSpy).toHaveBeenCalledWith({
        fileId: 'file-post-456',
        declaredMimeType: 'image/webp',
        maxSizeBytes: 10 * 1024 * 1024, // POST maxSizeBytes (10 MB)
        ttlSeconds: 900,
      });

      expect(result.fileId).toBe('file-post-456');
      expect(result.uploadUrl).toBe('http://localhost:9000/volontariapp-private');
    });

    it('should support EVENT_COVER and BADGE_ICON entity types', async () => {
      const eventCommand = createTestGenerateUploadUrlCommand({
        entityType: GrpcEntityType.ENTITY_TYPE_EVENT_COVER,
        mimeType: 'image/jpeg',
        sizeBytes: 2 * 1024 * 1024,
      });

      createPendingSpy.mockResolvedValue(
        createTestFileEntity({ id: 'file-event', entityType: DomainEntityType.EVENT_COVER }),
      );
      presignedPostSpy.mockResolvedValue(createTestPresignedPostResult());

      await service.generateUploadUrl(OWNER_ID, eventCommand);
      expect(createPendingSpy).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: DomainEntityType.EVENT_COVER }),
      );

      const badgeCommand = createTestGenerateUploadUrlCommand({
        entityType: GrpcEntityType.ENTITY_TYPE_BADGE_ICON,
        mimeType: 'image/png',
        sizeBytes: 100 * 1024,
      });

      createPendingSpy.mockResolvedValue(
        createTestFileEntity({ id: 'file-badge', entityType: DomainEntityType.BADGE_ICON }),
      );

      await service.generateUploadUrl(OWNER_ID, badgeCommand);
      expect(createPendingSpy).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: DomainEntityType.BADGE_ICON }),
      );
    });

    it('should reject invalid or unspecified entity type', async () => {
      const command = createTestGenerateUploadUrlCommand({
        entityType: GrpcEntityType.ENTITY_TYPE_UNSPECIFIED,
      });

      await expect(service.generateUploadUrl(OWNER_ID, command)).rejects.toThrow(
        InvalidEntityTypeException,
      );

      const unknownCommand = createTestGenerateUploadUrlCommand({
        entityType: 999 as GrpcEntityType,
      });

      await expect(service.generateUploadUrl(OWNER_ID, unknownCommand)).rejects.toThrow(
        InvalidEntityTypeException,
      );
    });

    it('should reject disallowed MIME types (e.g. SVG or PDF)', async () => {
      const svgCommand = createTestGenerateUploadUrlCommand({
        entityType: GrpcEntityType.ENTITY_TYPE_POST,
        mimeType: 'image/svg+xml',
      });

      createPendingSpy.mockImplementation(() => {
        throw new InvalidFileExtensionException('image/svg+xml', DomainEntityType.POST);
      });

      await expect(service.generateUploadUrl(OWNER_ID, svgCommand)).rejects.toThrow(
        InvalidFileExtensionException,
      );

      const pdfCommand = createTestGenerateUploadUrlCommand({
        entityType: GrpcEntityType.ENTITY_TYPE_USER_AVATAR,
        mimeType: 'application/pdf',
      });

      createPendingSpy.mockImplementation(() => {
        throw new InvalidFileExtensionException('application/pdf', DomainEntityType.USER_AVATAR);
      });

      await expect(service.generateUploadUrl(OWNER_ID, pdfCommand)).rejects.toThrow(
        InvalidFileExtensionException,
      );
    });

    it('should reject declared size exceeding entity policy limit', async () => {
      const oversizedCommand = createTestGenerateUploadUrlCommand({
        entityType: GrpcEntityType.ENTITY_TYPE_POST,
        sizeBytes: 15 * 1024 * 1024, // 15 MB > 10 MB limit
      });

      createPendingSpy.mockImplementation(() => {
        throw new FileSizeNotAllowedException(
          DomainEntityType.POST,
          15 * 1024 * 1024,
          10 * 1024 * 1024,
        );
      });

      await expect(service.generateUploadUrl(OWNER_ID, oversizedCommand)).rejects.toThrow(
        FileSizeNotAllowedException,
      );
    });

    it('should propagate errors from PresignedPostSigner', async () => {
      const command = createTestGenerateUploadUrlCommand();
      const file = createTestFileEntity();

      createPendingSpy.mockResolvedValue(file);
      presignedPostSpy.mockRejectedValue(new Error('S3 signing failed'));

      await expect(service.generateUploadUrl(OWNER_ID, command)).rejects.toThrow(
        'S3 signing failed',
      );
    });
  });

  describe('confirmFileAttachment', () => {
    const ENTITY_ID = '33333333-3333-4333-a333-333333333333';
    const FILE_ID = '22222222-2222-4222-a222-222222222222';

    it('should successfully reserve files for an entity and return response with metadata', async () => {
      const command = createTestConfirmFileAttachmentCommand({
        fileIds: [FILE_ID],
        entityType: GrpcEntityType.ENTITY_TYPE_POST,
        entityId: ENTITY_ID,
      });

      const reservedFile = createTestFileEntity({
        id: FILE_ID,
        ownerId: OWNER_ID,
        entityType: DomainEntityType.POST,
        entityId: ENTITY_ID,
        status: FileStatus.RESERVED,
        scanStatus: ScanStatus.CLEAN,
        publicKey: `post/${FILE_ID}.webp`,
      });

      reserveSpy.mockResolvedValue([reservedFile]);

      const result = await service.confirmFileAttachment(OWNER_ID, command);

      expect(reserveSpy).toHaveBeenCalledTimes(1);
      expect(reserveSpy).toHaveBeenCalledWith({
        fileIds: [FILE_ID],
        entityType: DomainEntityType.POST,
        entityId: ENTITY_ID,
        ownerId: OWNER_ID,
      });

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(1);
      expect(result.files.length).toBe(1);
      expect(result.files[0]?.id).toBe(FILE_ID);
      expect(result.files[0]?.status).toBe(GrpcFileStatus.FILE_STATUS_RESERVED);
      expect(result.files[0]?.publicUrl).toBe(
        `http://localhost:9000/volontariapp-public/post/${FILE_ID}.webp`,
      );
    });

    it('should propagate FileNotFoundException when a file is missing or belongs to another owner', async () => {
      const command = createTestConfirmFileAttachmentCommand({
        fileIds: [FILE_ID],
      });

      reserveSpy.mockRejectedValue(new FileNotFoundException(FILE_ID));

      await expect(service.confirmFileAttachment(OWNER_ID, command)).rejects.toThrow(
        FileNotFoundException,
      );
    });

    it('should propagate FileAttachmentRefusedException when attachment is refused', async () => {
      const command = createTestConfirmFileAttachmentCommand({
        fileIds: [FILE_ID],
        entityType: GrpcEntityType.ENTITY_TYPE_POST,
        entityId: ENTITY_ID,
      });

      reserveSpy.mockRejectedValue(
        new FileAttachmentRefusedException(
          FILE_ID,
          AttachmentRefusalReason.ENTITY_TYPE_MISMATCH,
          DomainEntityType.POST,
          ENTITY_ID,
        ),
      );

      await expect(service.confirmFileAttachment(OWNER_ID, command)).rejects.toThrow(
        FileAttachmentRefusedException,
      );
    });

    it('should propagate TooManyFilesException when file count exceeds policy limit', async () => {
      const command = createTestConfirmFileAttachmentCommand({
        fileIds: [FILE_ID, '44444444-4444-4444-a444-444444444444'],
        entityType: GrpcEntityType.ENTITY_TYPE_USER_AVATAR,
      });

      reserveSpy.mockRejectedValue(new TooManyFilesException(DomainEntityType.USER_AVATAR, 2, 1));

      await expect(service.confirmFileAttachment(OWNER_ID, command)).rejects.toThrow(
        TooManyFilesException,
      );
    });

    it('should throw InvalidEntityTypeException for invalid entity types', async () => {
      const command = createTestConfirmFileAttachmentCommand({
        entityType: 999 as GrpcEntityType,
      });

      await expect(service.confirmFileAttachment(OWNER_ID, command)).rejects.toThrow(
        InvalidEntityTypeException,
      );
      expect(reserveSpy).not.toHaveBeenCalled();
    });
  });

  describe('confirmUpload', () => {
    it('should successfully confirm an ASYNC upload and transition to SCANNING', async () => {
      const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
      const pendingFile = createTestFileEntity({
        id: FILE_ID,
        ownerId: OWNER_ID,
        scanStatus: ScanStatus.AWAITING_UPLOAD,
        status: FileStatus.PENDING,
        validationMode: ValidationMode.ASYNC,
        uploadExpiresAt: new Date(Date.now() + 600000),
      });

      const updatedFile = createTestFileEntity({
        id: FILE_ID,
        ownerId: OWNER_ID,
        scanStatus: ScanStatus.SCANNING,
        status: FileStatus.PENDING,
        validationMode: ValidationMode.ASYNC,
        actualSize: 2048000,
        confirmedAt: new Date(),
      });

      findByIdSpy.mockResolvedValueOnce(pendingFile).mockResolvedValueOnce(updatedFile);
      headQuarantineSpy.mockResolvedValue({
        size: 2048000,
        contentType: 'image/jpeg',
      });
      confirmUploadSpy.mockResolvedValue({
        id: FILE_ID,
        validationMode: ValidationMode.ASYNC,
      });

      const response = await service.confirmUpload(OWNER_ID, command);

      expect(headQuarantineSpy).toHaveBeenCalledWith(FILE_ID);
      expect(confirmUploadSpy).toHaveBeenCalledWith({
        fileId: FILE_ID,
        ownerId: OWNER_ID,
        actualSize: 2048000,
      });
      expect(response.file).toBeDefined();
      expect(response.file?.id).toBe(FILE_ID);
      expect(response.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_SCANNING);
      expect(response.file?.validationMode).toBe(GrpcValidationMode.VALIDATION_MODE_ASYNC);
    });

    it('should return current file metadata idempotently if already SCANNING', async () => {
      const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
      const scanningFile = createTestFileEntity({
        id: FILE_ID,
        ownerId: OWNER_ID,
        scanStatus: ScanStatus.SCANNING,
        status: FileStatus.PENDING,
        validationMode: ValidationMode.ASYNC,
      });

      findByIdSpy.mockResolvedValue(scanningFile);

      const response = await service.confirmUpload(OWNER_ID, command);

      expect(headQuarantineSpy).not.toHaveBeenCalled();
      expect(confirmUploadSpy).not.toHaveBeenCalled();
      expect(response.file?.id).toBe(FILE_ID);
      expect(response.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_SCANNING);
    });

    it('should return current file metadata idempotently if already CLEAN', async () => {
      const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
      const cleanFile = createTestFileEntity({
        id: FILE_ID,
        ownerId: OWNER_ID,
        scanStatus: ScanStatus.CLEAN,
        status: FileStatus.PENDING,
        publicKey: 'user-avatar/file-123.webp',
      });

      findByIdSpy.mockResolvedValue(cleanFile);

      const response = await service.confirmUpload(OWNER_ID, command);

      expect(headQuarantineSpy).not.toHaveBeenCalled();
      expect(confirmUploadSpy).not.toHaveBeenCalled();
      expect(response.file?.id).toBe(FILE_ID);
      expect(response.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_CLEAN);
    });

    it('should return current file metadata idempotently if already REJECTED', async () => {
      const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
      const rejectedFile = createTestFileEntity({
        id: FILE_ID,
        ownerId: OWNER_ID,
        scanStatus: ScanStatus.REJECTED,
        status: FileStatus.PENDING,
      });

      findByIdSpy.mockResolvedValue(rejectedFile);

      const response = await service.confirmUpload(OWNER_ID, command);

      expect(headQuarantineSpy).not.toHaveBeenCalled();
      expect(confirmUploadSpy).not.toHaveBeenCalled();
      expect(response.file?.id).toBe(FILE_ID);
      expect(response.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_REJECTED);
    });

    it('should throw FileNotFoundException if file does not exist', async () => {
      const command = createTestConfirmUploadCommand({ fileId: 'unknown-id' });
      findByIdSpy.mockResolvedValue(null);

      await expect(service.confirmUpload(OWNER_ID, command)).rejects.toThrow(FileNotFoundException);
      expect(headQuarantineSpy).not.toHaveBeenCalled();
      expect(confirmUploadSpy).not.toHaveBeenCalled();
    });

    it('should throw FileNotFoundException if ownerId does not match (security invariant)', async () => {
      const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
      const fileOfOtherUser = createTestFileEntity({
        id: FILE_ID,
        ownerId: '99999999-9999-4999-a999-999999999999',
      });

      findByIdSpy.mockResolvedValue(fileOfOtherUser);

      await expect(service.confirmUpload(OWNER_ID, command)).rejects.toThrow(FileNotFoundException);
      expect(headQuarantineSpy).not.toHaveBeenCalled();
      expect(confirmUploadSpy).not.toHaveBeenCalled();
    });

    it('should throw UploadConfirmationFailedException if file is ORPHANED or DELETED', async () => {
      const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
      const orphanedFile = createTestFileEntity({
        id: FILE_ID,
        ownerId: OWNER_ID,
        status: FileStatus.ORPHANED,
        scanStatus: ScanStatus.AWAITING_UPLOAD,
      });

      findByIdSpy.mockResolvedValue(orphanedFile);

      await expect(service.confirmUpload(OWNER_ID, command)).rejects.toThrow(
        UploadConfirmationFailedException,
      );
      expect(headQuarantineSpy).not.toHaveBeenCalled();
    });

    it('should throw UploadConfirmationFailedException if upload URL has expired', async () => {
      const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
      const expiredFile = createTestFileEntity({
        id: FILE_ID,
        ownerId: OWNER_ID,
        scanStatus: ScanStatus.AWAITING_UPLOAD,
        status: FileStatus.PENDING,
        uploadExpiresAt: new Date(Date.now() - 60000), // 1 minute in the past
      });

      findByIdSpy.mockResolvedValue(expiredFile);

      await expect(service.confirmUpload(OWNER_ID, command)).rejects.toThrow(
        UploadConfirmationFailedException,
      );
      expect(headQuarantineSpy).not.toHaveBeenCalled();
    });

    it('should throw UploadConfirmationFailedException if object is not found in quarantine S3', async () => {
      const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
      const pendingFile = createTestFileEntity({
        id: FILE_ID,
        ownerId: OWNER_ID,
        scanStatus: ScanStatus.AWAITING_UPLOAD,
        status: FileStatus.PENDING,
        uploadExpiresAt: new Date(Date.now() + 600000),
      });

      findByIdSpy.mockResolvedValue(pendingFile);
      headQuarantineSpy.mockResolvedValue(null);

      await expect(service.confirmUpload(OWNER_ID, command)).rejects.toThrow(
        UploadConfirmationFailedException,
      );
      expect(confirmUploadSpy).not.toHaveBeenCalled();
    });

    it('should handle race condition where concurrent confirmation transitioned file during confirmUpload', async () => {
      const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
      const pendingFile = createTestFileEntity({
        id: FILE_ID,
        ownerId: OWNER_ID,
        scanStatus: ScanStatus.AWAITING_UPLOAD,
        status: FileStatus.PENDING,
        uploadExpiresAt: new Date(Date.now() + 600000),
      });

      const concurrentScanningFile = createTestFileEntity({
        id: FILE_ID,
        ownerId: OWNER_ID,
        scanStatus: ScanStatus.SCANNING,
        status: FileStatus.PENDING,
      });

      findByIdSpy.mockResolvedValueOnce(pendingFile).mockResolvedValueOnce(concurrentScanningFile);

      headQuarantineSpy.mockResolvedValue({
        size: 1024000,
        contentType: 'image/jpeg',
      });
      // Concurrent update caused confirmUpload to return null
      confirmUploadSpy.mockResolvedValue(null);

      const response = await service.confirmUpload(OWNER_ID, command);

      expect(response.file?.id).toBe(FILE_ID);
      expect(response.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_SCANNING);
    });

    describe('SYNC pipeline path', () => {
      it('should successfully validate and process a SYNC upload (USER_AVATAR <= 1MB) and return CLEAN with publicUrl', async () => {
        const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
        const pendingFile = createTestFileEntity({
          id: FILE_ID,
          ownerId: OWNER_ID,
          entityType: DomainEntityType.USER_AVATAR,
          declaredMimeType: 'image/jpeg',
          declaredSize: 500 * 1024,
          scanStatus: ScanStatus.AWAITING_UPLOAD,
          status: FileStatus.PENDING,
          validationMode: ValidationMode.SYNC,
          uploadExpiresAt: new Date(Date.now() + 600000),
        });

        const cleanFile = createTestFileEntity({
          id: FILE_ID,
          ownerId: OWNER_ID,
          entityType: DomainEntityType.USER_AVATAR,
          declaredMimeType: 'image/jpeg',
          declaredSize: 500 * 1024,
          actualSize: 500 * 1024,
          scanStatus: ScanStatus.CLEAN,
          status: FileStatus.PENDING,
          validationMode: ValidationMode.SYNC,
          publicKey: `user-avatar/${FILE_ID}.webp`,
          scannedAt: new Date(),
        });

        findByIdSpy.mockResolvedValueOnce(pendingFile).mockResolvedValueOnce(cleanFile);
        headQuarantineSpy.mockResolvedValue({
          size: 500 * 1024,
          contentType: 'image/jpeg',
        });
        confirmUploadSpy.mockResolvedValue({
          id: FILE_ID,
          validationMode: ValidationMode.SYNC,
        });
        processFileSpy.mockResolvedValue({
          status: 'CLEAN',
          publicKey: `user-avatar/${FILE_ID}.webp`,
          publicUrl: `http://localhost:9000/volontariapp-public/user-avatar/${FILE_ID}.webp`,
          actualSize: 450 * 1024,
          originalSize: 500 * 1024,
          format: 'webp',
          mimeType: 'image/webp',
          width: 512,
          height: 512,
        });
        completeScanSpy.mockResolvedValue({
          fileId: FILE_ID,
          status: FileStatus.PENDING,
          eventEmitted: false,
        });

        const response = await service.confirmUpload(OWNER_ID, command);

        expect(headQuarantineSpy).toHaveBeenCalledWith(FILE_ID);
        expect(confirmUploadSpy).toHaveBeenCalledWith({
          fileId: FILE_ID,
          ownerId: OWNER_ID,
          actualSize: 500 * 1024,
        });
        expect(processFileSpy).toHaveBeenCalledWith({
          fileId: FILE_ID,
          entityType: DomainEntityType.USER_AVATAR,
          declaredMimeType: 'image/jpeg',
          declaredSize: 500 * 1024,
        });
        expect(completeScanSpy).toHaveBeenCalledWith({
          fileId: FILE_ID,
          publicKey: `user-avatar/${FILE_ID}.webp`,
        });
        expect(response.file?.id).toBe(FILE_ID);
        expect(response.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_CLEAN);
        expect(response.file?.publicUrl).toBe(
          `http://localhost:9000/volontariapp-public/user-avatar/${FILE_ID}.webp`,
        );
      });

      it('should reject SYNC upload when pipeline detects malware, call rejectScan and throw 422 FAILED_PRECONDITION', async () => {
        const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
        const pendingFile = createTestFileEntity({
          id: FILE_ID,
          ownerId: OWNER_ID,
          entityType: DomainEntityType.USER_AVATAR,
          scanStatus: ScanStatus.AWAITING_UPLOAD,
          status: FileStatus.PENDING,
          validationMode: ValidationMode.SYNC,
          declaredSize: 500 * 1024,
          declaredMimeType: 'image/jpeg',
          uploadExpiresAt: new Date(Date.now() + 600000),
        });

        findByIdSpy.mockResolvedValue(pendingFile);
        headQuarantineSpy.mockResolvedValue({
          size: 500 * 1024,
          contentType: 'image/jpeg',
        });
        confirmUploadSpy.mockResolvedValue({
          id: FILE_ID,
          validationMode: ValidationMode.SYNC,
        });
        processFileSpy.mockResolvedValue({
          status: 'REJECTED',
          rejectionReason: RejectionReason.MALWARE,
          details: { virusName: 'Eicar-Test-Signature' },
        });
        rejectScanSpy.mockResolvedValue({
          fileId: FILE_ID,
          status: FileStatus.PENDING,
          eventEmitted: false,
        });

        await expect(service.confirmUpload(OWNER_ID, command)).rejects.toThrow(
          UploadConfirmationFailedException,
        );

        expect(rejectScanSpy).toHaveBeenCalledWith({
          fileId: FILE_ID,
          reason: RejectionReason.MALWARE,
        });
        expect(completeScanSpy).not.toHaveBeenCalled();
      });

      it('should reject SYNC upload when pipeline detects MIME mismatch, call rejectScan and throw 422 FAILED_PRECONDITION', async () => {
        const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
        const pendingFile = createTestFileEntity({
          id: FILE_ID,
          ownerId: OWNER_ID,
          entityType: DomainEntityType.USER_AVATAR,
          scanStatus: ScanStatus.AWAITING_UPLOAD,
          status: FileStatus.PENDING,
          validationMode: ValidationMode.SYNC,
          declaredSize: 500 * 1024,
          declaredMimeType: 'image/jpeg',
          uploadExpiresAt: new Date(Date.now() + 600000),
        });

        findByIdSpy.mockResolvedValue(pendingFile);
        headQuarantineSpy.mockResolvedValue({
          size: 500 * 1024,
          contentType: 'image/jpeg',
        });
        confirmUploadSpy.mockResolvedValue({
          id: FILE_ID,
          validationMode: ValidationMode.SYNC,
        });
        processFileSpy.mockResolvedValue({
          status: 'REJECTED',
          rejectionReason: RejectionReason.MIME_MISMATCH,
          details: { declaredMimeType: 'image/jpeg' },
        });
        rejectScanSpy.mockResolvedValue({
          fileId: FILE_ID,
          status: FileStatus.PENDING,
          eventEmitted: false,
        });

        await expect(service.confirmUpload(OWNER_ID, command)).rejects.toThrow(
          UploadConfirmationFailedException,
        );

        expect(rejectScanSpy).toHaveBeenCalledWith({
          fileId: FILE_ID,
          reason: RejectionReason.MIME_MISMATCH,
        });
      });

      it('should switch to ASYNC on technical error when entity allows ASYNC (POST) and return SCANNING', async () => {
        const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
        const pendingFile = createTestFileEntity({
          id: FILE_ID,
          ownerId: OWNER_ID,
          entityType: DomainEntityType.POST,
          scanStatus: ScanStatus.AWAITING_UPLOAD,
          status: FileStatus.PENDING,
          validationMode: ValidationMode.SYNC,
          declaredSize: 500 * 1024,
          declaredMimeType: 'image/jpeg',
          uploadExpiresAt: new Date(Date.now() + 600000),
        });

        const switchedFile = createTestFileEntity({
          id: FILE_ID,
          ownerId: OWNER_ID,
          entityType: DomainEntityType.POST,
          scanStatus: ScanStatus.SCANNING,
          status: FileStatus.PENDING,
          validationMode: ValidationMode.ASYNC,
          declaredSize: 500 * 1024,
          actualSize: 500 * 1024,
        });

        findByIdSpy.mockResolvedValueOnce(pendingFile).mockResolvedValueOnce(switchedFile);
        headQuarantineSpy.mockResolvedValue({
          size: 500 * 1024,
          contentType: 'image/jpeg',
        });
        confirmUploadSpy.mockResolvedValue({
          id: FILE_ID,
          validationMode: ValidationMode.SYNC,
        });
        processFileSpy.mockRejectedValue(
          new ScannerTechnicalError('ClamAV daemon unreachable', 'SCANNER_CONNECTION_ERROR'),
        );
        switchToAsyncSpy.mockResolvedValue(true);

        const response = await service.confirmUpload(OWNER_ID, command);

        expect(switchToAsyncSpy).toHaveBeenCalledWith(FILE_ID);
        expect(resetToAwaitingUploadSpy).not.toHaveBeenCalled();
        expect(response.file?.id).toBe(FILE_ID);
        expect(response.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_SCANNING);
        expect(response.file?.validationMode).toBe(GrpcValidationMode.VALIDATION_MODE_ASYNC);
      });

      it('should reset to AWAITING_UPLOAD and throw 503 UNAVAILABLE on technical error when entity does NOT allow ASYNC (USER_AVATAR)', async () => {
        const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
        const pendingFile = createTestFileEntity({
          id: FILE_ID,
          ownerId: OWNER_ID,
          entityType: DomainEntityType.USER_AVATAR,
          scanStatus: ScanStatus.AWAITING_UPLOAD,
          status: FileStatus.PENDING,
          validationMode: ValidationMode.SYNC,
          declaredSize: 500 * 1024,
          declaredMimeType: 'image/jpeg',
          uploadExpiresAt: new Date(Date.now() + 600000),
        });

        findByIdSpy.mockResolvedValue(pendingFile);
        headQuarantineSpy.mockResolvedValue({
          size: 500 * 1024,
          contentType: 'image/jpeg',
        });
        confirmUploadSpy.mockResolvedValue({
          id: FILE_ID,
          validationMode: ValidationMode.SYNC,
        });
        processFileSpy.mockRejectedValue(
          new ScannerTechnicalError('ClamAV scan timed out', 'SCANNER_TIMEOUT'),
        );
        resetToAwaitingUploadSpy.mockResolvedValue(true);

        await expect(service.confirmUpload(OWNER_ID, command)).rejects.toThrow(
          ScannerTechnicalError,
        );

        expect(resetToAwaitingUploadSpy).toHaveBeenCalledWith(FILE_ID);
        expect(switchToAsyncSpy).not.toHaveBeenCalled();
      });

      it('should delete public object and throw 422 if completeScan returns null (file orphaned or deleted in flight)', async () => {
        const command = createTestConfirmUploadCommand({ fileId: FILE_ID });
        const pendingFile = createTestFileEntity({
          id: FILE_ID,
          ownerId: OWNER_ID,
          entityType: DomainEntityType.USER_AVATAR,
          scanStatus: ScanStatus.AWAITING_UPLOAD,
          status: FileStatus.PENDING,
          validationMode: ValidationMode.SYNC,
          declaredSize: 500 * 1024,
          declaredMimeType: 'image/jpeg',
          uploadExpiresAt: new Date(Date.now() + 600000),
        });

        const orphanedFile = createTestFileEntity({
          id: FILE_ID,
          ownerId: OWNER_ID,
          status: FileStatus.ORPHANED,
          scanStatus: ScanStatus.SCANNING,
        });

        findByIdSpy.mockResolvedValueOnce(pendingFile).mockResolvedValueOnce(orphanedFile);
        headQuarantineSpy.mockResolvedValue({
          size: 500 * 1024,
          contentType: 'image/jpeg',
        });
        confirmUploadSpy.mockResolvedValue({
          id: FILE_ID,
          validationMode: ValidationMode.SYNC,
        });
        processFileSpy.mockResolvedValue({
          status: 'CLEAN',
          publicKey: `user-avatar/${FILE_ID}.webp`,
          publicUrl: `http://localhost:9000/volontariapp-public/user-avatar/${FILE_ID}.webp`,
          actualSize: 450 * 1024,
          originalSize: 500 * 1024,
          format: 'webp',
          mimeType: 'image/webp',
          width: 512,
          height: 512,
        });
        completeScanSpy.mockResolvedValue(null);
        deletePublicObjectSpy.mockResolvedValue(undefined);

        await expect(service.confirmUpload(OWNER_ID, command)).rejects.toThrow(
          UploadConfirmationFailedException,
        );

        expect(completeScanSpy).toHaveBeenCalledWith({
          fileId: FILE_ID,
          publicKey: `user-avatar/${FILE_ID}.webp`,
        });
        expect(deletePublicObjectSpy).toHaveBeenCalledWith(`user-avatar/${FILE_ID}.webp`);
      });
    });
  });
});

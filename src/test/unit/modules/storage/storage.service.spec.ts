import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  EntityType as GrpcEntityType,
  FileStatus as GrpcFileStatus,
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
  ScanStatus,
  TooManyFilesException,
  ValidationMode,
} from '@volontariapp/domain-storage';
import type { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';
import type { PresignedPostSigner } from '@volontariapp/storage-pipeline';
import { StorageService } from '../../../../modules/storage/services/storage.service.js';
import type { AppConfigService } from '../../../../config/app-config.service.js';
import {
  createMockAppConfigService,
  createMockFileRepository,
  createMockPresignedPostSigner,
} from './storage.mock.js';
import {
  createTestConfirmFileAttachmentCommand,
  createTestFileEntity,
  createTestGenerateUploadUrlCommand,
  createTestPresignedPostResult,
} from './storage.factory.js';

describe('StorageService (Unit)', () => {
  let service: StorageService;
  let mockFileRepository: jest.Mocked<PostgresFileRepository>;
  let mockPresignedPostSigner: jest.Mocked<PresignedPostSigner>;
  let mockAppConfig: jest.Mocked<AppConfigService>;

  let createPendingSpy: jest.SpiedFunction<PostgresFileRepository['createPending']>;
  let reserveSpy: jest.SpiedFunction<PostgresFileRepository['reserve']>;
  let presignedPostSpy: jest.SpiedFunction<PresignedPostSigner['generatePresignedPost']>;

  const OWNER_ID = '11111111-1111-4111-a111-111111111111';

  beforeEach(() => {
    mockFileRepository = createMockFileRepository();
    mockPresignedPostSigner = createMockPresignedPostSigner();
    mockAppConfig = createMockAppConfigService();

    createPendingSpy = jest.spyOn(mockFileRepository, 'createPending');
    reserveSpy = jest.spyOn(mockFileRepository, 'reserve');
    presignedPostSpy = jest.spyOn(mockPresignedPostSigner, 'generatePresignedPost');

    service = new StorageService(mockFileRepository, mockPresignedPostSigner, mockAppConfig);
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
});

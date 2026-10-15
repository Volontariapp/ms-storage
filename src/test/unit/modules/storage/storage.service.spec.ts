import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EntityType as GrpcEntityType } from '@volontariapp/contracts-nest';
import {
  EntityType as DomainEntityType,
  FileSizeNotAllowedException,
  InvalidEntityTypeException,
  InvalidFileExtensionException,
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
  createTestFileEntity,
  createTestGenerateUploadUrlCommand,
  createTestPresignedPostResult,
} from './storage.factory.js';

describe('StorageService (Unit)', () => {
  let service: StorageService;
  let mockFileRepository: jest.Mocked<PostgresFileRepository>;
  let mockPresignedPostSigner: jest.Mocked<PresignedPostSigner>;
  let mockAppConfig: jest.Mocked<AppConfigService>;

  const OWNER_ID = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    mockFileRepository = createMockFileRepository();
    mockPresignedPostSigner = createMockPresignedPostSigner();
    mockAppConfig = createMockAppConfigService();

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

      mockFileRepository.createPending.mockResolvedValue(file);
      mockPresignedPostSigner.generatePresignedPost.mockResolvedValue(presignedResult);

      const result = await service.generateUploadUrl(OWNER_ID, command);

      expect(mockFileRepository.createPending).toHaveBeenCalledTimes(1);
      expect(mockFileRepository.createPending).toHaveBeenCalledWith({
        ownerId: OWNER_ID,
        entityType: DomainEntityType.USER_AVATAR,
        declaredMimeType: 'image/jpeg',
        declaredSize: 500 * 1024,
        presignedUrlTtlSeconds: 900,
      });

      expect(mockPresignedPostSigner.generatePresignedPost).toHaveBeenCalledTimes(1);
      expect(mockPresignedPostSigner.generatePresignedPost).toHaveBeenCalledWith({
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

      mockFileRepository.createPending.mockResolvedValue(file);
      mockPresignedPostSigner.generatePresignedPost.mockResolvedValue(presignedResult);

      const result = await service.generateUploadUrl(OWNER_ID, command);

      expect(mockFileRepository.createPending).toHaveBeenCalledWith({
        ownerId: OWNER_ID,
        entityType: DomainEntityType.POST,
        declaredMimeType: 'image/webp',
        declaredSize: 5 * 1024 * 1024,
        presignedUrlTtlSeconds: 900,
      });

      expect(mockPresignedPostSigner.generatePresignedPost).toHaveBeenCalledWith({
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

      mockFileRepository.createPending.mockResolvedValue(
        createTestFileEntity({ id: 'file-event', entityType: DomainEntityType.EVENT_COVER }),
      );
      mockPresignedPostSigner.generatePresignedPost.mockResolvedValue(
        createTestPresignedPostResult(),
      );

      await service.generateUploadUrl(OWNER_ID, eventCommand);
      expect(mockFileRepository.createPending).toHaveBeenCalledWith(
        expect.objectContaining({ entityType: DomainEntityType.EVENT_COVER }),
      );

      const badgeCommand = createTestGenerateUploadUrlCommand({
        entityType: GrpcEntityType.ENTITY_TYPE_BADGE_ICON,
        mimeType: 'image/png',
        sizeBytes: 100 * 1024,
      });

      mockFileRepository.createPending.mockResolvedValue(
        createTestFileEntity({ id: 'file-badge', entityType: DomainEntityType.BADGE_ICON }),
      );

      await service.generateUploadUrl(OWNER_ID, badgeCommand);
      expect(mockFileRepository.createPending).toHaveBeenCalledWith(
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

      mockFileRepository.createPending.mockImplementation(() => {
        throw new InvalidFileExtensionException('image/svg+xml', DomainEntityType.POST);
      });

      await expect(service.generateUploadUrl(OWNER_ID, svgCommand)).rejects.toThrow(
        InvalidFileExtensionException,
      );

      const pdfCommand = createTestGenerateUploadUrlCommand({
        entityType: GrpcEntityType.ENTITY_TYPE_USER_AVATAR,
        mimeType: 'application/pdf',
      });

      mockFileRepository.createPending.mockImplementation(() => {
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

      mockFileRepository.createPending.mockImplementation(() => {
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

      mockFileRepository.createPending.mockResolvedValue(file);
      mockPresignedPostSigner.generatePresignedPost.mockRejectedValue(
        new Error('S3 signing failed'),
      );

      await expect(service.generateUploadUrl(OWNER_ID, command)).rejects.toThrow(
        'S3 signing failed',
      );
    });
  });
});

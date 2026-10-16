import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StorageQueryController } from '../../../../modules/storage/controllers/queries/storage.query.controller.js';
import type { StorageService } from '../../../../modules/storage/services/storage.service.js';
import { createMockStorageService } from './storage.mock.js';
import { createTestAuthUser, createTestGetFileMetadataQuery } from './storage.factory.js';
import { FileMetadataResponseDTO } from '../../../../modules/storage/dto/response/file-metadata.response.dto.js';
import { FileStatus, ScanStatus, ValidationMode } from '@volontariapp/contracts-nest';

describe('StorageQueryController (Unit)', () => {
  let controller: StorageQueryController;
  let mockStorageService: jest.Mocked<StorageService>;

  beforeEach(() => {
    mockStorageService = createMockStorageService();
    controller = new StorageQueryController(mockStorageService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getFileMetadata', () => {
    it('should delegate to StorageService with user id and query payload', async () => {
      const user = createTestAuthUser({ id: 'user-uuid-123' });
      const query = createTestGetFileMetadataQuery({ fileId: 'file-uuid-456' });

      const expectedResponse = new FileMetadataResponseDTO();
      expectedResponse.file = {
        id: 'file-uuid-456',
        ownerId: 'user-uuid-123',
        objectKey: '',
        mimeType: 'image/jpeg',
        status: FileStatus.FILE_STATUS_PENDING,
        isPublic: false,
        uploadExpiresAt: { seconds: 1700000000, nanos: 0 },
        createdAt: { seconds: 1700000000, nanos: 0 },
        updatedAt: { seconds: 1700000000, nanos: 0 },
        scanStatus: ScanStatus.SCAN_STATUS_AWAITING_UPLOAD,
        validationMode: ValidationMode.VALIDATION_MODE_SYNC,
      };

      const getFileMetadataSpy = jest
        .spyOn(mockStorageService, 'getFileMetadata')
        .mockResolvedValue(expectedResponse);

      const result = await controller.getFileMetadata(query, user);

      expect(getFileMetadataSpy).toHaveBeenCalledTimes(1);
      expect(getFileMetadataSpy).toHaveBeenCalledWith('user-uuid-123', query);
      expect(result).toBe(expectedResponse);
    });

    it('should propagate errors thrown by StorageService', async () => {
      const user = createTestAuthUser();
      const query = createTestGetFileMetadataQuery();

      jest
        .spyOn(mockStorageService, 'getFileMetadata')
        .mockRejectedValue(new Error('Storage service error'));

      await expect(controller.getFileMetadata(query, user)).rejects.toThrow(
        'Storage service error',
      );
    });
  });
});

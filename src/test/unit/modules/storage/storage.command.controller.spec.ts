import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { StorageCommandController } from '../../../../modules/storage/controllers/commands/storage.command.controller.js';
import type { StorageService } from '../../../../modules/storage/services/storage.service.js';
import { createMockStorageService, type MockStorageService } from './storage.mock.js';
import { createTestAuthUser, createTestGenerateUploadUrlCommand } from './storage.factory.js';
import { GenerateUploadUrlResponseDTO } from '../../../../modules/storage/dto/response/generate-upload-url.response.dto.js';

describe('StorageCommandController (Unit)', () => {
  let controller: StorageCommandController;
  let mockStorageService: MockStorageService & Partial<StorageService>;

  beforeEach(() => {
    mockStorageService = createMockStorageService();
    controller = new StorageCommandController(mockStorageService as StorageService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('generateUploadUrl', () => {
    it('should delegate to StorageService with user id and command payload', async () => {
      const user = createTestAuthUser({ id: 'user-uuid-123' });
      const command = createTestGenerateUploadUrlCommand();

      const expectedResponse = new GenerateUploadUrlResponseDTO();
      expectedResponse.fileId = 'file-uuid-456';
      expectedResponse.uploadUrl = 'http://localhost:9000/volontariapp-private';
      expectedResponse.uploadFields = { key: 'quarantine/file-uuid-456' };
      expectedResponse.expiresAt = { seconds: 1700000000, nanos: 0 };

      mockStorageService.generateUploadUrl.mockResolvedValue(expectedResponse);

      const result = await controller.generateUploadUrl(command, user);

      expect(mockStorageService.generateUploadUrl).toHaveBeenCalledTimes(1);
      expect(mockStorageService.generateUploadUrl).toHaveBeenCalledWith('user-uuid-123', command);
      expect(result).toBe(expectedResponse);
    });

    it('should propagate errors thrown by StorageService', async () => {
      const user = createTestAuthUser();
      const command = createTestGenerateUploadUrlCommand();

      mockStorageService.generateUploadUrl.mockRejectedValue(new Error('Storage service error'));

      await expect(controller.generateUploadUrl(command, user)).rejects.toThrow(
        'Storage service error',
      );
    });
  });
});

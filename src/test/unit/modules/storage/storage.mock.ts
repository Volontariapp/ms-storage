import { jest } from '@jest/globals';
import type { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';
import type { PresignedPostSigner } from '@volontariapp/storage-pipeline';
import type { AppConfigService } from '../../../../config/app-config.service.js';
import type { StorageService } from '../../../../modules/storage/services/storage.service.js';

export interface MockPostgresFileRepository {
  createPending: ReturnType<typeof jest.fn>;
  findById: ReturnType<typeof jest.fn>;
  confirmUpload: ReturnType<typeof jest.fn>;
  reserve: ReturnType<typeof jest.fn>;
  releaseFile: ReturnType<typeof jest.fn>;
}

export function createMockFileRepository(): MockPostgresFileRepository &
  Partial<PostgresFileRepository> {
  return {
    createPending: jest.fn(),
    findById: jest.fn(),
    confirmUpload: jest.fn(),
    reserve: jest.fn(),
    releaseFile: jest.fn(),
  };
}

export interface MockPresignedPostSigner {
  generatePresignedPost: ReturnType<typeof jest.fn>;
}

export function createMockPresignedPostSigner(): MockPresignedPostSigner &
  Partial<PresignedPostSigner> {
  return {
    generatePresignedPost: jest.fn(),
  };
}

export function createMockAppConfigService(): Partial<AppConfigService> {
  return {
    s3: {
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      accessKey: 'minioadmin',
      secretKey: 'minioadminpassword',
      publicBucket: 'volontariapp-public',
      privateBucket: 'volontariapp-private',
      publicEndpoint: 'http://localhost:9000',
      publicBaseUrl: 'http://localhost:9000/volontariapp-public',
      presignedUrlTtl: 900,
      usePathStyle: true,
    },
  };
}

export interface MockStorageService {
  generateUploadUrl: ReturnType<typeof jest.fn>;
}

export function createMockStorageService(): MockStorageService & Partial<StorageService> {
  return {
    generateUploadUrl: jest.fn(),
  };
}

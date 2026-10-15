import { createMock } from '@volontariapp/testing';
import type { jest } from '@jest/globals';
import type { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';
import type { PresignedPostSigner } from '@volontariapp/storage-pipeline';
import type { AppConfigService } from '../../../../config/app-config.service.js';
import type { StorageService } from '../../../../modules/storage/services/storage.service.js';

export function createMockFileRepository(): jest.Mocked<PostgresFileRepository> {
  return createMock<PostgresFileRepository>();
}

export function createMockPresignedPostSigner(): jest.Mocked<PresignedPostSigner> {
  return createMock<PresignedPostSigner>();
}

export function createMockStorageService(): jest.Mocked<StorageService> {
  return createMock<StorageService>();
}

export function createMockAppConfigService(): jest.Mocked<AppConfigService> {
  const mock = createMock<AppConfigService>();
  Object.defineProperty(mock, 's3', {
    value: {
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
    writable: true,
  });
  return mock;
}

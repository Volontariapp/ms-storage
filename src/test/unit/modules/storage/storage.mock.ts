import { createMock } from '@volontariapp/testing';
import type { jest } from '@jest/globals';
import type { PostgresFileRepository } from '@volontariapp/domain-storage';
import type {
  PresignedPostSigner,
  S3StorageClient,
  StoragePipelineService,
} from '@volontariapp/storage-pipeline';
import type { AppConfigService } from '../../../../config/app-config.service.js';
import type { StorageService } from '../../../../modules/storage/services/storage.service.js';

export function createMockFileRepository(): jest.Mocked<PostgresFileRepository> {
  return createMock<PostgresFileRepository>();
}

export function createMockPresignedPostSigner(): jest.Mocked<PresignedPostSigner> {
  return createMock<PresignedPostSigner>();
}

export function createMockS3StorageClient(): jest.Mocked<S3StorageClient> {
  return createMock<S3StorageClient>();
}

export function createMockStoragePipelineService(): jest.Mocked<StoragePipelineService> {
  return createMock<StoragePipelineService>();
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
  Object.defineProperty(mock, 'scanner', {
    value: {
      host: 'localhost',
      port: 3310,
      timeoutMs: 5000,
    },
    writable: true,
  });
  return mock;
}

import { createMock } from '@volontariapp/testing';
import { jest } from '@jest/globals';
import type { PostgresFileRepository } from '@volontariapp/domain-storage';

export interface PurgeDataSourceMock {
  isInitialized: boolean;
  initialize: jest.Mock<() => Promise<unknown>>;
  destroy: jest.Mock<() => Promise<void>>;
}

export function createMockPurgeDataSource(isInitialized = false): PurgeDataSourceMock {
  return {
    isInitialized,
    initialize: jest.fn<() => Promise<unknown>>().mockResolvedValue(undefined),
    destroy: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

export function createMockPurgeRepository(): jest.Mocked<PostgresFileRepository> {
  return createMock<PostgresFileRepository>();
}

import 'reflect-metadata';
import { describe, it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { GRPC_MICROSERVICES, getGrpcOptions } from '@volontariapp/contracts-nest';
import { ExtendedMSURLsConfig } from '../../../config/base-config.js';

const buildUrls = (overrides: Record<string, unknown> = {}): ExtendedMSURLsConfig =>
  plainToInstance(ExtendedMSURLsConfig, {
    msUserUrl: 'localhost:5001',
    msPostUrl: 'localhost:5002',
    msEventUrl: 'localhost:5003',
    msSocialUrl: 'localhost:5004',
    msWsUrl: 'localhost:5005',
    msStorageUrl: '0.0.0.0:5006',
    ...overrides,
  });

describe('ExtendedMSURLsConfig', () => {
  it('accepts a complete set of microservice urls', () => {
    expect(validateSync(buildUrls())).toHaveLength(0);
  });

  it('rejects a missing msStorageUrl', () => {
    const errors = validateSync(buildUrls({ msStorageUrl: undefined }));

    expect(errors.map((error) => error.property)).toContain('msStorageUrl');
  });

  it('rejects an empty msStorageUrl', () => {
    const errors = validateSync(buildUrls({ msStorageUrl: '' }));

    expect(errors.map((error) => error.property)).toContain('msStorageUrl');
  });
});

describe('gRPC options of ms-storage', () => {
  it('binds the STORAGE microservice on the configured url', () => {
    const options = getGrpcOptions(GRPC_MICROSERVICES.STORAGE, '0.0.0.0:5006');

    expect(options.options?.url).toBe('0.0.0.0:5006');
    expect(options.options?.package).toBeDefined();
  });
});

import 'reflect-metadata';
import { describe, it, expect } from '@jest/globals';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { S3Config } from '../../../config/s3-config.js';
import { ScannerConfig } from '../../../config/scanner-config.js';

const buildS3 = (overrides: Record<string, unknown> = {}): S3Config =>
  plainToInstance(S3Config, {
    endpoint: 'http://minio:9000',
    region: 'us-east-1',
    accessKey: 'minioadmin',
    secretKey: 'minioadminpassword',
    publicBucket: 'volontariapp-public',
    privateBucket: 'volontariapp-private',
    publicEndpoint: 'http://192.168.1.10:9000',
    publicBaseUrl: 'http://192.168.1.10:9000/volontariapp-public',
    presignedUrlTtl: 900,
    usePathStyle: true,
    ...overrides,
  });

const buildScanner = (overrides: Record<string, unknown> = {}): ScannerConfig =>
  plainToInstance(ScannerConfig, {
    host: 'clamd',
    port: 3310,
    timeoutMs: 5000,
    ...overrides,
  });

const failingProperties = (errors: ReturnType<typeof validateSync>): string[] =>
  errors.map((error) => error.property);

describe('S3Config', () => {
  it('accepts a complete configuration', () => {
    expect(validateSync(buildS3())).toHaveLength(0);
  });

  it.each(['privateBucket', 'publicEndpoint', 'publicBaseUrl'])('rejects a missing %s', (key) => {
    expect(failingProperties(validateSync(buildS3({ [key]: undefined })))).toContain(key);
  });

  it.each(['privateBucket', 'publicEndpoint', 'publicBaseUrl'])('rejects an empty %s', (key) => {
    expect(failingProperties(validateSync(buildS3({ [key]: '' })))).toContain(key);
  });
});

describe('ScannerConfig', () => {
  it('accepts a complete configuration', () => {
    expect(validateSync(buildScanner())).toHaveLength(0);
  });

  it('converts numeric strings coming from environment variables', () => {
    const scanner = buildScanner({ port: '3310', timeoutMs: '2500' });

    expect(validateSync(scanner)).toHaveLength(0);
    expect(scanner.port).toBe(3310);
    expect(scanner.timeoutMs).toBe(2500);
  });

  it.each(['host', 'port', 'timeoutMs'])('rejects a missing %s', (key) => {
    expect(failingProperties(validateSync(buildScanner({ [key]: undefined })))).toContain(key);
  });

  it('rejects an out of range port', () => {
    expect(failingProperties(validateSync(buildScanner({ port: 70000 })))).toContain('port');
  });

  it('rejects a non positive timeout', () => {
    expect(failingProperties(validateSync(buildScanner({ timeoutMs: 0 })))).toContain('timeoutMs');
  });
});

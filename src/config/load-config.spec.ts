import 'reflect-metadata';
import { describe, it, expect } from '@jest/globals';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { loadConfig } from '@volontariapp/config';
import { CustomConfig } from './base-config.js';

describe('ms-storage Configuration Loading', () => {
  it('should successfully load and validate ms-storage config directory', () => {
    const currentFileDir = dirname(fileURLToPath(import.meta.url));
    const repositoryRootDir = join(currentFileDir, '..', '..');
    const rootConfigDir = join(repositoryRootDir, 'config');

    const config = loadConfig(rootConfigDir, CustomConfig);

    expect(config).toBeDefined();
    expect(config.port).toBe(3106);
    expect(config.db.database).toBe('ms_storage');
    expect(config.s3.endpoint).toBe('http://localhost:9000');
    expect(config.s3.publicBucket).toBe('volontariapp-files');
    expect(config.s3.presignedUrlTtl).toBe(900);
    expect(config.s3.usePathStyle).toBe(true);
  });
});

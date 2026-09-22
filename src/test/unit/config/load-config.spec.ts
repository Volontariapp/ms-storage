import 'reflect-metadata';
import { describe, it, expect } from '@jest/globals';
import { loadConfig } from '@volontariapp/config';
import { CustomConfig } from '../../../config/base-config.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

describe('LoadConfig Integration Test', () => {
  it('should load default.config.json for ms-storage correctly', () => {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const repositoryRootDir = join(currentDir, '../../../..');
    const configDir = join(repositoryRootDir, 'config');

    const config = loadConfig(configDir, CustomConfig);

    expect(config).toBeDefined();
    expect(typeof config.port).toBe('number');
    expect(config.s3).toBeDefined();
    expect(config.s3.endpoint).toBe('http://localhost:9000');
    expect(config.s3.publicBucket).toBe('volontariapp-public');
  });
});

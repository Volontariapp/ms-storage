import 'reflect-metadata';
import { describe, it, expect, afterEach } from '@jest/globals';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { AppConfigModule } from '../../config/app-config.module.js';
import type { CustomConfig } from '../../config/base-config.js';
import { S3Module } from '../../providers/s3/s3.module.js';
import { S3Service } from '../../providers/s3/s3.service.js';

describe('S3Module', () => {
  let moduleRef: TestingModule | undefined;

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
  });

  it('makes S3Service injectable once the app config is registered', async () => {
    const rawConfig: Partial<CustomConfig> = {
      s3: {
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
      },
    };

    moduleRef = await Test.createTestingModule({
      imports: [AppConfigModule.forRoot(rawConfig as CustomConfig), S3Module],
    }).compile();

    expect(moduleRef.get(S3Service)).toBeInstanceOf(S3Service);
  });
});

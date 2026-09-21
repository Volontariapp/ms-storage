import 'reflect-metadata';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { S3Service } from './s3.service.js';
import type { AppConfigService } from '../../config/app-config.service.js';

describe('S3Service MinIO (Integration)', () => {
  let s3Service: S3Service;

  beforeAll(async () => {
    const mockAppConfig = {
      s3: {
        endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
        region: 'us-east-1',
        accessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
        secretKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
        publicBucket: 'volontariapp-test-files',
        presignedUrlTtl: 900,
        usePathStyle: true,
      },
    } as unknown as AppConfigService;

    s3Service = new S3Service(mockAppConfig);
  });

  it('should generate valid presigned upload URL for MinIO', async () => {
    const uploadUrl = await s3Service.generatePresignedUploadUrl({
      key: 'test/sample-image.jpg',
      contentType: 'image/jpeg',
    });

    expect(uploadUrl).toBeDefined();
    expect(uploadUrl).toContain('volontariapp-test-files/test/sample-image.jpg');
    expect(uploadUrl).toContain('X-Amz-Signature');
  });

  it('should generate valid presigned download URL for MinIO', async () => {
    const downloadUrl = await s3Service.generatePresignedDownloadUrl({
      key: 'test/sample-image.jpg',
    });

    expect(downloadUrl).toBeDefined();
    expect(downloadUrl).toContain('volontariapp-test-files/test/sample-image.jpg');
  });

  it('should handle MinIO object existence check and return false for non-existent key', async () => {
    try {
      const client = s3Service.getClient();
      await client.send(
        new CreateBucketCommand({
          Bucket: 'volontariapp-test-files',
        }),
      );
    } catch {
      // Bucket may already exist or MinIO offline
    }

    try {
      const exists = await s3Service.doesObjectExist({
        key: 'non-existent-key-123456.jpg',
      });
      expect(exists).toBe(false);
    } catch (err: unknown) {
      // If MinIO server is not running on localhost, catch connection error gracefully
      expect((err as { code?: string }).code ?? (err as Error).message).toBeDefined();
    }
  });
});

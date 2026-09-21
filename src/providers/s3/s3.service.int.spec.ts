import 'reflect-metadata';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { S3Service } from './s3.service.js';
import type { AppConfigService } from '../../config/app-config.service.js';

describe('S3Service MinIO E2E Lifecycle (Integration)', () => {
  let s3Service: S3Service;
  let minioAvailable = false;
  const testBucket = 'volontariapp-test-files';
  const testKey = `it-tests/sample-${Date.now()}.txt`;
  const fileContent = 'Hello Volontariapp S3 MinIO Integration Test!';
  const contentType = 'text/plain';

  beforeAll(async () => {
    const mockAppConfig = {
      s3: {
        endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
        region: 'us-east-1',
        accessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
        secretKey: process.env.S3_SECRET_KEY ?? 'minioadmin',
        publicBucket: testBucket,
        presignedUrlTtl: 900,
        usePathStyle: true,
      },
    } as unknown as AppConfigService;

    s3Service = new S3Service(mockAppConfig);

    try {
      const client = s3Service.getClient();
      await client.send(new CreateBucketCommand({ Bucket: testBucket }));
      minioAvailable = true;
    } catch {
      try {
        minioAvailable = !(await s3Service.doesObjectExist({ key: 'ping-check-non-existent.txt' }));
      } catch {
        minioAvailable = false;
      }
    }
  });

  it('should complete a full E2E lifecycle: Presigned Upload -> HTTP PUT -> Head Object -> Presigned Download -> HTTP GET -> Delete Object', async () => {
    if (!minioAvailable) {
      console.warn('MinIO server is not available locally. Skipping live HTTP S3 test.');
      return;
    }

    // 1. Generate Presigned Upload URL
    const uploadUrl = await s3Service.generatePresignedUploadUrl({
      key: testKey,
      contentType,
    });
    expect(uploadUrl).toBeDefined();
    expect(uploadUrl).toContain(testBucket);

    // 2. Perform HTTP PUT upload directly to MinIO
    const putResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentType,
      },
      body: fileContent,
    });
    expect(putResponse.status).toBe(200);

    // 3. Verify object exists via HeadObject (doesObjectExist)
    const existsAfterUpload = await s3Service.doesObjectExist({ key: testKey });
    expect(existsAfterUpload).toBe(true);

    // 4. Generate Presigned Download URL
    const downloadUrl = await s3Service.generatePresignedDownloadUrl({
      key: testKey,
    });
    expect(downloadUrl).toBeDefined();

    // 5. Perform HTTP GET download directly from MinIO
    const getResponse = await fetch(downloadUrl);
    expect(getResponse.status).toBe(200);
    const downloadedText = await getResponse.text();
    expect(downloadedText).toBe(fileContent);

    // 6. Delete object from MinIO
    await s3Service.deleteObject({ key: testKey });

    // 7. Verify object no longer exists
    const existsAfterDelete = await s3Service.doesObjectExist({ key: testKey });
    expect(existsAfterDelete).toBe(false);
  });
});

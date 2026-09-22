import 'reflect-metadata';
import { describe, it, expect, beforeAll } from '@jest/globals';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { S3Service } from '../../providers/s3/s3.service.js';
import { AppConfigService } from '../../config/app-config.service.js';
import type { CustomConfig } from '../../config/base-config.js';

/**
 * S'assure que le bucket S3 existe avant le lancement des tests d'intégration.
 * - Si le bucket existe déjà : ignore l'erreur et continue.
 * - Si MinIO est injoignable : lève l'exception pour faire échouer le test (FAIL).
 */
async function ensureBucketExists(s3Service: S3Service, bucketName: string): Promise<void> {
  const client = s3Service.getClient();
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
  } catch (err: unknown) {
    if (
      typeof err === 'object' &&
      err !== null &&
      'name' in err &&
      (err.name === 'BucketAlreadyOwnedByYou' || err.name === 'BucketAlreadyExists')
    ) {
      return;
    }
    throw err;
  }
}

describe('S3Service MinIO E2E Lifecycle (Integration)', () => {
  let s3Service: S3Service;
  const testBucket = process.env.S3_PUBLIC_BUCKET ?? 'volontariapp-public';
  const testKey = `it-tests/sample-${Date.now()}.txt`;
  const fileContent = 'Hello Volontariapp S3 MinIO Integration Test!';
  const contentType = 'text/plain';

  beforeAll(async () => {
    const rawConfig: Partial<CustomConfig> = {
      port: 3006,
      s3: {
        endpoint: process.env.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
        region: 'us-east-1',
        accessKey: process.env.S3_ACCESS_KEY ?? 'minioadmin',
        secretKey: process.env.S3_SECRET_KEY ?? 'minioadminpassword',
        publicBucket: testBucket,
        presignedUrlTtl: 900,
        usePathStyle: true,
      },
    };

    const appConfigService = new AppConfigService(rawConfig as CustomConfig);
    s3Service = new S3Service(appConfigService);

    await ensureBucketExists(s3Service, testBucket);
  });

  it('should complete a full E2E lifecycle: Presigned Upload -> HTTP PUT -> Head Object -> Presigned Download -> HTTP GET -> Delete Object', async () => {
    // 1. Generate Presigned Upload URL
    const uploadUrl = await s3Service.generatePresignedUploadUrl({
      key: testKey,
      contentType,
    });
    expect(uploadUrl).toBeDefined();

    // 2. Perform HTTP PUT upload
    const putResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: fileContent,
    });
    expect(putResponse.status).toBe(200);

    // 3. Verify object exists via HeadObject
    const existsAfterUpload = await s3Service.doesObjectExist({ key: testKey });
    expect(existsAfterUpload).toBe(true);

    // 4. Generate Presigned Download URL
    const downloadUrl = await s3Service.generatePresignedDownloadUrl({ key: testKey });
    expect(downloadUrl).toBeDefined();

    // 5. Perform HTTP GET download
    const getResponse = await fetch(downloadUrl);
    expect(getResponse.status).toBe(200);
    const downloadedText = await getResponse.text();
    expect(downloadedText).toBe(fileContent);

    // 6. Delete object
    await s3Service.deleteObject({ key: testKey });

    // 7. Verify deletion
    const existsAfterDelete = await s3Service.doesObjectExist({ key: testKey });
    expect(existsAfterDelete).toBe(false);
  });
});

import 'reflect-metadata';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { S3Service } from './s3.service.js';
import type { AppConfigService } from '../../config/app-config.service.js';

describe('S3Service (Unit)', () => {
  let s3Service: S3Service;
  let mockAppConfig: AppConfigService;

  beforeEach(() => {
    mockAppConfig = {
      s3: {
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        accessKey: 'minioadmin',
        secretKey: 'minioadmin',
        publicBucket: 'volontariapp-files',
        presignedUrlTtl: 900,
        usePathStyle: true,
      },
    } as unknown as AppConfigService;

    s3Service = new S3Service(mockAppConfig);
  });

  it('should instantiate S3Client correctly', () => {
    const client = s3Service.getClient();
    expect(client).toBeDefined();
  });

  it('should generate presigned upload url', async () => {
    const url = await s3Service.generatePresignedUploadUrl({
      key: 'avatars/user-1.jpg',
      contentType: 'image/jpeg',
    });

    expect(url).toBeDefined();
    expect(typeof url).toBe('string');
    expect(url).toContain('http://localhost:9000/volontariapp-files/avatars/user-1.jpg');
    expect(url).toContain('X-Amz-Signature');
  });

  it('should generate presigned download url', async () => {
    const url = await s3Service.generatePresignedDownloadUrl({
      key: 'avatars/user-1.jpg',
    });

    expect(url).toBeDefined();
    expect(typeof url).toBe('string');
    expect(url).toContain('http://localhost:9000/volontariapp-files/avatars/user-1.jpg');
  });

  it('should return false if object does not exist (NotFound error)', async () => {
    const sendSpy = jest.spyOn(s3Service.getClient(), 'send').mockImplementation(async () => {
      const error = new Error('NotFound');
      error.name = 'NotFound';
      throw error;
    });

    const exists = await s3Service.doesObjectExist({ key: 'missing.jpg' });

    expect(exists).toBe(false);
    expect(sendSpy).toHaveBeenCalled();
  });

  it('should return true if object exists', async () => {
    const sendSpy = jest.spyOn(s3Service.getClient(), 'send').mockImplementation(async () => {
      return {} as any;
    });

    const exists = await s3Service.doesObjectExist({ key: 'existing.jpg' });

    expect(exists).toBe(true);
    expect(sendSpy).toHaveBeenCalled();
  });

  it('should call deleteObject on client', async () => {
    const sendSpy = jest.spyOn(s3Service.getClient(), 'send').mockImplementation(async () => {
      return {} as any;
    });

    await s3Service.deleteObject({ key: 'delete-me.jpg' });

    expect(sendSpy).toHaveBeenCalled();
  });
});

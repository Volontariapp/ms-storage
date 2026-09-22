import { Injectable } from '@nestjs/common';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  NotFound,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppConfigService } from '../../config/app-config.service.js';
import type {
  GeneratePresignedUploadUrlOptions,
  GeneratePresignedDownloadUrlOptions,
  S3ObjectOptions,
} from '@volontariapp/domain-storage';

export type {
  GeneratePresignedUploadUrlOptions,
  GeneratePresignedDownloadUrlOptions,
  S3ObjectOptions,
};

function isNotFoundError(error: unknown): boolean {
  if (error instanceof NotFound) {
    return true;
  }
  if (error instanceof S3ServiceException) {
    return (
      error.name === 'NotFound' ||
      error.name === 'NoSuchKey' ||
      error.$metadata?.httpStatusCode === 404
    );
  }
  if (typeof error === 'object' && error !== null) {
    if ('name' in error && (error.name === 'NotFound' || error.name === 'NoSuchKey')) {
      return true;
    }
    if (
      '$metadata' in error &&
      typeof error.$metadata === 'object' &&
      error.$metadata !== null &&
      'httpStatusCode' in error.$metadata &&
      error.$metadata.httpStatusCode === 404
    ) {
      return true;
    }
  }
  return false;
}

@Injectable()
export class S3Service {
  private readonly client: S3Client;

  constructor(private readonly appConfig: AppConfigService) {
    const s3Config = this.appConfig.s3;

    this.client = new S3Client({
      endpoint: s3Config.endpoint,
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKey,
        secretAccessKey: s3Config.secretKey,
      },
      forcePathStyle: s3Config.usePathStyle,
    });
  }

  /**
   * Retourne le client S3 sous-jacent si besoin d'opérations bas niveau.
   */
  getClient(): S3Client {
    return this.client;
  }

  /**
   * Génère une Presigned Upload URL (HTTP PUT) permettant au client mobile/front
   * d'uploader directement un fichier sur S3/MinIO.
   */
  async generatePresignedUploadUrl(options: GeneratePresignedUploadUrlOptions): Promise<string> {
    const bucket = this.appConfig.s3.publicBucket;
    const ttlSeconds = this.appConfig.s3.presignedUrlTtl;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: options.key,
      ContentType: options.contentType,
    });

    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }

  /**
   * Génère une Presigned Download URL (HTTP GET) permettant d'accéder temporairement à un fichier S3.
   */
  async generatePresignedDownloadUrl(
    options: GeneratePresignedDownloadUrlOptions,
  ): Promise<string> {
    const bucket = this.appConfig.s3.publicBucket;
    const ttlSeconds = this.appConfig.s3.presignedUrlTtl;

    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: options.key,
    });

    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }

  /**
   * Vérifie l'existence d'un objet S3 via HeadObjectCommand.
   */
  async doesObjectExist(options: S3ObjectOptions): Promise<boolean> {
    const bucket = this.appConfig.s3.publicBucket;

    try {
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: options.key,
      });
      await this.client.send(command);
      return true;
    } catch (error: unknown) {
      if (isNotFoundError(error)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Supprime un objet S3 via DeleteObjectCommand.
   */
  async deleteObject(options: S3ObjectOptions): Promise<void> {
    const bucket = this.appConfig.s3.publicBucket;

    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: options.key,
    });

    await this.client.send(command);
  }
}

import { Injectable } from '@nestjs/common';
import { Logger } from '@volontariapp/logger';
import { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';
import { getValidationPolicy } from '@volontariapp/domain-storage';
import { PresignedPostSigner } from '@volontariapp/storage-pipeline';
import { AppConfigService } from '../../../config/app-config.service.js';
import { GenerateUploadUrlCommandDTO } from '../dto/request/command/generate-upload-url.command.dto.js';
import { GenerateUploadUrlResponseDTO } from '../dto/response/generate-upload-url.response.dto.js';
import { ConfirmFileAttachmentCommandDTO } from '../dto/request/command/confirm-file-attachment.command.dto.js';
import { ConfirmFileAttachmentResponseDTO } from '../dto/response/confirm-file-attachment.response.dto.js';
import { StorageTransformer } from '../transformers/storage.transformer.js';

@Injectable()
export class StorageService {
  private readonly logger = new Logger({ context: StorageService.name });

  constructor(
    private readonly fileRepository: PostgresFileRepository,
    private readonly presignedPostSigner: PresignedPostSigner,
    private readonly appConfig: AppConfigService,
  ) {}

  /**
   * Generates a presigned multipart upload POST into quarantine for the client,
   * validates MIME type and declared size against the entity policy,
   * and persists the pending file record in the files table.
   *
   * Invariant 1: No file bytes transit through ms-storage; upload goes direct to S3.
   * Invariant 2: All uploads arrive in quarantine (volontariapp-private).
   * Invariant 5: owner_id comes from CurrentUser (INTERNAL_TOKEN), never from request payload.
   */
  async generateUploadUrl(
    ownerId: string,
    command: GenerateUploadUrlCommandDTO,
  ): Promise<GenerateUploadUrlResponseDTO> {
    const domainEntityType = StorageTransformer.toDomainEntityType(command.entityType);
    const policy = getValidationPolicy(domainEntityType);

    this.logger.info(
      `Declaring pending file for owner ${ownerId}, entityType: ${domainEntityType}, mime: ${command.mimeType}, size: ${String(command.sizeBytes)}`,
    );

    const ttlSeconds = this.appConfig.s3.presignedUrlTtl;

    const file = await this.fileRepository.createPending({
      ownerId,
      entityType: domainEntityType,
      declaredMimeType: command.mimeType,
      declaredSize: command.sizeBytes,
      presignedUrlTtlSeconds: ttlSeconds,
    });

    this.logger.info(
      `File ${file.id} declared (${file.validationMode}), generating presigned multipart POST`,
    );

    const presignedPost = await this.presignedPostSigner.generatePresignedPost({
      fileId: file.id,
      declaredMimeType: file.declaredMimeType,
      maxSizeBytes: policy.maxSizeBytes,
      ttlSeconds,
    });

    return StorageTransformer.toGenerateUploadUrlResponse(file, presignedPost);
  }

  /**
   * Synchronously confirms file attachment (reservation) before business entity is created.
   *
   * Validates and locks files for the entity (all-or-nothing).
   * Calls PostgresFileRepository.reserve with ownerId from token.
   * Returns ConfirmFileAttachmentResponseDTO with FileMetadata array and scanStatus.
   *
   * Invariant 5: owner_id comes from CurrentUser (INTERNAL_TOKEN), never from request payload.
   * Invariant 6: Synchronous attachment before entity write with short deadline (2s).
   */
  async confirmFileAttachment(
    ownerId: string,
    command: ConfirmFileAttachmentCommandDTO,
  ): Promise<ConfirmFileAttachmentResponseDTO> {
    const domainEntityType = StorageTransformer.toDomainEntityType(command.entityType);

    this.logger.info(
      `ConfirmFileAttachment: reserving ${String(command.fileIds.length)} file(s) for owner ${ownerId}, entityType: ${domainEntityType}, entityId: ${command.entityId}`,
    );

    const files = await this.fileRepository.reserve({
      fileIds: command.fileIds,
      entityType: domainEntityType,
      entityId: command.entityId,
      ownerId,
    });

    return StorageTransformer.toConfirmFileAttachmentResponse(
      files,
      this.appConfig.s3.publicBaseUrl,
    );
  }
}

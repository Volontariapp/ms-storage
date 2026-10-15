import { Injectable } from '@nestjs/common';
import { Logger } from '@volontariapp/logger';
import {
  FileNotFoundException,
  FileStatus,
  getValidationPolicy,
  PostgresFileRepository,
  ScanStatus,
  ValidationMode,
} from '@volontariapp/domain-storage';
import {
  PresignedPostSigner,
  S3StorageClient,
  StoragePipelineService,
  ScannerTechnicalError,
  type PipelineResult,
} from '@volontariapp/storage-pipeline';
import { AppConfigService } from '../../../config/app-config.service.js';
import { GenerateUploadUrlCommandDTO } from '../dto/request/command/generate-upload-url.command.dto.js';
import { GenerateUploadUrlResponseDTO } from '../dto/response/generate-upload-url.response.dto.js';
import { ConfirmFileAttachmentCommandDTO } from '../dto/request/command/confirm-file-attachment.command.dto.js';
import { ConfirmFileAttachmentResponseDTO } from '../dto/response/confirm-file-attachment.response.dto.js';
import { ConfirmUploadCommandDTO } from '../dto/request/command/confirm-upload.command.dto.js';
import { ConfirmUploadResponseDTO } from '../dto/response/confirm-upload.response.dto.js';
import { UploadConfirmationFailedException } from '../exceptions/upload-confirmation-failed.exception.js';
import { StorageTransformer } from '../transformers/storage.transformer.js';

@Injectable()
export class StorageService {
  private readonly logger = new Logger({ context: StorageService.name });

  constructor(
    private readonly fileRepository: PostgresFileRepository,
    private readonly presignedPostSigner: PresignedPostSigner,
    private readonly s3Client: S3StorageClient,
    private readonly storagePipelineService: StoragePipelineService,
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

  /**
   * Confirms that a file has been uploaded to quarantine,
   * transitions the file from AWAITING_UPLOAD to SCANNING,
   * and creates a storage.scan_file job in jobs_outbox (for ASYNC files).
   *
   * Invariant 2: Checks quarantine object presence in private S3 bucket.
   * Invariant 5: owner_id comes from CurrentUser (INTERNAL_TOKEN), never from request payload.
   *
   * Throws FileNotFoundException if file does not exist or owner mismatch (404/NOT_FOUND).
   * Throws UploadConfirmationFailedException if upload expired or object missing in S3 (422/FAILED_PRECONDITION).
   * Returns current file metadata idempotently if already confirmed.
   */
  async confirmUpload(
    ownerId: string,
    command: ConfirmUploadCommandDTO,
  ): Promise<ConfirmUploadResponseDTO> {
    const fileId = command.fileId;
    this.logger.info(`ConfirmUpload: confirming file ${fileId} for owner ${ownerId}`);

    const file = await this.fileRepository.findById(fileId);
    if (!file || file.ownerId !== ownerId) {
      throw new FileNotFoundException(fileId);
    }

    // Idempotent retry: already confirmed or processed
    if (
      file.scanStatus === ScanStatus.SCANNING ||
      file.scanStatus === ScanStatus.CLEAN ||
      file.scanStatus === ScanStatus.REJECTED
    ) {
      this.logger.info(
        `ConfirmUpload: file ${fileId} is already in state ${file.scanStatus}, returning current state`,
      );
      return StorageTransformer.toConfirmUploadResponse(file, this.appConfig.s3.publicBaseUrl);
    }

    if (file.status === FileStatus.ORPHANED || file.status === FileStatus.DELETED) {
      throw new UploadConfirmationFailedException(fileId, 'File is no longer available');
    }

    if (file.uploadExpiresAt.getTime() <= Date.now()) {
      throw new UploadConfirmationFailedException(fileId, 'Upload URL has expired');
    }

    // Verify object in quarantine
    const quarantineMeta = await this.s3Client.headQuarantineObject(file.id);
    if (!quarantineMeta) {
      this.logger.warn(`ConfirmUpload: quarantine object not found in S3 for file ${fileId}`);
      throw new UploadConfirmationFailedException(fileId, 'Object not found in quarantine');
    }

    // Transition file and enqueue job (if ASYNC) atomically
    const result = await this.fileRepository.confirmUpload({
      fileId: file.id,
      ownerId,
      actualSize: quarantineMeta.size,
    });

    if (!result) {
      // Concurrent confirmation may have occurred
      const refreshed = await this.fileRepository.findById(fileId);
      if (
        refreshed &&
        refreshed.ownerId === ownerId &&
        (refreshed.scanStatus === ScanStatus.SCANNING ||
          refreshed.scanStatus === ScanStatus.CLEAN ||
          refreshed.scanStatus === ScanStatus.REJECTED)
      ) {
        return StorageTransformer.toConfirmUploadResponse(
          refreshed,
          this.appConfig.s3.publicBaseUrl,
        );
      }
      throw new UploadConfirmationFailedException(fileId, 'Could not confirm upload');
    }

    // If ASYNC, job is queued in outbox; return SCANNING immediately
    if (result.validationMode === ValidationMode.ASYNC) {
      const updated = (await this.fileRepository.findById(file.id)) ?? file;
      return StorageTransformer.toConfirmUploadResponse(updated, this.appConfig.s3.publicBaseUrl);
    }

    // If SYNC, execute synchronous processing pipeline (magic bytes, clamd scan, Sharp re-encoding)
    const timeoutMs = Math.min(this.appConfig.scanner.timeoutMs + 3000, 8000);

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new ScannerTechnicalError(
            `SYNC storage pipeline timed out after ${String(timeoutMs)}ms`,
            'SCANNER_TIMEOUT',
          ),
        );
      }, timeoutMs);
    });

    let pipelineResult: PipelineResult;
    try {
      pipelineResult = await Promise.race([
        this.storagePipelineService.processFile({
          fileId: file.id,
          entityType: file.entityType,
          declaredMimeType: file.declaredMimeType,
          declaredSize: file.declaredSize,
        }),
        timeoutPromise,
      ]);
    } catch (error: unknown) {
      this.logger.error(
        `Technical error during SYNC pipeline for file ${file.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      const policy = getValidationPolicy(file.entityType);
      if (policy.asyncAllowed) {
        this.logger.warn(
          `Entity type ${file.entityType} allows ASYNC: switching file ${file.id} to ASYNC`,
        );
        await this.fileRepository.switchToAsync(file.id);
        const switched = (await this.fileRepository.findById(file.id)) ?? file;
        return StorageTransformer.toConfirmUploadResponse(
          switched,
          this.appConfig.s3.publicBaseUrl,
        );
      } else {
        this.logger.warn(
          `Entity type ${file.entityType} does NOT allow ASYNC: resetting file ${file.id} to AWAITING_UPLOAD`,
        );
        await this.fileRepository.resetToAwaitingUpload(file.id);
        if (error instanceof ScannerTechnicalError) {
          throw error;
        }
        throw new ScannerTechnicalError(
          error instanceof Error ? error.message : 'Storage technical error',
          'STORAGE_TECHNICAL_ERROR',
        );
      }
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }

    if (pipelineResult.status === 'REJECTED') {
      this.logger.warn(
        `SYNC pipeline rejected file ${file.id}: reason ${pipelineResult.rejectionReason}`,
      );
      await this.fileRepository.rejectScan({
        fileId: file.id,
        reason: pipelineResult.rejectionReason,
      });
      throw new UploadConfirmationFailedException(file.id, pipelineResult.rejectionReason, {
        rejectionReason: pipelineResult.rejectionReason,
        ...pipelineResult.details,
      });
    }

    // pipelineResult.status === 'CLEAN'
    this.logger.info(
      `SYNC pipeline succeeded for file ${file.id}, completing scan with public key ${pipelineResult.publicKey}`,
    );
    const transition = await this.fileRepository.completeScan({
      fileId: file.id,
      publicKey: pipelineResult.publicKey,
    });

    if (!transition) {
      this.logger.warn(
        `File ${file.id} could not be completed (orphaned or deleted), removing public object`,
      );
      try {
        await this.s3Client.deletePublicObject(pipelineResult.publicKey);
      } catch (deleteError: unknown) {
        this.logger.warn(
          `Failed to delete public object ${pipelineResult.publicKey}: ${deleteError instanceof Error ? deleteError.message : String(deleteError)}`,
        );
      }
      const current = await this.fileRepository.findById(file.id);
      if (!current) {
        throw new FileNotFoundException(file.id);
      }
      throw new UploadConfirmationFailedException(file.id, 'File is no longer available');
    }

    const cleanFile = (await this.fileRepository.findById(file.id)) ?? file;
    return StorageTransformer.toConfirmUploadResponse(cleanFile, this.appConfig.s3.publicBaseUrl);
  }
}

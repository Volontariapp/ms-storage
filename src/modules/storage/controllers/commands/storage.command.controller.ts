import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import { Logger } from '@volontariapp/logger';
import { CurrentUser, type AuthUser } from '@volontariapp/auth';
import { STORAGE_SERVICE_NAME } from '@volontariapp/contracts-nest';
import { StorageService } from '../../services/storage.service.js';
import { GenerateUploadUrlCommandDTO } from '../../dto/request/command/generate-upload-url.command.dto.js';
import { GenerateUploadUrlResponseDTO } from '../../dto/response/generate-upload-url.response.dto.js';
import { ConfirmFileAttachmentCommandDTO } from '../../dto/request/command/confirm-file-attachment.command.dto.js';
import { ConfirmFileAttachmentResponseDTO } from '../../dto/response/confirm-file-attachment.response.dto.js';
import { ConfirmUploadCommandDTO } from '../../dto/request/command/confirm-upload.command.dto.js';
import { ConfirmUploadResponseDTO } from '../../dto/response/confirm-upload.response.dto.js';

@Controller()
export class StorageCommandController {
  private readonly logger = new Logger({ context: StorageCommandController.name });

  constructor(private readonly storageService: StorageService) {}

  @GrpcMethod(STORAGE_SERVICE_NAME, 'GenerateUploadUrl')
  async generateUploadUrl(
    @Payload() data: GenerateUploadUrlCommandDTO,
    @CurrentUser() user: AuthUser,
  ): Promise<GenerateUploadUrlResponseDTO> {
    this.logger.info(
      `gRPC GenerateUploadUrl: entity ${String(data.entityType)} by user ${user.id}`,
    );
    return this.storageService.generateUploadUrl(user.id, data);
  }

  @GrpcMethod(STORAGE_SERVICE_NAME, 'ConfirmUpload')
  async confirmUpload(
    @Payload() data: ConfirmUploadCommandDTO,
    @CurrentUser() user: AuthUser,
  ): Promise<ConfirmUploadResponseDTO> {
    this.logger.info(`gRPC ConfirmUpload: file ${data.fileId} by user ${user.id}`);
    return this.storageService.confirmUpload(user.id, data);
  }

  @GrpcMethod(STORAGE_SERVICE_NAME, 'ConfirmFileAttachment')
  async confirmFileAttachment(
    @Payload() data: ConfirmFileAttachmentCommandDTO,
    @CurrentUser() user: AuthUser,
  ): Promise<ConfirmFileAttachmentResponseDTO> {
    this.logger.info(
      `gRPC ConfirmFileAttachment: entity ${String(data.entityType)} (${data.entityId}) by user ${user.id} with ${String(data.fileIds.length)} file(s)`,
    );
    return this.storageService.confirmFileAttachment(user.id, data);
  }
}

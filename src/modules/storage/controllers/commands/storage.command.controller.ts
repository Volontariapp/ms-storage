import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import { Logger } from '@volontariapp/logger';
import { CurrentUser, type AuthUser } from '@volontariapp/auth';
import { STORAGE_SERVICE_NAME } from '@volontariapp/contracts-nest';
import { StorageService } from '../../services/storage.service.js';
import { GenerateUploadUrlCommandDTO } from '../../dto/request/command/generate-upload-url.command.dto.js';
import { GenerateUploadUrlResponseDTO } from '../../dto/response/generate-upload-url.response.dto.js';

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
}

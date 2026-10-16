import { Controller } from '@nestjs/common';
import { GrpcMethod, Payload } from '@nestjs/microservices';
import { Logger } from '@volontariapp/logger';
import { CurrentUser, type AuthUser } from '@volontariapp/auth';
import { STORAGE_SERVICE_NAME } from '@volontariapp/contracts-nest';
import { StorageService } from '../../services/storage.service.js';
import { GetFileMetadataQueryDTO } from '../../dto/request/query/get-file-metadata.query.dto.js';
import { FileMetadataResponseDTO } from '../../dto/response/file-metadata.response.dto.js';

@Controller()
export class StorageQueryController {
  private readonly logger = new Logger({ context: StorageQueryController.name });

  constructor(private readonly storageService: StorageService) {}

  @GrpcMethod(STORAGE_SERVICE_NAME, 'GetFileMetadata')
  async getFileMetadata(
    @Payload() data: GetFileMetadataQueryDTO,
    @CurrentUser() user: AuthUser,
  ): Promise<FileMetadataResponseDTO> {
    this.logger.info(`gRPC GetFileMetadata: file ${data.fileId} by user ${user.id}`);
    return this.storageService.getFileMetadata(user.id, data);
  }
}

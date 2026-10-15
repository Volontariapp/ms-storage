import { EntityType as GrpcEntityType, GrpcDateMapper } from '@volontariapp/contracts-nest';
import {
  EntityType as DomainEntityType,
  type FileEntity,
  InvalidEntityTypeException,
} from '@volontariapp/domain-storage';
import type { PresignedPostResult } from '@volontariapp/storage-pipeline';
import { GenerateUploadUrlResponseDTO } from '../dto/response/generate-upload-url.response.dto.js';

export class StorageTransformer {
  /**
   * Maps a Protobuf gRPC EntityType to a domain-storage EntityType.
   * Throws InvalidEntityTypeException for unspecified or unknown values.
   */
  static toDomainEntityType(grpcType: GrpcEntityType): DomainEntityType {
    switch (grpcType) {
      case GrpcEntityType.ENTITY_TYPE_POST:
        return DomainEntityType.POST;
      case GrpcEntityType.ENTITY_TYPE_USER_AVATAR:
        return DomainEntityType.USER_AVATAR;
      case GrpcEntityType.ENTITY_TYPE_BADGE_ICON:
        return DomainEntityType.BADGE_ICON;
      case GrpcEntityType.ENTITY_TYPE_EVENT_COVER:
        return DomainEntityType.EVENT_COVER;
      default:
        throw new InvalidEntityTypeException(String(grpcType));
    }
  }

  /**
   * Maps domain FileEntity and PresignedPostResult to GenerateUploadUrlResponseDTO.
   */
  static toGenerateUploadUrlResponse(
    file: FileEntity,
    presignedPost: PresignedPostResult,
  ): GenerateUploadUrlResponseDTO {
    const response = new GenerateUploadUrlResponseDTO();
    response.fileId = file.id;
    response.uploadUrl = presignedPost.url;
    response.uploadFields = presignedPost.fields;
    response.expiresAt = GrpcDateMapper.toTimestamp(file.uploadExpiresAt);
    return response;
  }
}

import {
  EntityType as GrpcEntityType,
  FileStatus as GrpcFileStatus,
  ScanStatus as GrpcScanStatus,
  ValidationMode as GrpcValidationMode,
  RejectionReason as GrpcRejectionReason,
  type FileMetadata,
  GrpcDateMapper,
} from '@volontariapp/contracts-nest';
import {
  EntityType as DomainEntityType,
  FileStatus as DomainFileStatus,
  ScanStatus as DomainScanStatus,
  ValidationMode as DomainValidationMode,
  RejectionReason as DomainRejectionReason,
  type FileEntity,
  InvalidEntityTypeException,
  buildPublicFileUrl,
} from '@volontariapp/domain-storage';
import type { PresignedPostResult } from '@volontariapp/storage-pipeline';
import { GenerateUploadUrlResponseDTO } from '../dto/response/generate-upload-url.response.dto.js';
import { ConfirmFileAttachmentResponseDTO } from '../dto/response/confirm-file-attachment.response.dto.js';
import { ConfirmUploadResponseDTO } from '../dto/response/confirm-upload.response.dto.js';

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
   * Maps a domain-storage EntityType to a Protobuf gRPC EntityType.
   */
  static toGrpcEntityType(domainType: DomainEntityType): GrpcEntityType {
    switch (domainType) {
      case DomainEntityType.POST:
        return GrpcEntityType.ENTITY_TYPE_POST;
      case DomainEntityType.USER_AVATAR:
        return GrpcEntityType.ENTITY_TYPE_USER_AVATAR;
      case DomainEntityType.BADGE_ICON:
        return GrpcEntityType.ENTITY_TYPE_BADGE_ICON;
      case DomainEntityType.EVENT_COVER:
        return GrpcEntityType.ENTITY_TYPE_EVENT_COVER;
      default:
        return GrpcEntityType.ENTITY_TYPE_UNSPECIFIED;
    }
  }

  /**
   * Maps a domain FileStatus to Protobuf gRPC FileStatus.
   */
  static toGrpcFileStatus(status: DomainFileStatus): GrpcFileStatus {
    switch (status) {
      case DomainFileStatus.PENDING:
        return GrpcFileStatus.FILE_STATUS_PENDING;
      case DomainFileStatus.RESERVED:
        return GrpcFileStatus.FILE_STATUS_RESERVED;
      case DomainFileStatus.ATTACHED:
        return GrpcFileStatus.FILE_STATUS_ATTACHED;
      case DomainFileStatus.ORPHANED:
        return GrpcFileStatus.FILE_STATUS_ORPHANED;
      case DomainFileStatus.DELETED:
        return GrpcFileStatus.FILE_STATUS_DELETED;
      default:
        return GrpcFileStatus.FILE_STATUS_UNSPECIFIED;
    }
  }

  /**
   * Maps a domain ScanStatus to Protobuf gRPC ScanStatus.
   */
  static toGrpcScanStatus(scanStatus: DomainScanStatus): GrpcScanStatus {
    switch (scanStatus) {
      case DomainScanStatus.AWAITING_UPLOAD:
        return GrpcScanStatus.SCAN_STATUS_AWAITING_UPLOAD;
      case DomainScanStatus.SCANNING:
        return GrpcScanStatus.SCAN_STATUS_SCANNING;
      case DomainScanStatus.CLEAN:
        return GrpcScanStatus.SCAN_STATUS_CLEAN;
      case DomainScanStatus.REJECTED:
        return GrpcScanStatus.SCAN_STATUS_REJECTED;
      default:
        return GrpcScanStatus.SCAN_STATUS_UNSPECIFIED;
    }
  }

  /**
   * Maps a domain ValidationMode to Protobuf gRPC ValidationMode.
   */
  static toGrpcValidationMode(mode: DomainValidationMode): GrpcValidationMode {
    switch (mode) {
      case DomainValidationMode.SYNC:
        return GrpcValidationMode.VALIDATION_MODE_SYNC;
      case DomainValidationMode.ASYNC:
        return GrpcValidationMode.VALIDATION_MODE_ASYNC;
      default:
        return GrpcValidationMode.VALIDATION_MODE_UNSPECIFIED;
    }
  }

  /**
   * Maps an optional domain RejectionReason to Protobuf gRPC RejectionReason.
   */
  static toGrpcRejectionReason(
    reason: DomainRejectionReason | null,
  ): GrpcRejectionReason | undefined {
    if (!reason) return undefined;
    switch (reason) {
      case DomainRejectionReason.SIZE_MISMATCH:
        return GrpcRejectionReason.REJECTION_REASON_SIZE_MISMATCH;
      case DomainRejectionReason.MIME_MISMATCH:
        return GrpcRejectionReason.REJECTION_REASON_MIME_MISMATCH;
      case DomainRejectionReason.MALWARE:
        return GrpcRejectionReason.REJECTION_REASON_MALWARE;
      case DomainRejectionReason.UNDECODABLE:
        return GrpcRejectionReason.REJECTION_REASON_UNDECODABLE;
      case DomainRejectionReason.SCAN_TIMEOUT:
        return GrpcRejectionReason.REJECTION_REASON_SCAN_TIMEOUT;
      default:
        return GrpcRejectionReason.REJECTION_REASON_UNSPECIFIED;
    }
  }

  /**
   * Maps domain FileEntity to Protobuf gRPC FileMetadata.
   *
   * Security & Privacy invariant (doc 08 & 09):
   * - quarantineKey is NEVER exposed to callers (empty string if not public).
   * - objectKey and publicUrl are only set when scan_status is CLEAN.
   */
  static toFileMetadata(file: FileEntity, publicBaseUrl?: string): FileMetadata {
    const isClean = file.scanStatus === DomainScanStatus.CLEAN;
    const hasPublicKey = Boolean(file.publicKey);
    const isPublic = isClean || hasPublicKey;

    let publicUrl: string | undefined;
    if (isClean && publicBaseUrl && publicBaseUrl.trim() !== '') {
      publicUrl = buildPublicFileUrl(file.entityType, file.id, publicBaseUrl);
    }

    return {
      id: file.id,
      ownerId: file.ownerId,
      objectKey: isClean && file.publicKey ? file.publicKey : '',
      mimeType: file.declaredMimeType,
      status: this.toGrpcFileStatus(file.status),
      entityType: this.toGrpcEntityType(file.entityType),
      entityId: file.entityId ?? undefined,
      isPublic,
      uploadExpiresAt: GrpcDateMapper.toTimestamp(file.uploadExpiresAt),
      createdAt: GrpcDateMapper.toTimestamp(file.createdAt),
      updatedAt: GrpcDateMapper.toTimestamp(file.updatedAt),
      scanStatus: this.toGrpcScanStatus(file.scanStatus),
      rejectionReason: this.toGrpcRejectionReason(file.rejectionReason),
      publicUrl,
      validationMode: this.toGrpcValidationMode(file.validationMode),
    };
  }

  /**
   * Maps an array of FileEntity to ConfirmFileAttachmentResponseDTO.
   */
  static toConfirmFileAttachmentResponse(
    files: FileEntity[],
    publicBaseUrl?: string,
  ): ConfirmFileAttachmentResponseDTO {
    const response = new ConfirmFileAttachmentResponseDTO();
    response.success = true;
    response.updatedCount = files.length;
    response.files = files.map((file) => this.toFileMetadata(file, publicBaseUrl));
    return response;
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

  /**
   * Maps a FileEntity to ConfirmUploadResponseDTO.
   */
  static toConfirmUploadResponse(
    file: FileEntity,
    publicBaseUrl?: string,
  ): ConfirmUploadResponseDTO {
    const response = new ConfirmUploadResponseDTO();
    response.file = this.toFileMetadata(file, publicBaseUrl);
    return response;
  }
}

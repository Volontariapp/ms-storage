import type { AuthUser } from '@volontariapp/auth';
import { EntityType as GrpcEntityType } from '@volontariapp/contracts-nest';
import {
  FileEntity,
  EntityType as DomainEntityType,
  FileStatus,
  ScanStatus,
  ValidationMode,
} from '@volontariapp/domain-storage';
import type { PresignedPostResult } from '@volontariapp/storage-pipeline';
import { GenerateUploadUrlCommandDTO } from '../../../../modules/storage/dto/request/command/generate-upload-url.command.dto.js';

export function createTestAuthUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'test@volontariapp.com',
    role: 'USER',
    permissions: [],
    ...overrides,
  };
}

export function createTestGenerateUploadUrlCommand(
  overrides: Partial<GenerateUploadUrlCommandDTO> = {},
): GenerateUploadUrlCommandDTO {
  const dto = new GenerateUploadUrlCommandDTO();
  dto.mimeType = 'image/jpeg';
  dto.sizeBytes = 500 * 1024; // 500 KB
  dto.entityType = GrpcEntityType.ENTITY_TYPE_USER_AVATAR;
  dto.isPublic = true;
  Object.assign(dto, overrides);
  return dto;
}

export function createTestFileEntity(overrides: Partial<FileEntity> = {}): FileEntity {
  const file = new FileEntity();
  file.id = '22222222-2222-2222-2222-222222222222';
  file.ownerId = '11111111-1111-1111-1111-111111111111';
  file.entityType = DomainEntityType.USER_AVATAR;
  file.entityId = null;
  file.status = FileStatus.PENDING;
  file.scanStatus = ScanStatus.AWAITING_UPLOAD;
  file.rejectionReason = null;
  file.declaredMimeType = 'image/jpeg';
  file.declaredSize = 500 * 1024;
  file.actualSize = null;
  file.quarantineKey = `quarantine/${file.id}`;
  file.publicKey = null;
  file.scanAttempts = 0;
  file.rescanScheduledAt = null;
  file.validationMode = ValidationMode.SYNC;
  file.uploadExpiresAt = new Date(Date.now() + 900 * 1000 + 5 * 60 * 1000);
  file.confirmedAt = null;
  file.scannedAt = null;
  file.reservedAt = null;
  file.attachedAt = null;
  file.createdAt = new Date();
  file.updatedAt = new Date();
  Object.assign(file, overrides);
  return file;
}

export function createTestPresignedPostResult(
  overrides: Partial<PresignedPostResult> = {},
): PresignedPostResult {
  return {
    url: 'http://localhost:9000/volontariapp-private',
    fields: {
      key: 'quarantine/22222222-2222-2222-2222-222222222222',
      'Content-Type': 'image/jpeg',
      policy: 'test-policy-base64',
      'x-amz-signature': 'test-signature',
    },
    ...overrides,
  };
}

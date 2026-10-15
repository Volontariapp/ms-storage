import { describe, expect, it } from '@jest/globals';
import {
  EntityType as GrpcEntityType,
  FileStatus as GrpcFileStatus,
  ScanStatus as GrpcScanStatus,
  ValidationMode as GrpcValidationMode,
  RejectionReason as GrpcRejectionReason,
} from '@volontariapp/contracts-nest';
import {
  EntityType as DomainEntityType,
  FileStatus as DomainFileStatus,
  ScanStatus as DomainScanStatus,
  ValidationMode as DomainValidationMode,
  RejectionReason as DomainRejectionReason,
  InvalidEntityTypeException,
} from '@volontariapp/domain-storage';
import { StorageTransformer } from '../../../../modules/storage/transformers/storage.transformer.js';
import { createTestFileEntity, createTestPresignedPostResult } from './storage.factory.js';

describe('StorageTransformer (Unit)', () => {
  describe('toDomainEntityType', () => {
    it('should map ENTITY_TYPE_POST to POST', () => {
      expect(StorageTransformer.toDomainEntityType(GrpcEntityType.ENTITY_TYPE_POST)).toBe(
        DomainEntityType.POST,
      );
    });

    it('should map ENTITY_TYPE_USER_AVATAR to USER_AVATAR', () => {
      expect(StorageTransformer.toDomainEntityType(GrpcEntityType.ENTITY_TYPE_USER_AVATAR)).toBe(
        DomainEntityType.USER_AVATAR,
      );
    });

    it('should map ENTITY_TYPE_BADGE_ICON to BADGE_ICON', () => {
      expect(StorageTransformer.toDomainEntityType(GrpcEntityType.ENTITY_TYPE_BADGE_ICON)).toBe(
        DomainEntityType.BADGE_ICON,
      );
    });

    it('should map ENTITY_TYPE_EVENT_COVER to EVENT_COVER', () => {
      expect(StorageTransformer.toDomainEntityType(GrpcEntityType.ENTITY_TYPE_EVENT_COVER)).toBe(
        DomainEntityType.EVENT_COVER,
      );
    });

    it('should throw InvalidEntityTypeException for ENTITY_TYPE_UNSPECIFIED', () => {
      expect(() =>
        StorageTransformer.toDomainEntityType(GrpcEntityType.ENTITY_TYPE_UNSPECIFIED),
      ).toThrow(InvalidEntityTypeException);
    });

    it('should throw InvalidEntityTypeException for unrecognized enum values', () => {
      expect(() => StorageTransformer.toDomainEntityType(999 as GrpcEntityType)).toThrow(
        InvalidEntityTypeException,
      );
    });
  });

  describe('toGrpcEntityType', () => {
    it('should map domain entity types to gRPC entity types', () => {
      expect(StorageTransformer.toGrpcEntityType(DomainEntityType.POST)).toBe(
        GrpcEntityType.ENTITY_TYPE_POST,
      );
      expect(StorageTransformer.toGrpcEntityType(DomainEntityType.USER_AVATAR)).toBe(
        GrpcEntityType.ENTITY_TYPE_USER_AVATAR,
      );
      expect(StorageTransformer.toGrpcEntityType(DomainEntityType.BADGE_ICON)).toBe(
        GrpcEntityType.ENTITY_TYPE_BADGE_ICON,
      );
      expect(StorageTransformer.toGrpcEntityType(DomainEntityType.EVENT_COVER)).toBe(
        GrpcEntityType.ENTITY_TYPE_EVENT_COVER,
      );
    });
  });

  describe('toGrpcFileStatus', () => {
    it('should map all domain file statuses to gRPC file statuses', () => {
      expect(StorageTransformer.toGrpcFileStatus(DomainFileStatus.PENDING)).toBe(
        GrpcFileStatus.FILE_STATUS_PENDING,
      );
      expect(StorageTransformer.toGrpcFileStatus(DomainFileStatus.RESERVED)).toBe(
        GrpcFileStatus.FILE_STATUS_RESERVED,
      );
      expect(StorageTransformer.toGrpcFileStatus(DomainFileStatus.ATTACHED)).toBe(
        GrpcFileStatus.FILE_STATUS_ATTACHED,
      );
      expect(StorageTransformer.toGrpcFileStatus(DomainFileStatus.ORPHANED)).toBe(
        GrpcFileStatus.FILE_STATUS_ORPHANED,
      );
      expect(StorageTransformer.toGrpcFileStatus(DomainFileStatus.DELETED)).toBe(
        GrpcFileStatus.FILE_STATUS_DELETED,
      );
    });
  });

  describe('toGrpcScanStatus', () => {
    it('should map all domain scan statuses to gRPC scan statuses', () => {
      expect(StorageTransformer.toGrpcScanStatus(DomainScanStatus.AWAITING_UPLOAD)).toBe(
        GrpcScanStatus.SCAN_STATUS_AWAITING_UPLOAD,
      );
      expect(StorageTransformer.toGrpcScanStatus(DomainScanStatus.SCANNING)).toBe(
        GrpcScanStatus.SCAN_STATUS_SCANNING,
      );
      expect(StorageTransformer.toGrpcScanStatus(DomainScanStatus.CLEAN)).toBe(
        GrpcScanStatus.SCAN_STATUS_CLEAN,
      );
      expect(StorageTransformer.toGrpcScanStatus(DomainScanStatus.REJECTED)).toBe(
        GrpcScanStatus.SCAN_STATUS_REJECTED,
      );
    });
  });

  describe('toGrpcValidationMode', () => {
    it('should map domain validation modes to gRPC validation modes', () => {
      expect(StorageTransformer.toGrpcValidationMode(DomainValidationMode.SYNC)).toBe(
        GrpcValidationMode.VALIDATION_MODE_SYNC,
      );
      expect(StorageTransformer.toGrpcValidationMode(DomainValidationMode.ASYNC)).toBe(
        GrpcValidationMode.VALIDATION_MODE_ASYNC,
      );
    });
  });

  describe('toGrpcRejectionReason', () => {
    it('should return undefined when rejection reason is null', () => {
      expect(StorageTransformer.toGrpcRejectionReason(null)).toBeUndefined();
    });

    it('should map rejection reasons to gRPC rejection reasons', () => {
      expect(StorageTransformer.toGrpcRejectionReason(DomainRejectionReason.SIZE_MISMATCH)).toBe(
        GrpcRejectionReason.REJECTION_REASON_SIZE_MISMATCH,
      );
      expect(StorageTransformer.toGrpcRejectionReason(DomainRejectionReason.MIME_MISMATCH)).toBe(
        GrpcRejectionReason.REJECTION_REASON_MIME_MISMATCH,
      );
      expect(StorageTransformer.toGrpcRejectionReason(DomainRejectionReason.MALWARE)).toBe(
        GrpcRejectionReason.REJECTION_REASON_MALWARE,
      );
      expect(StorageTransformer.toGrpcRejectionReason(DomainRejectionReason.UNDECODABLE)).toBe(
        GrpcRejectionReason.REJECTION_REASON_UNDECODABLE,
      );
      expect(StorageTransformer.toGrpcRejectionReason(DomainRejectionReason.SCAN_TIMEOUT)).toBe(
        GrpcRejectionReason.REJECTION_REASON_SCAN_TIMEOUT,
      );
    });
  });

  describe('toFileMetadata', () => {
    it('should map a clean file with public key and publicBaseUrl', () => {
      const file = createTestFileEntity({
        id: '22222222-2222-4222-a222-222222222222',
        ownerId: '11111111-1111-4111-a111-111111111111',
        entityType: DomainEntityType.USER_AVATAR,
        entityId: '33333333-3333-4333-a333-333333333333',
        status: DomainFileStatus.RESERVED,
        scanStatus: DomainScanStatus.CLEAN,
        publicKey: 'user-avatar/22222222-2222-4222-a222-222222222222.webp',
        quarantineKey: 'quarantine/22222222-2222-4222-a222-222222222222',
        declaredMimeType: 'image/webp',
        validationMode: DomainValidationMode.SYNC,
      });

      const metadata = StorageTransformer.toFileMetadata(
        file,
        'http://localhost:9000/volontariapp-public',
      );

      expect(metadata.id).toBe(file.id);
      expect(metadata.ownerId).toBe(file.ownerId);
      expect(metadata.entityType).toBe(GrpcEntityType.ENTITY_TYPE_USER_AVATAR);
      expect(metadata.entityId).toBe('33333333-3333-4333-a333-333333333333');
      expect(metadata.status).toBe(GrpcFileStatus.FILE_STATUS_RESERVED);
      expect(metadata.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_CLEAN);
      expect(metadata.validationMode).toBe(GrpcValidationMode.VALIDATION_MODE_SYNC);
      expect(metadata.objectKey).toBe('user-avatar/22222222-2222-4222-a222-222222222222.webp');
      expect(metadata.isPublic).toBe(true);
      expect(metadata.publicUrl).toBe(
        'http://localhost:9000/volontariapp-public/user-avatar/22222222-2222-4222-a222-222222222222.webp',
      );
      expect(metadata.rejectionReason).toBeUndefined();
    });

    it('should NEVER expose quarantine key for a scanning or awaiting upload file', () => {
      const file = createTestFileEntity({
        id: '22222222-2222-4222-a222-222222222222',
        status: DomainFileStatus.PENDING,
        scanStatus: DomainScanStatus.SCANNING,
        publicKey: null,
        quarantineKey: 'quarantine/secret-internal-key',
      });

      const metadata = StorageTransformer.toFileMetadata(
        file,
        'http://localhost:9000/volontariapp-public',
      );

      expect(metadata.objectKey).toBe('');
      expect(metadata.isPublic).toBe(false);
      expect(metadata.publicUrl).toBeUndefined();
      expect(metadata.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_SCANNING);
    });

    it('should map rejection reason when present', () => {
      const file = createTestFileEntity({
        status: DomainFileStatus.PENDING,
        scanStatus: DomainScanStatus.REJECTED,
        rejectionReason: DomainRejectionReason.MALWARE,
      });

      const metadata = StorageTransformer.toFileMetadata(file);

      expect(metadata.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_REJECTED);
      expect(metadata.rejectionReason).toBe(GrpcRejectionReason.REJECTION_REASON_MALWARE);
    });
  });

  describe('toConfirmFileAttachmentResponse', () => {
    it('should map an array of files into ConfirmFileAttachmentResponseDTO', () => {
      const file1 = createTestFileEntity({
        id: '22222222-2222-4222-a222-222222222222',
        status: DomainFileStatus.RESERVED,
        scanStatus: DomainScanStatus.CLEAN,
      });
      const file2 = createTestFileEntity({
        id: '33333333-3333-4333-a333-333333333333',
        status: DomainFileStatus.RESERVED,
        scanStatus: DomainScanStatus.SCANNING,
      });

      const response = StorageTransformer.toConfirmFileAttachmentResponse(
        [file1, file2],
        'http://localhost:9000/volontariapp-public',
      );

      expect(response.success).toBe(true);
      expect(response.updatedCount).toBe(2);
      expect(response.files.length).toBe(2);
      expect(response.files[0]?.id).toBe(file1.id);
      expect(response.files[1]?.id).toBe(file2.id);
    });
  });

  describe('toGenerateUploadUrlResponse', () => {
    it('should transform FileEntity and PresignedPostResult into GenerateUploadUrlResponseDTO', () => {
      const expiryDate = new Date('2026-10-15T18:00:00.000Z');
      const file = createTestFileEntity({
        id: 'file-xyz-789',
        uploadExpiresAt: expiryDate,
      });

      const presignedResult = createTestPresignedPostResult({
        url: 'http://localhost:9000/volontariapp-private',
        fields: {
          key: 'quarantine/file-xyz-789',
          'Content-Type': 'image/jpeg',
        },
      });

      const response = StorageTransformer.toGenerateUploadUrlResponse(file, presignedResult);

      expect(response.fileId).toBe('file-xyz-789');
      expect(response.uploadUrl).toBe('http://localhost:9000/volontariapp-private');
      expect(response.uploadFields).toEqual({
        key: 'quarantine/file-xyz-789',
        'Content-Type': 'image/jpeg',
      });
      expect(response.expiresAt).toEqual({
        seconds: Math.floor(expiryDate.getTime() / 1000),
        nanos: 0,
      });
    });
  });

  describe('toConfirmUploadResponse', () => {
    it('should transform FileEntity into ConfirmUploadResponseDTO', () => {
      const file = createTestFileEntity({
        id: 'file-async-123',
        scanStatus: DomainScanStatus.SCANNING,
        status: DomainFileStatus.PENDING,
        validationMode: DomainValidationMode.ASYNC,
      });

      const response = StorageTransformer.toConfirmUploadResponse(
        file,
        'http://localhost:9000/volontariapp-public',
      );

      expect(response.file).toBeDefined();
      expect(response.file?.id).toBe('file-async-123');
      expect(response.file?.scanStatus).toBe(GrpcScanStatus.SCAN_STATUS_SCANNING);
      expect(response.file?.status).toBe(GrpcFileStatus.FILE_STATUS_PENDING);
      expect(response.file?.validationMode).toBe(GrpcValidationMode.VALIDATION_MODE_ASYNC);
      expect(response.file?.objectKey).toBe('');
    });
  });
});

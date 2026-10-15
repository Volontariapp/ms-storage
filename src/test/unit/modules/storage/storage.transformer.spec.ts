import { describe, expect, it } from '@jest/globals';
import { EntityType as GrpcEntityType } from '@volontariapp/contracts-nest';
import {
  EntityType as DomainEntityType,
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
});

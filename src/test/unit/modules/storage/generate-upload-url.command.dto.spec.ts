import { describe, expect, it } from '@jest/globals';
import { validate } from 'class-validator';
import { EntityType } from '@volontariapp/contracts-nest';
import { GenerateUploadUrlCommandDTO } from '../../../../modules/storage/dto/request/command/generate-upload-url.command.dto.js';

describe('GenerateUploadUrlCommandDTO (Unit)', () => {
  it('should validate successfully for a valid DTO', async () => {
    const dto = new GenerateUploadUrlCommandDTO();
    dto.mimeType = 'image/jpeg';
    dto.sizeBytes = 1024 * 1024;
    dto.entityType = EntityType.ENTITY_TYPE_POST;
    dto.isPublic = true;

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when mimeType is empty', async () => {
    const dto = new GenerateUploadUrlCommandDTO();
    dto.mimeType = '';
    dto.sizeBytes = 1024 * 1024;
    dto.entityType = EntityType.ENTITY_TYPE_POST;
    dto.isPublic = true;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'mimeType')).toBe(true);
  });

  it('should fail validation when sizeBytes is zero or negative', async () => {
    const dto = new GenerateUploadUrlCommandDTO();
    dto.mimeType = 'image/jpeg';
    dto.sizeBytes = 0;
    dto.entityType = EntityType.ENTITY_TYPE_POST;
    dto.isPublic = true;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'sizeBytes')).toBe(true);
  });

  it('should fail validation when entityType is not a valid enum value', async () => {
    const dto = new GenerateUploadUrlCommandDTO();
    dto.mimeType = 'image/jpeg';
    dto.sizeBytes = 1024;
    dto.entityType = 999 as EntityType;
    dto.isPublic = true;

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'entityType')).toBe(true);
  });

  it('should fail validation when isPublic is not a boolean', async () => {
    const dto = new GenerateUploadUrlCommandDTO();
    dto.mimeType = 'image/jpeg';
    dto.sizeBytes = 1024;
    dto.entityType = EntityType.ENTITY_TYPE_POST;
    // @ts-expect-error test invalid type
    dto.isPublic = 'not-a-boolean';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'isPublic')).toBe(true);
  });
});

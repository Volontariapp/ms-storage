import { describe, expect, it } from '@jest/globals';
import { validate } from 'class-validator';
import { EntityType } from '@volontariapp/contracts-nest';
import { ConfirmFileAttachmentCommandDTO } from '../../../../modules/storage/dto/request/command/confirm-file-attachment.command.dto.js';

describe('ConfirmFileAttachmentCommandDTO (Unit)', () => {
  it('should validate successfully for a valid DTO with multiple UUID fileIds', async () => {
    const dto = new ConfirmFileAttachmentCommandDTO();
    dto.fileIds = ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22'];
    dto.entityType = EntityType.ENTITY_TYPE_POST;
    dto.entityId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should validate successfully for an empty fileIds array', async () => {
    const dto = new ConfirmFileAttachmentCommandDTO();
    dto.fileIds = [];
    dto.entityType = EntityType.ENTITY_TYPE_POST;
    dto.entityId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when fileIds contains non-UUID strings', async () => {
    const dto = new ConfirmFileAttachmentCommandDTO();
    dto.fileIds = ['invalid-uuid-1', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'];
    dto.entityType = EntityType.ENTITY_TYPE_POST;
    dto.entityId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'fileIds')).toBe(true);
  });

  it('should fail validation when fileIds is not an array', async () => {
    const dto = new ConfirmFileAttachmentCommandDTO();
    // @ts-expect-error test invalid type
    dto.fileIds = 'not-an-array';
    dto.entityType = EntityType.ENTITY_TYPE_POST;
    dto.entityId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'fileIds')).toBe(true);
  });

  it('should fail validation when entityType is not a valid enum value', async () => {
    const dto = new ConfirmFileAttachmentCommandDTO();
    dto.fileIds = ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'];
    dto.entityType = 999 as EntityType;
    dto.entityId = 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'entityType')).toBe(true);
  });

  it('should fail validation when entityId is not a valid UUID', async () => {
    const dto = new ConfirmFileAttachmentCommandDTO();
    dto.fileIds = ['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'];
    dto.entityType = EntityType.ENTITY_TYPE_POST;
    dto.entityId = 'not-a-uuid';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.property === 'entityId')).toBe(true);
  });
});

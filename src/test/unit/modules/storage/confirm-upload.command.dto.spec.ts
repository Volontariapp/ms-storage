import { validate } from 'class-validator';
import { describe, expect, it } from '@jest/globals';
import { ConfirmUploadCommandDTO } from '../../../../modules/storage/dto/request/command/confirm-upload.command.dto.js';

describe('ConfirmUploadCommandDTO (Unit)', () => {
  it('should validate a correct command with a valid UUID', async () => {
    const dto = new ConfirmUploadCommandDTO();
    dto.fileId = '22222222-2222-4222-a222-222222222222';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when fileId is not a valid UUID', async () => {
    const dto = new ConfirmUploadCommandDTO();
    dto.fileId = 'not-a-uuid';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('fileId');
  });

  it('should fail when fileId is empty or missing', async () => {
    const dto = new ConfirmUploadCommandDTO();

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('fileId');
  });
});

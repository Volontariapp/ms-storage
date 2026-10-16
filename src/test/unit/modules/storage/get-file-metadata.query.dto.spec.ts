import { validate } from 'class-validator';
import { describe, expect, it } from '@jest/globals';
import { GetFileMetadataQueryDTO } from '../../../../modules/storage/dto/request/query/get-file-metadata.query.dto.js';

describe('GetFileMetadataQueryDTO (Unit)', () => {
  it('should validate a correct query with a valid UUID', async () => {
    const dto = new GetFileMetadataQueryDTO();
    dto.fileId = '22222222-2222-4222-a222-222222222222';

    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('should fail when fileId is not a valid UUID', async () => {
    const dto = new GetFileMetadataQueryDTO();
    dto.fileId = 'not-a-uuid';

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('fileId');
  });

  it('should fail when fileId is empty or missing', async () => {
    const dto = new GetFileMetadataQueryDTO();

    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]?.property).toBe('fileId');
  });
});

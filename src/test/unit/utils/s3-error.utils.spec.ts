import { describe, it, expect } from '@jest/globals';
import { NotFound, S3ServiceException } from '@aws-sdk/client-s3';
import { isNotFoundError } from '../../../providers/s3/utils/s3-error.utils.js';

describe('s3-error.utils (Unit)', () => {
  it('should return true for NotFound instance', () => {
    const error = new NotFound({ $metadata: { httpStatusCode: 404 }, message: 'NotFound' });
    expect(isNotFoundError(error)).toBe(true);
  });

  it('should return true for S3ServiceException with name NotFound or NoSuchKey', () => {
    const error1 = new S3ServiceException({
      name: 'NotFound',
      $metadata: { httpStatusCode: 404 },
      message: 'Not found',
    });
    const error2 = new S3ServiceException({
      name: 'NoSuchKey',
      $metadata: { httpStatusCode: 404 },
      message: 'No such key',
    });
    expect(isNotFoundError(error1)).toBe(true);
    expect(isNotFoundError(error2)).toBe(true);
  });

  it('should return true for plain object matching S3 error structure', () => {
    const plainErr = { name: 'NoSuchKey' };
    const plainMetaErr = { $metadata: { httpStatusCode: 404 } };
    expect(isNotFoundError(plainErr)).toBe(true);
    expect(isNotFoundError(plainMetaErr)).toBe(true);
  });

  it('should return false for non-404 errors or non-object values', () => {
    expect(isNotFoundError(new Error('Internal Error'))).toBe(false);
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError(undefined)).toBe(false);
    expect(isNotFoundError('random string')).toBe(false);
  });
});

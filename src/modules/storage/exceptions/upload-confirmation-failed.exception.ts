import { BaseApiError, GrpcStatus } from '@volontariapp/errors';

export class UploadConfirmationFailedException extends BaseApiError {
  public readonly statusCode = 422;
  public readonly grpcCode = GrpcStatus.FAILED_PRECONDITION;

  constructor(fileId: string, reason: string, details?: Record<string, unknown>) {
    super(
      `Upload confirmation failed for file '${fileId}': ${reason}.`,
      'UPLOAD_CONFIRMATION_FAILED',
      { fileId, reason, ...details },
    );
  }
}

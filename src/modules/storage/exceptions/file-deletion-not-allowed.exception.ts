import { BaseApiError, GrpcStatus } from '@volontariapp/errors';

export class FileDeletionNotAllowedException extends BaseApiError {
  public readonly statusCode = 422;
  public readonly grpcCode = GrpcStatus.FAILED_PRECONDITION;

  constructor(fileId: string, currentStatus: string) {
    super(
      `Cannot delete file '${fileId}' with status '${currentStatus}'. Only PENDING files can be deleted directly. Attached or reserved files are released via lifecycle events.`,
      'FILE_DELETION_NOT_ALLOWED',
      { fileId, currentStatus },
    );
  }
}

import { NotFound, S3ServiceException } from '@aws-sdk/client-s3';

interface S3LikeError {
  name?: string;
  $metadata?: { httpStatusCode?: number };
}

function isS3LikeError(error: unknown): error is S3LikeError {
  return typeof error === 'object' && error !== null;
}

/**
 * Prédicat Type Guard vérifiant si une erreur S3 correspond à une ressource non trouvée (404 / NotFound / NoSuchKey).
 */
export function isNotFoundError(error: unknown): boolean {
  if (error instanceof NotFound) {
    return true;
  }
  if (error instanceof S3ServiceException) {
    return (
      error.name === 'NotFound' ||
      error.name === 'NoSuchKey' ||
      error.$metadata?.httpStatusCode === 404
    );
  }
  if (isS3LikeError(error)) {
    return (
      error.name === 'NotFound' ||
      error.name === 'NoSuchKey' ||
      error.$metadata?.httpStatusCode === 404
    );
  }
  return false;
}

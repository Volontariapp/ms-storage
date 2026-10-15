import type { ConfirmUploadResponse, FileMetadata } from '@volontariapp/contracts-nest';

export class ConfirmUploadResponseDTO implements ConfirmUploadResponse {
  file: FileMetadata | undefined;
}

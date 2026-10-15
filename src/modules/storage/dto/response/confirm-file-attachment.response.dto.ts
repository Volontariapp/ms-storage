import type { ConfirmFileAttachmentResponse, FileMetadata } from '@volontariapp/contracts-nest';

export class ConfirmFileAttachmentResponseDTO implements ConfirmFileAttachmentResponse {
  success!: boolean;
  updatedCount!: number;
  files!: FileMetadata[];
}

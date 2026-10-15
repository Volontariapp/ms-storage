import type { GenerateUploadUrlResponse, Timestamp } from '@volontariapp/contracts-nest';

export class GenerateUploadUrlResponseDTO implements GenerateUploadUrlResponse {
  fileId!: string;
  uploadUrl!: string;
  expiresAt: Timestamp | undefined;
  uploadFields!: { [key: string]: string };
}

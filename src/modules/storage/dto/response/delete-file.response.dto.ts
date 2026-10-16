import type { DeleteFileResponse } from '@volontariapp/contracts-nest';

export class DeleteFileResponseDTO implements DeleteFileResponse {
  success!: boolean;
}

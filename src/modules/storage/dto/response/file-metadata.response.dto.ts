import type { FileMetadata, FileMetadataResponse } from '@volontariapp/contracts-nest';

export class FileMetadataResponseDTO implements FileMetadataResponse {
  file: FileMetadata | undefined;
}

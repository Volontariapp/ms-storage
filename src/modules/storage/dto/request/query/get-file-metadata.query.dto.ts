import { IsUUID } from 'class-validator';
import type { GetFileMetadataQuery } from '@volontariapp/contracts-nest';

export class GetFileMetadataQueryDTO implements GetFileMetadataQuery {
  @IsUUID('all', { message: 'fileId must be a valid UUID' })
  fileId!: string;
}

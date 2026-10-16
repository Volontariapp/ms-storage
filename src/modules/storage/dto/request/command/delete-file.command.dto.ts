import { IsUUID } from 'class-validator';
import type { DeleteFileCommand } from '@volontariapp/contracts-nest';

export class DeleteFileCommandDTO implements DeleteFileCommand {
  @IsUUID('all', { message: 'fileId must be a valid UUID' })
  fileId!: string;
}

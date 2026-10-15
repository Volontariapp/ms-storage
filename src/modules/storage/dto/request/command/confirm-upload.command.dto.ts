import { IsUUID } from 'class-validator';
import type { ConfirmUploadCommand } from '@volontariapp/contracts-nest';

export class ConfirmUploadCommandDTO implements ConfirmUploadCommand {
  @IsUUID('all', { message: 'fileId must be a valid UUID' })
  fileId!: string;
}

import { IsArray, IsEnum, IsUUID } from 'class-validator';
import { type ConfirmFileAttachmentCommand, EntityType } from '@volontariapp/contracts-nest';

export class ConfirmFileAttachmentCommandDTO implements ConfirmFileAttachmentCommand {
  @IsArray()
  @IsUUID('all', { each: true })
  fileIds!: string[];

  @IsEnum(EntityType)
  entityType!: EntityType;

  @IsUUID('all')
  entityId!: string;
}

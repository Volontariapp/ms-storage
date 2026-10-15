import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { type GenerateUploadUrlCommand, EntityType } from '@volontariapp/contracts-nest';

export class GenerateUploadUrlCommandDTO implements GenerateUploadUrlCommand {
  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNumber()
  @Min(1)
  sizeBytes!: number;

  @IsEnum(EntityType)
  entityType!: EntityType;

  @IsBoolean()
  isPublic!: boolean;
}

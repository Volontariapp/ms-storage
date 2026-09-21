import { IsBoolean, IsDefined, IsNumber, IsString } from 'class-validator';

export class S3Config {
  @IsDefined()
  @IsString()
  endpoint!: string;

  @IsDefined()
  @IsString()
  region!: string;

  @IsDefined()
  @IsString()
  accessKey!: string;

  @IsDefined()
  @IsString()
  secretKey!: string;

  @IsDefined()
  @IsString()
  publicBucket!: string;

  @IsDefined()
  @IsNumber()
  presignedUrlTtl!: number;

  @IsDefined()
  @IsBoolean()
  usePathStyle!: boolean;
}

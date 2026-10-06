import { IsBoolean, IsDefined, IsNotEmpty, IsNumber, IsString } from 'class-validator';

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
  @IsString()
  @IsNotEmpty()
  privateBucket!: string;

  /** Endpoint joignable par le client mobile, utilise uniquement pour signer. */
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  publicEndpoint!: string;

  /** Base des URL publiques des fichiers (CDN ou endpoint public). */
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  publicBaseUrl!: string;

  @IsDefined()
  @IsNumber()
  presignedUrlTtl!: number;

  @IsDefined()
  @IsBoolean()
  usePathStyle!: boolean;
}

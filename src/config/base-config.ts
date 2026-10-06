import { Type } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { BackendConfig, MSURLsConfig, PostgresConfig } from '@volontariapp/config';
import { S3Config } from './s3-config.js';

export class ExtendedMSURLsConfig extends MSURLsConfig {
  @IsDefined()
  @IsString()
  @IsNotEmpty()
  msStorageUrl!: string;
}

export class CustomConfig extends BackendConfig {
  @IsDefined()
  @ValidateNested()
  @Type(() => ExtendedMSURLsConfig)
  declare microServices: ExtendedMSURLsConfig;

  @IsDefined()
  @ValidateNested()
  @Type(() => PostgresConfig)
  db!: PostgresConfig;

  @IsDefined()
  @ValidateNested()
  @Type(() => S3Config)
  s3!: S3Config;
}

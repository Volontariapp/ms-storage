import { Type } from 'class-transformer';
import { IsDefined, ValidateNested } from 'class-validator';
import { BackendConfig, PostgresConfig } from '@volontariapp/config';
import { S3Config } from './s3-config.js';

export class CustomConfig extends BackendConfig {
  @IsDefined()
  @ValidateNested()
  @Type(() => PostgresConfig)
  db!: PostgresConfig;

  @IsDefined()
  @ValidateNested()
  @Type(() => S3Config)
  s3!: S3Config;
}

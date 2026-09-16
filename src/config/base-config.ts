import { Type } from 'class-transformer';
import { IsDefined, ValidateNested } from 'class-validator';
import { BaseConfig, PostgresConfig } from '@volontariapp/config';

export class CustomConfig extends BaseConfig {
  @IsDefined()
  @ValidateNested()
  @Type(() => PostgresConfig)
  db!: PostgresConfig;
}

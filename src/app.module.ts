import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { GlobalExceptionFilter } from '@volontariapp/errors-nest';
import { GrpcValidationPipe } from '@volontariapp/validation-nest';
import { HealthModule } from '@volontariapp/health-check-nest';
import { TerminusModule } from '@nestjs/terminus';
import { AuthModule, GrpcInternalGuard } from '@volontariapp/auth';
import { EntityType } from '@volontariapp/contracts-nest';
import { AppConfigModule } from './config/app-config.module.js';
import type { CustomConfig } from './config/base-config.js';
import { DatabaseModule } from './providers/database/database.module.js';
import { S3Module } from './providers/s3/s3.module.js';
import { StorageModule } from './modules/storage/storage.module.js';

@Module({
  imports: [DatabaseModule],
})
export class AppModule {
  static register(config: CustomConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        AppConfigModule.forRoot(config),
        DatabaseModule.forRoot(config.db),
        S3Module,
        StorageModule,
        AuthModule.registerMicroservice(config.auth),
        TerminusModule.forRoot({}),
        HealthModule.register({
          databases: ['postgres'],
          failOnMissingProvider: true,
        }),
      ],
      providers: [
        {
          provide: APP_FILTER,
          useClass: GlobalExceptionFilter,
        },
        {
          provide: APP_PIPE,
          useFactory: (): GrpcValidationPipe =>
            new GrpcValidationPipe({
              enumMaps: {
                entityType: EntityType,
              },
            }),
        },
        {
          provide: APP_GUARD,
          useClass: GrpcInternalGuard,
        },
      ],
    };
  }
}

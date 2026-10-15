import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  FileModel,
  PostgresFileRepository,
  ReleasedEntityModel,
} from '@volontariapp/domain-storage';
import { PresignedPostSigner, type S3StorageConfig } from '@volontariapp/storage-pipeline';
import { AppConfigService } from '../../config/app-config.service.js';
import { StorageCommandController } from './controllers/commands/storage.command.controller.js';
import { StorageService } from './services/storage.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([FileModel, ReleasedEntityModel])],
  controllers: [StorageCommandController],
  providers: [
    PostgresFileRepository,
    StorageService,
    {
      provide: PresignedPostSigner,
      inject: [AppConfigService],
      useFactory: (appConfig: AppConfigService): PresignedPostSigner => {
        const s3 = appConfig.s3;
        const config: S3StorageConfig = {
          endpoint: s3.endpoint,
          publicEndpoint: s3.publicEndpoint,
          region: s3.region,
          accessKeyId: s3.accessKey,
          secretAccessKey: s3.secretKey,
          privateBucket: s3.privateBucket,
          publicBucket: s3.publicBucket,
          publicBaseUrl: s3.publicBaseUrl,
          forcePathStyle: s3.usePathStyle,
        };
        return new PresignedPostSigner(config);
      },
    },
  ],
  exports: [StorageService, PostgresFileRepository, PresignedPostSigner],
})
export class StorageModule {}

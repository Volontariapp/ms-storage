import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileModel, ReleasedEntityModel } from '@volontariapp/domain-storage/models';
import { PostgresFileRepository } from '@volontariapp/domain-storage/repositories';
import { S3Module } from '../../providers/s3/s3.module.js';
import { StorageCommandController } from './controllers/commands/storage.command.controller.js';
import { StorageService } from './services/storage.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([FileModel, ReleasedEntityModel]), S3Module],
  controllers: [StorageCommandController],
  providers: [PostgresFileRepository, StorageService],
  exports: [StorageService, PostgresFileRepository],
})
export class StorageModule {}

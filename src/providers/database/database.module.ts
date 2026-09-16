import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PostgresBridgeModule } from '@volontariapp/bridge-nest';
import type { PostgresConfig } from '@volontariapp/config';

const entities: never[] = [];

@Module({})
export class DatabaseModule {
  static forRoot(dbConfig: PostgresConfig): DynamicModule {
    return {
      module: DatabaseModule,
      imports: [
        PostgresBridgeModule.register({
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
          entities,
          synchronize: false,
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: dbConfig.host,
          port: dbConfig.port,
          username: dbConfig.username,
          password: dbConfig.password,
          database: dbConfig.database,
          ssl: dbConfig.ssl ? { rejectUnauthorized: false } : false,
          entities,
          synchronize: false, // Run migrations
        }),
        TypeOrmModule.forFeature(entities),
      ],
      exports: [TypeOrmModule],
      global: true,
    };
  }
}

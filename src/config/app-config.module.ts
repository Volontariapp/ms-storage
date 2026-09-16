import { DynamicModule, Global, Module } from '@nestjs/common';
import { APP_CONFIG } from './app-config.constants.js';
import { AppConfigService } from './app-config.service.js';
import type { CustomConfig } from './base-config.js';

@Global()
@Module({
  providers: [],
  exports: [],
})
export class AppConfigModule {
  static forRoot(config: CustomConfig): DynamicModule {
    return {
      module: AppConfigModule,
      providers: [
        {
          provide: APP_CONFIG,
          useValue: config,
        },
        {
          provide: AppConfigService,
          useFactory: (appConfig: CustomConfig) => new AppConfigService(appConfig),
          inject: [APP_CONFIG],
        },
      ],
      exports: [APP_CONFIG, AppConfigService],
      global: true,
    };
  }
}

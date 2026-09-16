import type { CustomConfig } from './base-config.js';

export class AppConfigService {
  constructor(public readonly config: CustomConfig) {}

  get loggerLevel() {
    return this.config.logger.level;
  }

  get loggerFormat() {
    return this.config.logger.format;
  }
}

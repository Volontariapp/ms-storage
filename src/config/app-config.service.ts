import type { CustomConfig } from './base-config.js';

export class AppConfigService {
  constructor(public readonly config: CustomConfig) {}

  get s3() {
    return this.config.s3;
  }

  get db() {
    return this.config.db;
  }

  get loggerLevel() {
    return this.config.logger.level;
  }

  get loggerFormat() {
    return this.config.logger.format;
  }

  get port() {
    return this.config.port;
  }

  get auth() {
    return this.config.auth;
  }

  get microServices() {
    return this.config.microServices;
  }
}

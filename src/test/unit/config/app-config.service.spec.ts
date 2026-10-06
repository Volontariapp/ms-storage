import { describe, it, expect } from '@jest/globals';
import { AppConfigService } from '../../../config/app-config.service.js';
import type { CustomConfig } from '../../../config/base-config.js';

describe('AppConfigService', () => {
  it('should expose s3, db, logger, port, auth, and microServices getters correctly', () => {
    const rawConfig: Partial<CustomConfig> = {
      port: 3006,
      logger: {
        level: 'info',
        format: 'text',
      },
      db: {
        host: 'localhost',
        port: 5437,
        username: 'user',
        password: 'password',
        database: 'ms_storage',
        maxPoolSize: 10,
        ssl: false,
      },
      s3: {
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        accessKey: 'minioadmin',
        secretKey: 'minioadmin',
        publicBucket: 'volontariapp-files',
        privateBucket: 'volontariapp-private',
        publicEndpoint: 'http://192.168.1.10:9000',
        publicBaseUrl: 'http://192.168.1.10:9000/volontariapp-files',
        presignedUrlTtl: 900,
        usePathStyle: true,
      },
      scanner: {
        host: 'localhost',
        port: 3310,
        timeoutMs: 5000,
      },
      auth: {
        internalPublicKeyPath: 'certs/internal.pub',
      },
      microServices: {
        msUserUrl: 'localhost:5001',
        msPostUrl: 'localhost:5002',
        msEventUrl: 'localhost:5003',
        msSocialUrl: 'localhost:5004',
        msWsUrl: 'localhost:5005',
        msStorageUrl: '0.0.0.0:5006',
      },
    };

    const service = new AppConfigService(rawConfig as CustomConfig);

    expect(service.port).toBe(3006);
    expect(service.loggerLevel).toBe('info');
    expect(service.loggerFormat).toBe('text');
    expect(service.db.host).toBe('localhost');
    expect(service.s3.endpoint).toBe('http://localhost:9000');
    expect(service.s3.publicBucket).toBe('volontariapp-files');
    expect(service.s3.privateBucket).toBe('volontariapp-private');
    expect(service.s3.publicEndpoint).toBe('http://192.168.1.10:9000');
    expect(service.s3.publicBaseUrl).toBe('http://192.168.1.10:9000/volontariapp-files');
    expect(service.scanner.host).toBe('localhost');
    expect(service.scanner.port).toBe(3310);
    expect(service.scanner.timeoutMs).toBe(5000);
    expect(service.auth.internalPublicKeyPath).toBe('certs/internal.pub');
    expect(service.microServices.msUserUrl).toBe('localhost:5001');
    expect(service.microServices.msStorageUrl).toBe('0.0.0.0:5006');
  });
});

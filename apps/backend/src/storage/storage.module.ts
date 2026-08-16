import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../common/logging/app-logger.service';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage.contract';
import { LocalObjectStorageAdapter } from './local-object-storage.adapter';
import type { StorageConfig } from '../config/configuration';

/**
 * Object storage wiring (TASK_QUEUE BACKEND-022).
 *
 * Only the local pilot driver exists so far. Selecting `s3` fails loudly at
 * startup rather than silently falling back to local files — a pilot that
 * believes it is writing to a bucket while writing to a container's disk would
 * lose recordings on the next deploy.
 */
@Global()
@Module({
  providers: [
    LocalObjectStorageAdapter,
    {
      provide: OBJECT_STORAGE,
      useFactory: (
        config: ConfigService,
        local: LocalObjectStorageAdapter,
        logger: AppLogger,
      ): ObjectStorage => {
        const storage = config.get<StorageConfig>('app.storage');

        if (storage?.driver === 's3') {
          throw new Error(
            'OBJECT_STORAGE_DRIVER=s3 is not implemented yet: no bucket is provisioned ' +
              '(DEVOPS-004). Use the local driver or complete the S3 adapter first.',
          );
        }

        logger.child('StorageModule').info({
          message: 'Object storage driver selected',
          driver: local.name,
        });

        return local;
      },
      inject: [ConfigService, LocalObjectStorageAdapter, AppLogger],
    },
  ],
  exports: [OBJECT_STORAGE],
})
export class StorageModule {}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { NotFoundAppException } from '../common/errors/app.exception';
import { AppLogger } from '../common/logging/app-logger.service';
import type { ObjectStorage, StoredObject, UploadOptions } from './object-storage.contract';
import type { StorageConfig } from '../config/configuration';

/**
 * Pilot object storage backed by a local directory.
 *
 * No S3-compatible bucket is provisioned yet (DEVOPS-004). Rather than pretend
 * one exists, the pilot writes to disk behind the same interface; swapping in
 * an S3 adapter later is a module wiring change.
 *
 * Limitation to be aware of: files written here do not survive a container
 * rebuild on Railway. That is acceptable for pilot test recordings and is why
 * DEVOPS-004 remains open.
 */
@Injectable()
export class LocalObjectStorageAdapter implements ObjectStorage {
  readonly name = 'LocalObjectStorage';

  private readonly rootDir: string;
  private readonly logger: AppLogger;

  constructor(config: ConfigService, logger: AppLogger) {
    const storage = config.get<StorageConfig>('app.storage');
    this.rootDir = resolve(storage?.localDir ?? '.storage');
    this.logger = logger.child(LocalObjectStorageAdapter.name);
  }

  async upload(key: string, body: Buffer, options: UploadOptions): Promise<StoredObject> {
    const path = this.pathFor(key);

    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);

    const checksum = createHash('sha256').update(body).digest('hex');

    this.logger.debug({
      message: 'Object stored',
      key,
      size: body.byteLength,
      mimeType: options.mimeType,
    });

    return { key, size: body.byteLength, checksum };
  }

  async createReadStream(key: string): Promise<Readable> {
    const path = this.pathFor(key);
    await this.assertExists(path, key);
    return createReadStream(path);
  }

  async getSize(key: string): Promise<number> {
    const path = this.pathFor(key);
    const stats = await this.assertExists(path, key);
    return stats.size;
  }

  /** This adapter cannot sign; the caller serves the object itself. */
  getSignedUrl(): Promise<string | null> {
    return Promise.resolve(null);
  }

  /**
   * Resolves a key inside the storage root.
   *
   * Keys are backend-generated, but the traversal check stays: a key that ever
   * became attacker-influenced must not be able to read outside the root.
   */
  private pathFor(key: string): string {
    const path = resolve(join(this.rootDir, key));

    if (path !== this.rootDir && !path.startsWith(this.rootDir + sep)) {
      throw new NotFoundAppException('Object not found.');
    }

    return path;
  }

  private async assertExists(path: string, key: string) {
    try {
      return await stat(path);
    } catch {
      this.logger.warn({ message: 'Object not found in storage', key });
      throw new NotFoundAppException('Object not found.');
    }
  }
}

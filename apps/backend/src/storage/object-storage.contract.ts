import type { Readable } from 'node:stream';

/**
 * Object storage boundary (TASK_QUEUE BACKEND-022).
 *
 * Audio binaries live here, never in PostgreSQL (CLAUDE.md section 20). The
 * interface is deliberately small so the implementation can be swapped —
 * a local directory for the pilot, an S3-compatible bucket once one is
 * provisioned (DEVOPS-004) — without touching the dictation domain.
 *
 * There is no delete: removing a clinical recording is not part of the normal
 * workflow, so the capability is simply absent rather than merely unused.
 */
export interface StoredObject {
  key: string;
  size: number;
  /** SHA-256 of the stored bytes. */
  checksum: string;
}

export interface UploadOptions {
  mimeType: string;
}

export interface ObjectStorage {
  /** Identifies the adapter in logs and health output. */
  readonly name: string;

  upload(key: string, body: Buffer, options: UploadOptions): Promise<StoredObject>;

  /** Streams an object back. Throws when the key does not exist. */
  createReadStream(key: string): Promise<Readable>;

  /** Byte size of a stored object, used for range-free playback responses. */
  getSize(key: string): Promise<number>;

  /**
   * A storage-native time-limited URL, when the backend supports one.
   *
   * Returns null for adapters that cannot sign (the local pilot adapter), and
   * the caller then serves the object through its own short-lived token.
   */
  getSignedUrl(key: string, ttlSeconds: number): Promise<string | null>;
}

export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

/**
 * Storage abstraction so controllers never touch the filesystem directly and
 * so local storage can be swapped for S3 later without changing call sites.
 *
 * Keys are opaque, internally-generated identifiers (never user filenames or
 * paths). Implementations MUST reject keys that could escape their root.
 */
export interface StorageProvider {
  /** Persist bytes under `key`. */
  save(key: string, data: Buffer): Promise<void>;
  /** Read bytes for `key`. Throws if not found. */
  read(key: string): Promise<Buffer>;
  /** Delete `key` if present. Idempotent: never throws if absent. */
  delete(key: string): Promise<void>;
  /** Whether `key` currently exists. */
  exists(key: string): Promise<boolean>;
}

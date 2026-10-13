/**
 * Google Cloud Storage implementation of the StorageProvider interface.
 *
 * Keeps the EXACT same 4-method contract (save/read/delete/exists) and the same
 * opaque key scheme (job_<hex>_<role>.<ext>) as LocalStorageProvider, so no
 * call site in jobService changes. Objects are stored PRIVATELY — the bucket
 * must have uniform bucket-level access with no public IAM; downloads are
 * served by the authenticated backend (streamed through readOutput), never via
 * public object URLs.
 *
 * The @google-cloud/storage client is loaded via dynamic import so local
 * dev/tests (which use LocalStorageProvider) never need the dependency.
 */
import type { StorageProvider } from './StorageProvider.js';

// Same defensive key rule the local provider enforces: keys are internal ids,
// never user input, but validate anyway to prevent surprises.
const SAFE_KEY = /^[A-Za-z0-9._-]+$/;

type GcsFile = {
  save: (data: Buffer, opts?: unknown) => Promise<unknown>;
  download: () => Promise<[Buffer]>;
  delete: () => Promise<unknown>;
  exists: () => Promise<[boolean]>;
};
type GcsBucket = { file: (name: string) => GcsFile };

export class GcsStorageProvider implements StorageProvider {
  private bucketName: string;
  private projectId: string;
  private bucketPromise: Promise<GcsBucket> | null = null;

  constructor(bucketName: string, projectId = '') {
    if (!bucketName) throw new Error('GcsStorageProvider requires a bucket name (GCS_BUCKET).');
    this.bucketName = bucketName;
    this.projectId = projectId;
  }

  private validateKey(key: string): string {
    if (!key || !SAFE_KEY.test(key) || key === '.' || key === '..') {
      throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
    }
    return key;
  }

  private async bucket(): Promise<GcsBucket> {
    if (!this.bucketPromise) {
      this.bucketPromise = (async () => {
        const moduleName = '@google-cloud/storage';
        const mod: any = await import(/* @vite-ignore */ moduleName);
        const Storage = mod.Storage ?? mod.default?.Storage ?? mod.default;
        const storage = this.projectId ? new Storage({ projectId: this.projectId }) : new Storage();
        return storage.bucket(this.bucketName) as GcsBucket;
      })();
    }
    return this.bucketPromise;
  }

  async save(key: string, data: Buffer): Promise<void> {
    const b = await this.bucket();
    // resumable:false for small docs; private by default (no public ACL set).
    await b.file(this.validateKey(key)).save(data, { resumable: false, validation: false });
  }

  async read(key: string): Promise<Buffer> {
    const b = await this.bucket();
    const [buf] = await b.file(this.validateKey(key)).download();
    return buf;
  }

  async delete(key: string): Promise<void> {
    const b = await this.bucket();
    try {
      await b.file(this.validateKey(key)).delete();
    } catch (err: any) {
      // Idempotent: ignore "not found" (404), matching LocalStorageProvider.
      if (err?.code !== 404) throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    const b = await this.bucket();
    const [ok] = await b.file(this.validateKey(key)).exists();
    return ok;
  }
}

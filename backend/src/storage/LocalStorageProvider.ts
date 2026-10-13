/**
 * Local filesystem StorageProvider for development.
 *
 * Security: every key is validated to be a single safe segment and the
 * resolved path is confirmed to stay within the storage root, blocking path
 * traversal (e.g. "../../etc/passwd"). Keys come from internal ID generation,
 * never from user input, but we validate defensively regardless.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StorageProvider } from './StorageProvider.js';

const SAFE_KEY = /^[A-Za-z0-9._-]+$/;

export class LocalStorageProvider implements StorageProvider {
  private root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  private resolveKey(key: string): string {
    if (!key || !SAFE_KEY.test(key) || key === '.' || key === '..') {
      throw new Error(`Unsafe storage key: ${JSON.stringify(key)}`);
    }
    const full = path.resolve(this.root, key);
    const rel = path.relative(this.root, full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error('Path traversal detected in storage key');
    }
    return full;
  }

  private async ensureRoot(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
  }

  async save(key: string, data: Buffer): Promise<void> {
    await this.ensureRoot();
    await fs.writeFile(this.resolveKey(key), data);
  }

  async read(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.resolveKey(key));
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err; // idempotent: ignore "not found"
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolveKey(key));
      return true;
    } catch {
      return false;
    }
  }
}

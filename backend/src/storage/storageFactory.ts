/**
 * Selects the StorageProvider implementation from configuration. Keeps a single
 * swap point so nothing else in the backend knows which backend is in use.
 *
 *   STORAGE_BACKEND=local (default) -> LocalStorageProvider (dev/tests)
 *   STORAGE_BACKEND=gcs             -> GcsStorageProvider (durable, private)
 */
import type { StorageProvider } from './StorageProvider.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';
import { GcsStorageProvider } from './GcsStorageProvider.js';
import { config } from '../config.js';

export function createStorageProvider(): StorageProvider {
  if (config.storageBackend === 'gcs') {
    return new GcsStorageProvider(config.gcsBucket, config.googleCloudProject);
  }
  return new LocalStorageProvider(config.storageDir);
}

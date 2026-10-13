/**
 * Optional DURABLE persistence sink for the JobStore.
 *
 * DESIGN (smallest safe change): the in-memory `JobStore` remains the single
 * authoritative, SYNCHRONOUS source of truth for the running process — every
 * existing read, the SSE `emit()` on write, and the cursor/activity behaviour
 * are UNCHANGED. This module is a write-through MIRROR: the store calls
 * `persistJob()` after each create/update/addEvent and `removeJob()` on delete,
 * and `loadAllJobs()` is called once at startup to repopulate the in-memory map
 * after a restart. Mirroring is best-effort and NEVER throws into the caller,
 * so a Firestore hiccup can never break the live demo flow.
 *
 * It is a no-op unless `JOB_STORE=firestore`. The Firestore client is loaded
 * via dynamic import, so local dev/tests never need the dependency installed.
 *
 * IMPORTANT: durable persistence does NOT by itself solve cross-instance SSE —
 * the subscriber registry is per-process. For the demo, run the backend at a
 * single instance (min=max=1). See the deployment notes.
 */
import type { Job } from './jobModel.js';
import { config } from '../config.js';

type FirestoreCollection = {
  doc: (id: string) => {
    set: (data: unknown) => Promise<unknown>;
    delete: () => Promise<unknown>;
  };
  get: () => Promise<{ docs: Array<{ data: () => unknown }> }>;
};

let enabled = false;
let collectionPromise: Promise<FirestoreCollection | null> | null = null;

/** Whether durable job persistence is turned on. */
export function jobPersistenceEnabled(): boolean {
  return config.jobStore === 'firestore';
}

/** Lazily create (once) the Firestore collection handle. Never throws. */
async function getCollection(): Promise<FirestoreCollection | null> {
  if (!jobPersistenceEnabled()) return null;
  if (!collectionPromise) {
    collectionPromise = (async () => {
      try {
        // Dynamic import so the dependency is only required in the cloud path.
        // The specifier is held in a variable so the TypeScript compiler does
        // not try to resolve the module at build time (it is installed only in
        // the deployed image, not in local dev/test installs).
        const moduleName = '@google-cloud/firestore';
        const mod: any = await import(/* @vite-ignore */ moduleName);
        const Firestore = mod.Firestore ?? mod.default?.Firestore ?? mod.default;
        const fs = config.googleCloudProject
          ? new Firestore({ projectId: config.googleCloudProject })
          : new Firestore();
        enabled = true;
        return fs.collection(config.firestoreCollection) as FirestoreCollection;
      } catch (err) {
        // Missing dependency or no credentials: disable mirroring loudly ONCE,
        // but never crash — the in-memory store still works for the session.
        // eslint-disable-next-line no-console
        console.error(
          '[jobPersistence] Firestore unavailable; running without durable job persistence:',
          (err as Error)?.message,
        );
        return null;
      }
    })();
  }
  return collectionPromise;
}

/** Mirror a job to Firestore (document id === job.id, preserving ids). */
export function persistJob(job: Job): void {
  if (!jobPersistenceEnabled()) return;
  // Fire-and-forget: a persistence delay/error must not block the request path.
  void (async () => {
    try {
      const col = await getCollection();
      if (!col) return;
      // Store a plain, JSON-safe copy. Storage KEYS (inputFileReference /
      // outputFileReference) are preserved so the bytes can be found after a
      // restart. The events array preserves order exactly.
      await col.doc(job.id).set(JSON.parse(JSON.stringify(job)));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[jobPersistence] persist failed for', job.id, (err as Error)?.message);
    }
  })();
}

/** Remove a job document (hard delete). Best-effort. */
export function removeJob(id: string): void {
  if (!jobPersistenceEnabled()) return;
  void (async () => {
    try {
      const col = await getCollection();
      if (!col) return;
      await col.doc(id).delete();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[jobPersistence] delete failed for', id, (err as Error)?.message);
    }
  })();
}

/**
 * Load all persisted jobs at startup so the in-memory map survives restarts.
 * Returns [] when persistence is disabled or unavailable. Never throws.
 */
export async function loadAllJobs(): Promise<Job[]> {
  if (!jobPersistenceEnabled()) return [];
  try {
    const col = await getCollection();
    if (!col) return [];
    const snap = await col.get();
    return snap.docs.map((d) => d.data() as Job);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[jobPersistence] load failed:', (err as Error)?.message);
    return [];
  }
}

/** For diagnostics/tests: whether the Firestore client actually initialised. */
export function jobPersistenceActive(): boolean {
  return enabled;
}

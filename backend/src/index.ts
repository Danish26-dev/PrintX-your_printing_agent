import app from './app.js';
import { config } from './config.js';
import { jobStore } from './jobs/jobModel.js';
import { jobPersistenceEnabled } from './jobs/jobPersistence.js';

async function start(): Promise<void> {
  // Repopulate jobs from durable storage (no-op unless JOB_STORE=firestore) so
  // a restarted/new instance recovers existing jobs before serving traffic.
  if (jobPersistenceEnabled()) {
    try {
      const n = await jobStore.hydrate();
      console.log(`[jobStore] hydrated ${n} job(s) from Firestore`);
    } catch (err) {
      console.error('[jobStore] hydrate failed (continuing with empty store):', (err as Error)?.message);
    }
  }

  app.listen(config.port, () => {
    console.log(`PrintX Backend listening on http://0.0.0.0:${config.port}`);
    console.log(`Strands Agent:   ${config.strandsAgentUrl}`);
    console.log(`Document Engine: ${config.documentEngineUrl}`);
    console.log(`Job store:       ${config.jobStore}`);
    console.log(`Storage backend: ${config.storageBackend}`);
  });
}

void start();

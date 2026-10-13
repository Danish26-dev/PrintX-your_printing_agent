// Shopkeeper-side jobs + overview — REAL data from the Backend.
//
// Previously this file returned hardcoded demo jobs and fabricated overview
// counts/revenue. That is removed. These functions now read ACTUAL jobs for
// PrintX Lab (the single MVP shop) from the Backend:
//   GET /api/shop/jobs      -> real job views
//   GET /api/shop/overview  -> honest counts derived from real jobs
//
// PERSISTENCE LIMITATION (MVP): the Backend job store is in-memory (per
// process), so counts reset when the Backend restarts. There is no revenue or
// historical analytics — we deliberately do NOT fabricate those.

import { api } from './apiClient';

/** Map a backend JobView to the shape the shopkeeper tables expect. */
function toJobRow(job) {
  return {
    id: job.id,
    document: job.originalFilename || 'document',
    status: job.status,
    copies: job.copies ?? (job.printConfig?.copies ?? 1),
    updatedAt: job.updatedAt,
    instruction: job.instruction || '',
  };
}

/** Real overview counts for PrintX Lab. Returns zeros if the Backend is down. */
export async function getOverview() {
  try {
    const { overview } = await api.shopOverview();
    return overview;
  } catch {
    return { activeJobs: 0, completedJobs: 0, pendingJobs: 0, failedJobs: 0, totalJobs: 0 };
  }
}

/** Real job list for PrintX Lab (most-recent first). Empty if Backend is down. */
export async function getJobs() {
  try {
    const { jobs } = await api.shopJobs();
    return jobs.map(toJobRow);
  } catch {
    return [];
  }
}

/** The most recent in-flight job, or null when there is none. */
export async function getActiveJob() {
  const jobs = await getJobs();
  const inFlight = new Set([
    'PROCESSING',
    'CONFIGURING_PRINTER',
    'READY_FOR_PREVIEW',
    'READY_FOR_APPROVAL',
    'APPROVED',
    'NEEDS_CLARIFICATION',
  ]);
  return jobs.find((j) => inFlight.has(j.status)) || null;
}

/** Recent jobs for the dashboard table (real). */
export async function getRecentJobs(limit = 8) {
  const jobs = await getJobs();
  return jobs.slice(0, limit);
}

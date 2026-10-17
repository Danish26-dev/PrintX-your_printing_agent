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

const EMPTY_OVERVIEW = { activeJobs: 0, completedJobs: 0, pendingJobs: 0, failedJobs: 0, totalJobs: 0 };

/**
 * Real overview counts for PrintX Lab.
 *
 * Returns zero counts on failure so the dashboard never crashes, but re-throws
 * is avoided; instead callers that need to distinguish "backend/auth error"
 * from "genuinely no jobs" should use `fetchShopSnapshot()` which reports the
 * error. Kept for backward compatibility with existing callers.
 */
export async function getOverview() {
  try {
    const { overview } = await api.shopOverview();
    return overview;
  } catch {
    return { ...EMPTY_OVERVIEW };
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

/**
 * Fetch BOTH the job list and overview in one call, and REPORT any error
 * instead of silently collapsing it into an empty dashboard.
 *
 * This is the reliability fix: previously a 401/403 (expired shopkeeper token)
 * or a transient network error was swallowed and rendered identically to
 * "no jobs", so the shopkeeper saw an empty dashboard with no explanation.
 * The dashboard polls this on an interval; when `error` is set it can show a
 * "reconnecting / sign-in required" state and keep the LAST known jobs instead
 * of blanking them. Returns:
 *   { jobs, overview, error }  where error is null on success or an
 *   { code, status, message } object on failure.
 */
export async function fetchShopSnapshot() {
  try {
    const [{ jobs }, { overview }] = await Promise.all([api.shopJobs(), api.shopOverview()]);
    return { jobs: jobs.map(toJobRow), overview, error: null };
  } catch (err) {
    return {
      jobs: null,
      overview: null,
      error: {
        code: err?.code || 'UNKNOWN',
        status: err?.status,
        message: err?.message || 'Could not reach PrintsX right now.',
      },
    };
  }
}

const IN_FLIGHT = new Set([
  'PROCESSING',
  'CONFIGURING_PRINTER',
  'READY_FOR_PREVIEW',
  'READY_FOR_APPROVAL',
  'APPROVED',
  'NEEDS_CLARIFICATION',
]);

/** The most recent in-flight job from a list (or null). Pure helper. */
export function pickActiveJob(jobs) {
  if (!Array.isArray(jobs)) return null;
  return jobs.find((j) => IN_FLIGHT.has(j.status)) || null;
}

/** The most recent in-flight job, or null when there is none. */
export async function getActiveJob() {
  const jobs = await getJobs();
  return pickActiveJob(jobs);
}

/** Recent jobs for the dashboard table (real). */
export async function getRecentJobs(limit = 8) {
  const jobs = await getJobs();
  return jobs.slice(0, limit);
}

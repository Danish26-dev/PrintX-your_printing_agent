// Verifies the shopkeeper dashboard job-feed reliability fix:
//  - fetchShopSnapshot REPORTS an error instead of silently returning empty,
//    so an expired sign-in / dropped connection is distinguishable from
//    "no jobs" (the dashboard can then keep the last known jobs + show a
//    notice rather than blanking out).
//  - pickActiveJob selects the most-recent in-flight job from a list.
//  - rows carry the shopId through from the backend view.

jest.mock('./apiClient', () => ({
  api: {
    shopJobs: jest.fn(),
    shopOverview: jest.fn(),
  },
}));

import { api } from './apiClient';
import { fetchShopSnapshot, pickActiveJob, getOverview } from './jobsService';

const OVERVIEW = { activeJobs: 1, completedJobs: 2, pendingJobs: 0, failedJobs: 0, totalJobs: 3 };

beforeEach(() => {
  jest.clearAllMocks();
});

test('fetchShopSnapshot returns jobs + overview with no error on success', async () => {
  api.shopJobs.mockResolvedValue({
    shopId: 'printx-lab',
    jobs: [
      { id: 'job_1', shopId: 'printx-lab', originalFilename: 'a.pdf', status: 'READY_FOR_PREVIEW', copies: 1, updatedAt: '2026-01-01T00:00:00Z' },
    ],
  });
  api.shopOverview.mockResolvedValue({ shopId: 'printx-lab', overview: OVERVIEW });

  const snap = await fetchShopSnapshot();
  expect(snap.error).toBeNull();
  expect(snap.overview).toEqual(OVERVIEW);
  expect(snap.jobs).toHaveLength(1);
  expect(snap.jobs[0].document).toBe('a.pdf');
});

test('fetchShopSnapshot REPORTS an auth error instead of returning empty jobs', async () => {
  const err = Object.assign(new Error('Unauthorized'), { code: 'UNAUTHORIZED', status: 401 });
  api.shopJobs.mockRejectedValue(err);
  api.shopOverview.mockRejectedValue(err);

  const snap = await fetchShopSnapshot();
  expect(snap.jobs).toBeNull();
  expect(snap.overview).toBeNull();
  expect(snap.error).toMatchObject({ status: 401 });
});

test('pickActiveJob returns the first in-flight job, or null', () => {
  expect(pickActiveJob([])).toBeNull();
  expect(pickActiveJob(null)).toBeNull();
  expect(
    pickActiveJob([
      { id: 'a', status: 'PRINT_SUBMITTED' },
      { id: 'b', status: 'PROCESSING' },
    ]),
  ).toMatchObject({ id: 'b' });
});

test('getOverview still returns zero counts on failure (backward compatible)', async () => {
  api.shopOverview.mockRejectedValue(new Error('down'));
  const ov = await getOverview();
  expect(ov).toEqual({ activeJobs: 0, completedJobs: 0, pendingJobs: 0, failedJobs: 0, totalJobs: 0 });
});

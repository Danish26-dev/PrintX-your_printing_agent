import type { Request, Response, NextFunction } from 'express';
import { JobServiceError } from '../jobs/jobService.js';

/**
 * Central error handler. Converts internal errors into clean API responses.
 * Never leaks stack traces, filesystem paths, service URLs, or credentials.
 * Detailed diagnostics stay in server logs.
 */
export const errorHandler = (
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  if (err instanceof JobServiceError) {
    // eslint-disable-next-line no-console
    console.error(`[error] ${err.code}: ${err.message}`);
    res.status(err.httpStatus).json({ error: { code: err.code, message: err.message } });
    return;
  }

  const e = err as { message?: string };
  // eslint-disable-next-line no-console
  console.error('[error] unhandled:', e?.message ?? err);
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' },
  });
};

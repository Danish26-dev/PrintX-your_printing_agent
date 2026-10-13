import type { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  console.error('Agent Error:', err.message);
  res.status(500).json({
    error: {
      code: 'agent_error',
      message: err.message || 'Internal Agent Error',
      timestamp: new Date().toISOString(),
    },
  });
};

/**
 * HTTP client to the Python Document Engine.
 *
 * The Backend uses this ONLY to fetch the processed file bytes (for preview /
 * download) from the engine job the agent created, and for health checks.
 * The Backend performs no document logic itself.
 */
import { config } from '../config.js';

export class EngineClientError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'EngineClientError';
    this.code = code;
  }
}

async function withTimeout<T>(fn: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export const documentEngine = {
  async health(): Promise<boolean> {
    try {
      const res = await withTimeout((signal) => fetch(`${config.documentEngineUrl}/health`, { signal }), 5000);
      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * Download a processed file from an engine job. `engineJobId` comes from the
   * agent result (document.job_id) and is a plain hex token; we still validate
   * it to be safe before building the URL.
   */
  async download(engineJobId: string): Promise<Buffer> {
    if (!/^[a-zA-Z0-9]+$/.test(engineJobId)) {
      throw new EngineClientError('BAD_ENGINE_JOB', 'Invalid document reference.');
    }
    let res: Response;
    try {
      res = await withTimeout(
        (signal) =>
          fetch(`${config.documentEngineUrl}/jobs/${engineJobId}/download`, { signal }),
        config.engineTimeoutMs,
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new EngineClientError('ENGINE_TIMEOUT', 'The document service took too long to respond.');
      }
      throw new EngineClientError('ENGINE_UNREACHABLE', 'The document service is unavailable.');
    }
    if (!res.ok) {
      throw new EngineClientError('ENGINE_DOWNLOAD_FAILED', 'The processed document could not be retrieved.');
    }
    const arrayBuf = await res.arrayBuffer();
    return Buffer.from(arrayBuf);
  },
};

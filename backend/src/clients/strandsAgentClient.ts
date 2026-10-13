/**
 * HTTP client to the Strands Agent service.
 *
 * The Backend never calls Bedrock and never duplicates agent logic. It only
 * forwards the document + instruction to the agent's POST /api/edit and
 * interprets the structured result.
 */
import { config } from '../config.js';

export interface AgentEditResult {
  executed: boolean;
  message: string;
  plan?: { operations: Array<{ type: string; [k: string]: unknown }> };
  document?: {
    job_id: string;
    input_format: string;
    output_format: string;
    output_filename: string;
    changes: {
      copies: number;
      total_replacements: number;
      operations: Array<{ type: string; description: string; details: Record<string, unknown> }>;
      strategy?: string;
    };
    validation?: {
      ok: boolean;
      output_format: string;
      page_count: number | null;
      strategy: string | null;
      review_recommended: boolean;
      structure: Record<string, unknown>;
      notes: string[];
    };
    download_url: string;
  };
  needsClarification?: boolean;
  errorCode?: string;
  /**
   * Structured PRINT OPTIONS the customer requested (print metadata). The
   * agent proposes these; the Backend validates + applies them against the real
   * printer. All fields optional.
   */
  printOptions?: {
    printerId?: string;
    copies?: number;
    colorMode?: 'color' | 'monochrome';
    paperSize?: 'A4' | 'Letter' | 'Legal';
    orientation?: 'portrait' | 'landscape';
    sides?: 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge';
  };
  /**
   * True when the request was PRINT-SETTINGS-ONLY (print options captured, no
   * document edit). A SUCCESS, not a clarification — the Backend makes the
   * (unedited) document ready to preview and carries the proposed settings.
   */
  printOptionsOnly?: boolean;
}

export class AgentClientError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'AgentClientError';
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

export const strandsAgent = {
  async health(): Promise<boolean> {
    try {
      const res = await withTimeout(
        (signal) => fetch(`${config.strandsAgentUrl}/api/health`, { signal }),
        5000,
      );
      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * Forward a document + instruction to the agent for planning + execution.
   * Maps transport failures to typed errors so the caller can produce clean,
   * non-leaking API responses.
   */
  async edit(fileBuffer: Buffer, filename: string, instruction: string): Promise<AgentEditResult> {
    const form = new FormData();
    form.set('file', new Blob([new Uint8Array(fileBuffer)]), filename);
    form.set('instruction', instruction);

    let res: Response;
    try {
      res = await withTimeout(
        (signal) =>
          fetch(`${config.strandsAgentUrl}/api/edit`, { method: 'POST', body: form, signal }),
        config.agentTimeoutMs,
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new AgentClientError('AGENT_TIMEOUT', 'The document assistant took too long to respond.');
      }
      throw new AgentClientError('AGENT_UNREACHABLE', 'The document assistant is unavailable.');
    }

    let body: any;
    try {
      body = await res.json();
    } catch {
      throw new AgentClientError('AGENT_BAD_RESPONSE', 'The document assistant returned an unreadable response.');
    }

    if (!res.ok) {
      const code = body?.error?.code ?? 'AGENT_ERROR';
      throw new AgentClientError(String(code).toUpperCase(), 'The document assistant could not process the request.');
    }

    if (!body?.result) {
      throw new AgentClientError('AGENT_BAD_RESPONSE', 'The document assistant returned an unexpected response.');
    }
    return body.result as AgentEditResult;
  },
};

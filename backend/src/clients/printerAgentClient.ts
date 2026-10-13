/**
 * HTTP client to the LOCAL printer agent (runs on the shopkeeper's machine).
 *
 * The Backend cannot drive a local printer directly, so it delegates discovery,
 * availability, validation, and submission to the local agent over HTTP. Every
 * method fails closed: on any transport error it reports the agent as
 * unreachable rather than pretending a printer exists or a job printed.
 */
import { config } from '../config.js';

export interface AgentPrinter {
  id: string;
  name: string;
  driver?: string;
  port?: string;
  status: 'online' | 'offline' | 'unknown';
  isDefault: boolean;
  supportsColor: boolean | null; // null = unknown (not fabricated)
  supportsDuplex: boolean | null;
  paperSizes: string[] | null;
}

export interface AgentDiscovery {
  printers: AgentPrinter[];
  defaultPrinter: string | null;
}

export interface AgentSubmitResult {
  ok: boolean;
  state: string;
  message: string;
  spoolerJobId?: string;
  errors?: string[];
}

export class PrinterAgentUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrinterAgentUnavailable';
  }
}

function headers(json = false): Record<string, string> {
  const h: Record<string, string> = {};
  if (json) h['Content-Type'] = 'application/json';
  if (config.printerAgentToken) h['x-printer-agent-token'] = config.printerAgentToken;
  return h;
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

/** Whether a local printer agent is even configured. */
export function printerAgentConfigured(): boolean {
  return Boolean(config.printerAgentUrl);
}

export const printerAgent = {
  /** Is the local agent reachable right now? Never throws. */
  async health(): Promise<boolean> {
    if (!config.printerAgentUrl) return false;
    try {
      const res = await withTimeout(
        (signal) => fetch(`${config.printerAgentUrl}/health`, { signal }),
        4000,
      );
      return res.ok;
    } catch {
      return false;
    }
  },

  async discover(): Promise<AgentDiscovery> {
    if (!config.printerAgentUrl) {
      throw new PrinterAgentUnavailable('No local printer agent is configured.');
    }
    let res: Response;
    try {
      res = await withTimeout(
        (signal) => fetch(`${config.printerAgentUrl}/printers`, { headers: headers(), signal }),
        config.printerAgentTimeoutMs,
      );
    } catch {
      throw new PrinterAgentUnavailable('The local printer agent is not reachable.');
    }
    if (!res.ok) throw new PrinterAgentUnavailable(`The local printer agent returned ${res.status}.`);
    const body = (await res.json()) as { printers?: AgentPrinter[]; defaultPrinter?: string | null };
    return { printers: body.printers ?? [], defaultPrinter: body.defaultPrinter ?? null };
  },

  async availability(printerId: string): Promise<{ available: boolean; status: string }> {
    if (!config.printerAgentUrl) throw new PrinterAgentUnavailable('No local printer agent is configured.');
    let res: Response;
    try {
      res = await withTimeout(
        (signal) =>
          fetch(`${config.printerAgentUrl}/printers/${encodeURIComponent(printerId)}/availability`, {
            headers: headers(),
            signal,
          }),
        config.printerAgentTimeoutMs,
      );
    } catch {
      throw new PrinterAgentUnavailable('The local printer agent is not reachable.');
    }
    if (!res.ok) throw new PrinterAgentUnavailable(`The local printer agent returned ${res.status}.`);
    const body = (await res.json()) as { available?: boolean; status?: string };
    return { available: Boolean(body.available), status: body.status ?? 'unknown' };
  },

  /** Submit an APPROVED job's PDF bytes. Caller MUST have enforced approval. */
  async submit(config_: Record<string, unknown>, documentBytes: Buffer): Promise<AgentSubmitResult> {
    if (!config.printerAgentUrl) {
      return { ok: false, state: 'PRINTER_ADAPTER_UNAVAILABLE', message: 'No local printer agent is configured.' };
    }
    let res: Response;
    try {
      res = await withTimeout(
        (signal) =>
          fetch(`${config.printerAgentUrl}/print`, {
            method: 'POST',
            headers: headers(true),
            body: JSON.stringify({
              config: config_,
              documentBase64: documentBytes.toString('base64'),
            }),
            signal,
          }),
        config.printerAgentTimeoutMs,
      );
    } catch {
      return { ok: false, state: 'PRINTER_ADAPTER_UNAVAILABLE', message: 'The local printer agent is not reachable.' };
    }
    let body: AgentSubmitResult;
    try {
      body = (await res.json()) as AgentSubmitResult;
    } catch {
      return { ok: false, state: 'SUBMIT_FAILED', message: 'The local printer agent returned an unreadable response.' };
    }
    return body;
  },
};

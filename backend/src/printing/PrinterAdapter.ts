/**
 * Printer abstraction for PrintX.
 *
 * HONESTY MODEL
 * -------------
 * The Backend cannot drive a local printer directly. The REAL path is the
 * `LocalAgentPrinterAdapter`, which delegates to a local printer agent running
 * on the shopkeeper's machine (see local-printer-agent/). When no local agent
 * is configured OR it is unreachable, we fall back to `NullPrinterAdapter`,
 * which:
 *   - returns NO fabricated printers (empty list),
 *   - reports isReal() === false,
 *   - never claims a document physically printed.
 *
 * A successful submit through the real adapter means the Windows spooler
 * ACCEPTED the job (state PRINT_SUBMITTED) — it does NOT mean paper printed.
 */
import type { PrintConfig } from '../jobs/jobModel.js';
import {
  printerAgent,
  printerAgentConfigured,
  PrinterAgentUnavailable,
} from '../clients/printerAgentClient.js';
import {
  validatePrintSettings,
  type DiscoveredPrinter,
  type PrintSettings,
  type ValidationResult,
} from './printSettings.js';

export interface PrinterInfo {
  name: string;
  status: 'online' | 'offline' | 'unknown';
}

export type PrintSubmitResult =
  | { ok: true; state: 'PRINT_SUBMITTED'; printJobId: string; note: string }
  | {
      ok: false;
      state: 'PRINTER_UNAVAILABLE' | 'PRINT_FAILED' | 'NOT_IMPLEMENTED' | 'PRINTER_ADAPTER_UNAVAILABLE' | 'INVALID_CONFIG';
      message: string;
    };

/** Legacy allowlist for the older PrintConfig shape (kept for compatibility). */
const ALLOWED_PAPER = new Set(['A4', 'Letter', 'Legal']);
const ALLOWED_COLOR = new Set(['Color', 'BlackAndWhite']);
const ALLOWED_ORIENTATION = new Set(['Portrait', 'Landscape']);
const ALLOWED_PPS = new Set([1, 2, 4]);

export function validatePrintConfig(config: PrintConfig): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!config.printer || typeof config.printer !== 'string') errors.push('printer is required');
  if (!Number.isInteger(config.copies) || config.copies < 1 || config.copies > 999)
    errors.push('copies must be an integer between 1 and 999');
  if (!ALLOWED_PAPER.has(config.paperSize)) errors.push('invalid paperSize');
  if (!ALLOWED_COLOR.has(config.colorMode)) errors.push('invalid colorMode');
  if (!ALLOWED_ORIENTATION.has(config.orientation)) errors.push('invalid orientation');
  if (!ALLOWED_PPS.has(config.pagesPerSheet)) errors.push('invalid pagesPerSheet');
  if (!/^(All|(\d+(-\d+)?)(,\d+(-\d+)?)*)$/.test(config.pageRange)) errors.push('invalid pageRange');
  return { ok: errors.length === 0, errors };
}

/**
 * The PrinterAdapter interface. Methods come in two tiers:
 *  - Legacy (PrintConfig): listPrinters/getPrinterStatus/validateConfiguration/
 *    submitPrintJob — used by the original demo print flow.
 *  - Real (PrintSettings): discover/checkAvailability/validateSettings/
 *    submitSettings — the real local-agent flow.
 */
export interface PrinterAdapter {
  listPrinters(): Promise<PrinterInfo[]>;
  getPrinterStatus(name: string): Promise<PrinterInfo>;
  validateConfiguration(config: PrintConfig): { ok: boolean; errors: string[] };
  submitPrintJob(config: PrintConfig, documentBytes: Buffer): Promise<PrintSubmitResult>;
  isReal(): boolean;

  // Real-flow methods.
  discover(): Promise<DiscoveredPrinter[]>;
  checkAvailability(printerId: string): Promise<{ available: boolean; status: string }>;
  validateSettings(input: unknown, printers: DiscoveredPrinter[]): ValidationResult;
  submitSettings(settings: PrintSettings, documentBytes: Buffer): Promise<PrintSubmitResult>;
  /** Whether a local agent is reachable right now (not just configured). */
  agentReachable(): Promise<boolean>;
}

/**
 * Default adapter when no real local agent is configured/reachable. It
 * fabricates NOTHING: no printers, no success. isReal() is false.
 */
export class NullPrinterAdapter implements PrinterAdapter {
  async listPrinters(): Promise<PrinterInfo[]> {
    return []; // No real enumeration available — do not fabricate a device.
  }
  async getPrinterStatus(name: string): Promise<PrinterInfo> {
    return { name, status: 'unknown' };
  }
  validateConfiguration(config: PrintConfig): { ok: boolean; errors: string[] } {
    return validatePrintConfig(config);
  }
  async submitPrintJob(_config: PrintConfig, _documentBytes: Buffer): Promise<PrintSubmitResult> {
    return {
      ok: false,
      state: 'PRINTER_ADAPTER_UNAVAILABLE',
      message:
        'No local printer agent is connected, so PrintX cannot submit a print job. ' +
        'Start the PrintX local printer agent on the shop computer and try again.',
    };
  }
  isReal(): boolean {
    return false;
  }
  async discover(): Promise<DiscoveredPrinter[]> {
    return [];
  }
  async checkAvailability(_printerId: string): Promise<{ available: boolean; status: string }> {
    return { available: false, status: 'adapter_unavailable' };
  }
  validateSettings(input: unknown, printers: DiscoveredPrinter[]): ValidationResult {
    return validatePrintSettings(input, printers);
  }
  async submitSettings(_settings: PrintSettings, _documentBytes: Buffer): Promise<PrintSubmitResult> {
    return {
      ok: false,
      state: 'PRINTER_ADAPTER_UNAVAILABLE',
      message: 'No local printer agent is connected.',
    };
  }
  async agentReachable(): Promise<boolean> {
    return false;
  }
}

/**
 * Real adapter: delegates to the local printer agent over HTTP. All failures
 * are reported honestly; nothing is fabricated.
 */
export class LocalAgentPrinterAdapter implements PrinterAdapter {
  async agentReachable(): Promise<boolean> {
    return printerAgent.health();
  }

  isReal(): boolean {
    // Configured to use a real agent. (Live reachability is agentReachable().)
    return printerAgentConfigured();
  }

  async discover(): Promise<DiscoveredPrinter[]> {
    try {
      const { printers } = await printerAgent.discover();
      return printers as DiscoveredPrinter[];
    } catch {
      return []; // unreachable agent => no printers (never fabricate)
    }
  }

  async listPrinters(): Promise<PrinterInfo[]> {
    const printers = await this.discover();
    return printers.map((p) => ({ name: p.name, status: p.status }));
  }

  async getPrinterStatus(name: string): Promise<PrinterInfo> {
    const printers = await this.discover();
    const p = printers.find((x) => x.id === name || x.name === name);
    return p ? { name: p.name, status: p.status } : { name, status: 'unknown' };
  }

  async checkAvailability(printerId: string): Promise<{ available: boolean; status: string }> {
    try {
      return await printerAgent.availability(printerId);
    } catch (err) {
      if (err instanceof PrinterAgentUnavailable) {
        return { available: false, status: 'adapter_unavailable' };
      }
      return { available: false, status: 'unknown' };
    }
  }

  validateConfiguration(config: PrintConfig): { ok: boolean; errors: string[] } {
    return validatePrintConfig(config);
  }

  validateSettings(input: unknown, printers: DiscoveredPrinter[]): ValidationResult {
    return validatePrintSettings(input, printers);
  }

  /** Legacy submit path — map PrintConfig to PrintSettings then submit. */
  async submitPrintJob(config: PrintConfig, documentBytes: Buffer): Promise<PrintSubmitResult> {
    const settings: PrintSettings = {
      printerId: config.printer,
      copies: config.copies,
      colorMode: config.colorMode === 'Color' ? 'color' : 'monochrome',
      paperSize: config.paperSize,
      orientation: config.orientation === 'Landscape' ? 'landscape' : 'portrait',
      sides: 'one-sided',
    };
    return this.submitSettings(settings, documentBytes);
  }

  async submitSettings(settings: PrintSettings, documentBytes: Buffer): Promise<PrintSubmitResult> {
    const result = await printerAgent.submit(settings as unknown as Record<string, unknown>, documentBytes);
    if (result.ok) {
      return {
        ok: true,
        state: 'PRINT_SUBMITTED',
        printJobId: result.spoolerJobId ?? `spool_${Date.now().toString(36)}`,
        note: result.message,
      };
    }
    // Map agent failure states to adapter states.
    const state =
      result.state === 'PRINTER_UNAVAILABLE' || result.state === 'PRINTER_NOT_FOUND'
        ? 'PRINTER_UNAVAILABLE'
        : result.state === 'INVALID_CONFIG'
          ? 'INVALID_CONFIG'
          : result.state === 'PRINTER_ADAPTER_UNAVAILABLE' || result.state === 'SUBMIT_UNAVAILABLE'
            ? 'PRINTER_ADAPTER_UNAVAILABLE'
            : 'PRINT_FAILED';
    return { ok: false, state, message: result.message };
  }
}

/**
 * Choose the adapter: real local-agent adapter when configured, else the honest
 * Null adapter. (Configured vs reachable are distinct — reachability is checked
 * live per operation and reported truthfully.)
 *
 * Exported as a `let` so tests can inject a controlled adapter via
 * `__setPrinterAdapterForTests`. ESM live bindings mean importers see the
 * reassignment. This setter is TEST-ONLY and must never be used in production.
 */
export let printerAdapter: PrinterAdapter = printerAgentConfigured()
  ? new LocalAgentPrinterAdapter()
  : new NullPrinterAdapter();

/**
 * TEST-ONLY: replace the active printer adapter with a controlled fake. Returns
 * the previous adapter so a test can restore it. NEVER call this in production
 * code — it exists solely to drive the lifecycle with a deterministic adapter.
 */
export function __setPrinterAdapterForTests(adapter: PrinterAdapter): PrinterAdapter {
  const previous = printerAdapter;
  printerAdapter = adapter;
  return previous;
}

/** Build a default (legacy) print configuration, merging any safe overrides. */
export function buildPrintConfig(overrides: Partial<PrintConfig> = {}): PrintConfig {
  return {
    printer: overrides.printer ?? 'default',
    copies: overrides.copies ?? 1,
    paperSize: overrides.paperSize ?? 'A4',
    colorMode: overrides.colorMode ?? 'BlackAndWhite',
    orientation: overrides.orientation ?? 'Portrait',
    pageRange: overrides.pageRange ?? 'All',
    pagesPerSheet: overrides.pagesPerSheet ?? 1,
    scale: overrides.scale ?? '100%',
  };
}

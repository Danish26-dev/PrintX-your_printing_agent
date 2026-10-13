/**
 * DEMO printer adapter — an EXPLICIT, clearly-labelled simulated printer.
 *
 * WHY THIS EXISTS
 * ---------------
 * PrintX must be demonstrable without physical hardware. The demo adapter
 * implements the SAME `PrinterAdapter` interface as the real local-agent
 * adapter and flows through the SAME jobService code path, so it emits the same
 * structured lifecycle events (CHECKING_PRINTERS, PRINTER_DETECTED,
 * SETTING_APPLIED, CONFIGURATION_VERIFIED, …) that drive the live activity panel
 * and the agent cursor. The difference is that it NEVER touches the operating
 * system and NEVER claims physical paper was printed.
 *
 * HARD RULES (do not weaken):
 *   - It is SELECTED EXPLICITLY (job.printerMode === 'demo'). It is NEVER a
 *     silent fallback when real discovery fails.
 *   - isReal() === false, isDemo() === true — the UI must label it DEMO.
 *   - submitSettings() reports success as a SIMULATION; the note states plainly
 *     that no physical document was printed.
 *   - It never invokes a real OS printer or the local printer agent.
 */
import type { PrintConfig } from '../jobs/jobModel.js';
import {
  validatePrintSettings,
  type DiscoveredPrinter,
  type PrintSettings,
  type ValidationResult,
} from './printSettings.js';
import {
  type PrinterAdapter,
  type PrinterInfo,
  type PrintSubmitResult,
  validatePrintConfig,
} from './PrinterAdapter.js';

/** The stable id of the primary demo device. The frontend offers this
 *  explicitly. Kept as the canonical/default demo id for backward compatibility
 *  (existing tests + the resolveMode demo inference reference it). */
export const DEMO_PRINTER_ID = 'demo-printer';

/** The two simulated devices the demo adapter exposes. Capabilities are
 *  deterministic so the demo can exercise every supported setting. Both are
 *  clearly DEMO devices and NEVER touch the operating system. The first is the
 *  default (and remains the single `DEMO_PRINTER` export for compatibility).
 *
 *  The SECOND device deliberately has NARROWER capabilities (no colour,
 *  A4/Letter only) so the demo can honestly show capability validation differ
 *  between two selectable printers — it is still fully simulated. */
export const DEMO_PRINTERS: DiscoveredPrinter[] = [
  {
    id: DEMO_PRINTER_ID,
    name: 'PrintX Demo Printer A (Colour Duplex)',
    status: 'online',
    isDefault: true,
    supportsColor: true,
    supportsDuplex: true,
    paperSizes: ['A4', 'Letter', 'Legal'],
  },
  {
    id: 'demo-printer-2',
    name: 'PrintX Demo Printer B (Mono)',
    status: 'online',
    isDefault: false,
    supportsColor: false,
    supportsDuplex: true,
    paperSizes: ['A4', 'Letter'],
  },
];

/** The set of valid demo printer ids (used to recognise any demo device). */
export const DEMO_PRINTER_IDS: ReadonlySet<string> = new Set(DEMO_PRINTERS.map((p) => p.id));

/** The primary/default demo device. Preserved as a single export so existing
 *  callers and tests that reference `DEMO_PRINTER` keep working unchanged. */
export const DEMO_PRINTER: DiscoveredPrinter = DEMO_PRINTERS[0];

/** Simulated completion note. It must never read as a real physical print. */
export const DEMO_SUBMIT_NOTE = 'Demo print completed — no physical document was printed.';

export interface DemoAdapterOptions {
  /**
   * When set, submitSettings fails deterministically with this state so tests
   * (and a "configure to fail" demo) can exercise the failure path. Default:
   * succeed (as a simulation).
   */
  submitFailure?: 'PRINTER_UNAVAILABLE' | 'PRINT_FAILED' | null;
  /** When true, the demo device reports offline (for an availability-failure demo). */
  offline?: boolean;
}

export class DemoPrinterAdapter implements PrinterAdapter {
  constructor(private opts: DemoAdapterOptions = {}) {}

  /** DEMO is explicitly NOT a real printer. */
  isReal(): boolean {
    return false;
  }

  /** Lets callers/UI assert this is the simulated adapter. */
  isDemo(): boolean {
    return true;
  }

  /** All simulated devices, reflecting the offline option when set. */
  private devices(): DiscoveredPrinter[] {
    return this.opts.offline
      ? DEMO_PRINTERS.map((d) => ({ ...d, status: 'offline' as const }))
      : DEMO_PRINTERS;
  }

  async agentReachable(): Promise<boolean> {
    // The demo "agent" is always reachable — it is in-process. This is honest:
    // it reflects that the simulated device is available, not a real agent.
    return true;
  }

  async discover(): Promise<DiscoveredPrinter[]> {
    return this.devices();
  }

  async listPrinters(): Promise<PrinterInfo[]> {
    return this.devices().map((d) => ({ name: d.name, status: d.status }));
  }

  async getPrinterStatus(name: string): Promise<PrinterInfo> {
    const d = this.devices().find((x) => x.id === name || x.name === name);
    return d ? { name: d.name, status: d.status } : { name, status: 'unknown' };
  }

  async checkAvailability(printerId: string): Promise<{ available: boolean; status: string }> {
    // Recognise ANY demo device id (not just the primary) so a second
    // selectable demo printer is honoured. Unknown ids are not_found.
    if (!DEMO_PRINTER_IDS.has(printerId)) return { available: false, status: 'not_found' };
    if (this.opts.offline) return { available: false, status: 'offline' };
    return { available: true, status: 'online' };
  }

  /** Validate against the full set of demo devices using the SAME deterministic
   *  validator the real flow uses, so capability checks behave identically and
   *  each demo printer's own capabilities (e.g. mono-only) are enforced. */
  validateSettings(input: unknown, _printers: DiscoveredPrinter[]): ValidationResult {
    return validatePrintSettings(input, this.devices());
  }

  validateConfiguration(config: PrintConfig): { ok: boolean; errors: string[] } {
    return validatePrintConfig(config);
  }

  async submitSettings(_settings: PrintSettings, _documentBytes: Buffer): Promise<PrintSubmitResult> {
    if (this.opts.submitFailure) {
      return {
        ok: false,
        state: this.opts.submitFailure,
        message:
          this.opts.submitFailure === 'PRINTER_UNAVAILABLE'
            ? 'The demo printer reported unavailable (simulated failure).'
            : 'The demo print could not be completed (simulated failure).',
      };
    }
    // SIMULATED success. We NEVER send bytes to a real spooler or OS printer.
    return {
      ok: true,
      state: 'PRINT_SUBMITTED',
      printJobId: `demo_${Date.now().toString(36)}`,
      note: DEMO_SUBMIT_NOTE,
    };
  }

  async submitPrintJob(config: PrintConfig, documentBytes: Buffer): Promise<PrintSubmitResult> {
    const settings: PrintSettings = {
      printerId: DEMO_PRINTER_ID,
      copies: config.copies,
      colorMode: config.colorMode === 'Color' ? 'color' : 'monochrome',
      paperSize: config.paperSize,
      orientation: config.orientation === 'Landscape' ? 'landscape' : 'portrait',
      sides: 'one-sided',
    };
    return this.submitSettings(settings, documentBytes);
  }
}

/** The shared demo adapter instance used when a job explicitly selects demo
 *  mode. Kept SEPARATE from the real/null `printerAdapter` singleton. */
export const demoPrinterAdapter = new DemoPrinterAdapter();

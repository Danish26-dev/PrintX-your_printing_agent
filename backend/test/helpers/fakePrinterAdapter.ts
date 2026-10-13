/**
 * TEST-ONLY controlled printer adapter.
 *
 * This is NOT production printer code. It implements the PrinterAdapter
 * interface with deterministic, configurable behavior so the job lifecycle can
 * be tested without a real printer or the local agent. Scenarios are toggled
 * via the constructor options. It uses the REAL validatePrintSettings so
 * validation behavior under test matches production.
 */
import type { PrinterAdapter, PrinterInfo, PrintSubmitResult } from '../../src/printing/PrinterAdapter.js';
import {
  validatePrintSettings,
  type DiscoveredPrinter,
  type PrintSettings,
  type ValidationResult,
} from '../../src/printing/printSettings.js';
import type { PrintConfig } from '../../src/jobs/jobModel.js';

export interface FakeOptions {
  printers?: DiscoveredPrinter[];
  /** Force availability to report offline for all printers. */
  offline?: boolean;
  /** Make submitSettings fail with this state. */
  submitFailure?: 'PRINTER_UNAVAILABLE' | 'PRINT_FAILED' | 'PRINTER_ADAPTER_UNAVAILABLE' | null;
  real?: boolean;
}

export const DEFAULT_FAKE_PRINTER: DiscoveredPrinter = {
  id: 'Test Printer',
  name: 'Test Printer',
  status: 'online',
  isDefault: true,
  supportsColor: true,
  supportsDuplex: true,
  paperSizes: ['A4', 'Letter'],
};

export class FakePrinterAdapter implements PrinterAdapter {
  constructor(private opts: FakeOptions = {}) {}

  private printers(): DiscoveredPrinter[] {
    return this.opts.printers ?? [DEFAULT_FAKE_PRINTER];
  }

  isReal(): boolean {
    return this.opts.real ?? true;
  }
  async agentReachable(): Promise<boolean> {
    return this.printers().length > 0;
  }
  async discover(): Promise<DiscoveredPrinter[]> {
    return this.printers();
  }
  async listPrinters(): Promise<PrinterInfo[]> {
    return this.printers().map((p) => ({ name: p.name, status: p.status }));
  }
  async getPrinterStatus(name: string): Promise<PrinterInfo> {
    const p = this.printers().find((x) => x.id === name);
    return p ? { name: p.name, status: p.status } : { name, status: 'unknown' };
  }
  async checkAvailability(printerId: string): Promise<{ available: boolean; status: string }> {
    const p = this.printers().find((x) => x.id === printerId);
    if (!p) return { available: false, status: 'not_found' };
    if (this.opts.offline) return { available: false, status: 'offline' };
    return { available: p.status !== 'offline', status: p.status };
  }
  validateSettings(input: unknown, printers: DiscoveredPrinter[]): ValidationResult {
    return validatePrintSettings(input, printers);
  }
  validateConfiguration(config: PrintConfig): { ok: boolean; errors: string[] } {
    // minimal legacy validation for completeness
    return { ok: Number.isInteger(config.copies) && config.copies >= 1, errors: [] };
  }
  async submitSettings(_settings: PrintSettings, _bytes: Buffer): Promise<PrintSubmitResult> {
    if (this.opts.submitFailure) {
      return { ok: false, state: this.opts.submitFailure, message: `forced ${this.opts.submitFailure}` };
    }
    return {
      ok: true,
      state: 'PRINT_SUBMITTED',
      printJobId: 'fake_spool_1',
      note: 'Fake spooler accepted the job (test). Physical completion not confirmed.',
    };
  }
  async submitPrintJob(_config: PrintConfig, _bytes: Buffer): Promise<PrintSubmitResult> {
    return this.submitSettings(
      {
        printerId: _config.printer,
        copies: _config.copies,
        colorMode: 'monochrome',
        paperSize: 'A4',
        orientation: 'portrait',
        sides: 'one-sided',
      },
      _bytes,
    );
  }
}

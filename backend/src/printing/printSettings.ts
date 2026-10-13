/**
 * Strict, allowlisted print-settings schema for the real printer flow (MVP).
 *
 * This mirrors the local printer agent's schema (local-printer-agent/src/
 * printConfig.js) and is the shape the agent PROPOSES and deterministic code
 * VALIDATES. It is intentionally separate from the legacy `PrintConfig` in
 * jobModel.ts (which the older demo print flow used); we keep both so nothing
 * that already works breaks.
 *
 *   {
 *     printerId: string,       // must match a discovered printer id
 *     copies: 1..999 integer,
 *     colorMode: 'color' | 'monochrome',
 *     paperSize: 'A4' | 'Letter' | 'Legal',
 *     orientation: 'portrait' | 'landscape',
 *     sides: 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge'
 *   }
 */
export const COLOR_MODES = ['color', 'monochrome'] as const;
export const PAPER_SIZES = ['A4', 'Letter', 'Legal'] as const;
export const ORIENTATIONS = ['portrait', 'landscape'] as const;
export const SIDES = ['one-sided', 'two-sided-long-edge', 'two-sided-short-edge'] as const;
export const MAX_COPIES = 999;

export interface PrintSettings {
  printerId: string;
  copies: number;
  colorMode: (typeof COLOR_MODES)[number];
  paperSize: (typeof PAPER_SIZES)[number];
  orientation: (typeof ORIENTATIONS)[number];
  sides: (typeof SIDES)[number];
}

export interface DiscoveredPrinter {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'unknown';
  isDefault: boolean;
  supportsColor: boolean | null;
  supportsDuplex: boolean | null;
  paperSizes: string[] | null;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  value?: PrintSettings;
  /** Non-fatal warnings, e.g. a setting the driver may not support. */
  warnings: string[];
}

/**
 * Validate a proposed PrintSettings object against the allowlist and the set of
 * printers actually discovered. Never trusts input; returns a normalized value
 * containing only allowlisted keys.
 *
 * Capability warnings: when a printer explicitly reports it does NOT support a
 * requested capability (e.g. duplex=false), that is a hard error (we must not
 * silently substitute). When capability is unknown (null), we proceed but add a
 * warning so the shopkeeper is told it is unverified.
 */
export function validatePrintSettings(
  input: unknown,
  printers: DiscoveredPrinter[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const config = (input ?? {}) as Record<string, unknown>;

  const printerId = config.printerId;
  let printer: DiscoveredPrinter | undefined;
  if (typeof printerId !== 'string' || printerId.trim() === '') {
    errors.push('printerId is required.');
  } else {
    printer = printers.find((p) => p.id === printerId);
    if (printers.length > 0 && !printer) {
      errors.push(`Unknown printerId: no discovered printer matches "${printerId}".`);
    }
  }

  const copies = config.copies;
  if (!Number.isInteger(copies) || (copies as number) < 1 || (copies as number) > MAX_COPIES) {
    errors.push(`copies must be an integer between 1 and ${MAX_COPIES}.`);
  }

  if (!COLOR_MODES.includes(config.colorMode as never)) {
    errors.push(`colorMode must be one of: ${COLOR_MODES.join(', ')}.`);
  }
  if (!PAPER_SIZES.includes(config.paperSize as never)) {
    errors.push(`paperSize must be one of: ${PAPER_SIZES.join(', ')}.`);
  }
  if (!ORIENTATIONS.includes(config.orientation as never)) {
    errors.push(`orientation must be one of: ${ORIENTATIONS.join(', ')}.`);
  }
  if (!SIDES.includes(config.sides as never)) {
    errors.push(`sides must be one of: ${SIDES.join(', ')}.`);
  }

  // Capability checks (only when we have a printer and valid enum values).
  if (printer) {
    const wantsDuplex = config.sides === 'two-sided-long-edge' || config.sides === 'two-sided-short-edge';
    if (wantsDuplex) {
      if (printer.supportsDuplex === false) {
        errors.push(`Printer "${printer.name}" does not support double-sided printing.`);
      } else if (printer.supportsDuplex === null) {
        warnings.push('Double-sided support could not be confirmed for this printer; it may fall back to single-sided.');
      }
    }
    const wantsColor = config.colorMode === 'color';
    if (wantsColor) {
      if (printer.supportsColor === false) {
        errors.push(`Printer "${printer.name}" does not support colour printing.`);
      } else if (printer.supportsColor === null) {
        warnings.push('Colour support could not be confirmed for this printer; output may be monochrome.');
      }
    }
    if (printer.status === 'offline') {
      errors.push(`Printer "${printer.name}" is currently offline.`);
    }
  }

  if (errors.length > 0) return { ok: false, errors, warnings };

  return {
    ok: true,
    errors: [],
    warnings,
    value: {
      printerId: printerId as string,
      copies: copies as number,
      colorMode: config.colorMode as PrintSettings['colorMode'],
      paperSize: config.paperSize as PrintSettings['paperSize'],
      orientation: config.orientation as PrintSettings['orientation'],
      sides: config.sides as PrintSettings['sides'],
    },
  };
}

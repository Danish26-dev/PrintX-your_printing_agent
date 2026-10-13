/**
 * The closed operation schema, mirrored from the Python Document Engine
 * (app/editing/schema.py). This is the reliability boundary: the agent may
 * only produce operations defined here, and every plan is validated against
 * these zod schemas before it is sent to the Document Engine.
 *
 * The Document Engine re-validates independently and remains the final
 * authority — this client-side validation lets the agent fail fast and ask for
 * clarification without a network round-trip.
 *
 * To add an operation, mirror the corresponding change in the Python engine.
 */
import { z } from 'zod';

export const MAX_OPERATIONS = 50;
export const MAX_TEXT_LENGTH = 5000;
export const MAX_COPIES = 999;

/**
 * Optional inclusive 1-based page range for a page-scoped replacement.
 * {from: 1, to: 3} means pages 1, 2 and 3. Omit `pages` for a whole-document
 * replacement (the default). Page scoping is only meaningful for PDFs.
 */
export const pageRange = z
  .object({
    from: z.number().int().min(1),
    to: z.number().int().min(1),
  })
  .refine((r) => r.to >= r.from, {
    message: '`to` page must be >= `from` page',
  });

export const replaceTextOperation = z.object({
  type: z.literal('replace_text'),
  find: z
    .string()
    .min(1)
    .max(MAX_TEXT_LENGTH)
    .refine((s) => s.trim().length > 0, {
      message: '`find` cannot be blank or whitespace-only',
    }),
  replace: z.string().max(MAX_TEXT_LENGTH),
  // Optional: restrict this replacement to an inclusive 1-based page range.
  pages: pageRange.optional(),
});

export const setCopiesOperation = z.object({
  type: z.literal('set_copies'),
  copies: z.number().int().min(1).max(MAX_COPIES),
});

export const operation = z.discriminatedUnion('type', [
  replaceTextOperation,
  setCopiesOperation,
]);

export const operationPlan = z.object({
  operations: z.array(operation).max(MAX_OPERATIONS),
});

export type Operation = z.infer<typeof operation>;
export type OperationPlan = z.infer<typeof operationPlan>;

export const SUPPORTED_OPERATIONS = ['replace_text', 'set_copies'] as const;

/**
 * PRINT OPTIONS (print metadata — NOT a document edit).
 *
 * These are the printer settings the customer can request in natural language.
 * They are deliberately SEPARATE from the document-edit `operationPlan` above:
 * the Document Engine only executes `replace_text`/`set_copies`, so print
 * options must never be sent to it. The agent captures them as a structured
 * PROPOSAL; the Backend validates them against the shop's real discovered
 * printer and the real printer adapter applies the supported ones. Every field
 * is optional — the agent only sets what the customer actually asked for.
 *
 * Allowed values mirror the Backend's print-settings schema
 * (backend/src/printing/printSettings.ts) and the local printer agent.
 */
export const printColorModes = ['color', 'monochrome'] as const;
export const printPaperSizes = ['A4', 'Letter', 'Legal'] as const;
export const printOrientations = ['portrait', 'landscape'] as const;
export const printSides = ['one-sided', 'two-sided-long-edge', 'two-sided-short-edge'] as const;

export const printOptions = z
  .object({
    printerId: z.string().min(1).max(256).optional(),
    copies: z.number().int().min(1).max(MAX_COPIES).optional(),
    colorMode: z.enum(printColorModes).optional(),
    paperSize: z.enum(printPaperSizes).optional(),
    orientation: z.enum(printOrientations).optional(),
    sides: z.enum(printSides).optional(),
  })
  .strict(); // reject unknown keys — allowlist only

export type PrintOptions = z.infer<typeof printOptions>;

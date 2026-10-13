/**
 * Shared types for the Strands Agent. Re-exports the zod operation schema and
 * defines the shapes exchanged with the Document Engine and the Backend.
 */
export {
  operation,
  operationPlan,
  replaceTextOperation,
  setCopiesOperation,
  printOptions,
  SUPPORTED_OPERATIONS,
  type Operation,
  type OperationPlan,
  type PrintOptions,
} from './schema.js';

/** Minimal shape of the Document Engine /process response the agent cares about. */
export interface ProcessResultLike {
  job_id: string;
  input_format: string;
  output_format: string;
  output_filename: string;
  changes: {
    copies: number;
    total_replacements: number;
    operations: Array<{ type: string; description: string; details: Record<string, unknown> }>;
    /** Which edit strategy produced the output: native_pdf | conversion | docx_direct. */
    strategy?: string;
  };
  /** Structural/layout validation report from the engine (safe to expose). */
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
}

/** What the agent returns to the Backend for one edit request. */
export interface AgentEditResult {
  /** True if the agent produced and executed a valid plan. */
  executed: boolean;
  /** Human-readable message for the end user (no internal tool details). */
  message: string;
  /** The validated plan, if one was produced. */
  plan?: import('./schema.js').OperationPlan;
  /** Document Engine result, if execution happened. */
  document?: ProcessResultLike;
  /** True when the agent needs the user to clarify an ambiguous instruction. */
  needsClarification?: boolean;
  /** Machine-readable error code when something failed. */
  errorCode?: string;
  /**
   * Structured PRINT OPTIONS the customer requested (print metadata). This is
   * the agent's PROPOSAL — the Backend validates + applies it against the real
   * printer. Omitted when the customer requested no print options.
   */
  printOptions?: import('./schema.js').PrintOptions;
  /**
   * True when the customer's instruction was PRINT-SETTINGS-ONLY: the agent
   * captured print options via set_print_options but performed NO document
   * edit (and no edit was requested). This is a SUCCESS, not a clarification —
   * the Backend should make the (unedited) document ready to preview + carry
   * the proposed settings, rather than treating it as NEEDS_CLARIFICATION.
   */
  printOptionsOnly?: boolean;
}

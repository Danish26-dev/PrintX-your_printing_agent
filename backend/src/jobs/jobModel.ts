import { persistJob, removeJob, loadAllJobs } from './jobPersistence.js';

/**
 * Job model + in-memory job store for the Backend control plane.
 *
 * A Job tracks one document through its lifecycle. The Backend keeps its own
 * job records (with opaque internal IDs) and its own copies of the input and
 * output files in storage. It never exposes filesystem paths; the frontend
 * only ever sees the job id and status.
 *
 * The store is in-memory for now (single-process dev). It is deliberately
 * behind a small interface so it can be replaced with a database later without
 * touching controllers.
 */

export type JobStatus =
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY_FOR_PREVIEW'
  | 'NEEDS_CLARIFICATION'
  // Printer-configuration lifecycle (real printer flow):
  | 'CONFIGURING_PRINTER' // agent is discovering/validating/applying settings
  | 'READY_FOR_APPROVAL' // settings verified + printer available; awaiting shopkeeper
  | 'APPROVED'
  | 'PRINT_SUBMITTED' // spooler accepted the job (NOT confirmed physically printed)
  | 'PRINT_COMMAND_SUBMITTED' // legacy alias of PRINT_SUBMITTED (kept for compatibility)
  | 'PRINTING'
  | 'PRINTED' // ONLY if physical completion is genuinely confirmed (not used yet)
  | 'DELETED'
  | 'PROCESSING_FAILED'
  | 'CONVERSION_FAILED'
  | 'PRINT_FAILED';

/**
 * Fine-grained lifecycle events, recorded in order on each job. These are a
 * truthful audit trail the frontend/shopkeeper UI can render. They never claim
 * a stage happened unless the service actually reached it.
 */
export type JobEventType =
  | 'CUSTOMER_SENT_JOB'
  | 'JOB_RECEIVED'
  | 'AGENT_ACKNOWLEDGED'
  | 'DOCUMENT_INSPECTION_STARTED'
  | 'DOCUMENT_INSPECTED'
  | 'OPERATION_PLAN_CREATED'
  | 'OPERATION_PLAN_VALIDATED'
  | 'DOCUMENT_EDIT_STARTED'
  | 'DOCUMENT_EDIT_COMPLETED'
  | 'PREVIEW_READY'
  | 'NEEDS_CLARIFICATION'
  // Printer-configuration events (real printer flow):
  | 'PRINTER_CONFIG_STARTED'
  | 'CHECKING_PRINTERS'
  | 'PRINTER_DETECTED'
  | 'NO_PRINTER_FOUND'
  | 'PREPARING_SETTINGS'
  | 'SETTING_APPLIED'
  | 'CONFIGURATION_VERIFIED'
  | 'WAITING_FOR_APPROVAL'
  | 'CUSTOMER_APPROVED'
  | 'PRINT_CONFIGURATION_CREATED'
  | 'PRINT_SUBMITTED'
  | 'PRINT_COMMAND_SUBMITTED'
  | 'PRINTING'
  | 'PRINTED'
  | 'PRINTER_UNAVAILABLE'
  | 'CLEANUP_STARTED'
  | 'CLEANUP_COMPLETED'
  | 'PROCESSING_FAILED'
  | 'CONVERSION_FAILED'
  | 'PRINT_FAILED'
  | 'CLEANUP_FAILED';

export interface JobEvent {
  type: JobEventType;
  at: string;
  /** Optional short, non-sensitive human detail. */
  detail?: string;
}

/** Print configuration — deliberately separate from document operations. */
export interface PrintConfig {
  printer: string;
  copies: number;
  paperSize: 'A4' | 'Letter' | 'Legal';
  colorMode: 'Color' | 'BlackAndWhite';
  orientation: 'Portrait' | 'Landscape';
  pageRange: string; // 'All' or e.g. '1-3,5'
  pagesPerSheet: 1 | 2 | 4;
  scale: string; // '100%' | 'Fit' | custom
}

export interface Job {
  id: string;
  status: JobStatus;
  originalFilename: string;
  inputFormat: string;
  outputFormat: string | null;
  instruction: string | null;
  copies: number;
  createdAt: string;
  updatedAt: string;
  error: { code: string; message: string } | null;
  /** Opaque storage keys — never returned to the client. */
  inputFileReference: string;
  outputFileReference: string | null;
  /** Last human-readable agent message (e.g. confirmation or clarification). */
  agentMessage: string | null;
  /** Summary of what the Document Engine changed (safe to expose). */
  changeSummary: Record<string, unknown> | null;
  /** Structural/layout validation report from the engine (safe to expose).
   *  Carries review_recommended + a structure comparison so the UI can warn
   *  honestly when a PDF edit may have altered layout. */
  validationReport: Record<string, unknown> | null;
  /** Ordered lifecycle event trail (truthful audit log). */
  events: JobEvent[];
  /** Legacy print configuration, created at approval/print time. */
  printConfig: PrintConfig | null;
  /** Validated strict print settings (real printer flow). Null until configured. */
  printSettings: PrintSettingsView | null;
  /** Live availability of the selected printer at configuration time. */
  printerStatus: string | null;
  /** Non-fatal warnings about the chosen settings (e.g. unverified duplex). */
  configWarnings: string[];
  /**
   * PRINT OPTIONS the AGENT proposed from the customer's natural-language
   * request (print metadata). All fields optional. This is the agent's
   * PROPOSAL only — it is validated + applied by configurePrinter against the
   * real printer. Distinct from the verified `printSettings` above. */
  proposedPrintSettings: ProposedPrintSettings | null;
  /**
   * Which printer adapter this job is configured against:
   *   'real' — the local-agent (real) adapter,
   *   'demo' — the explicit, clearly-labelled simulated adapter,
   *   null   — not yet chosen.
   * Set EXPLICITLY when the printer is configured. Never silently defaulted to
   * 'demo' — a real selection stays real even if no printer is found. */
  printerMode: PrinterMode;
}

/** Which adapter a job targets. */
export type PrinterMode = 'real' | 'demo' | null;

/**
 * The strict, validated print-settings shape stored on a job (mirror of the
 * backend printSettings schema; safe to expose to the shopkeeper UI).
 */
export interface PrintSettingsView {
  printerId: string;
  printerName?: string;
  copies: number;
  colorMode: 'color' | 'monochrome';
  paperSize: 'A4' | 'Letter' | 'Legal';
  orientation: 'portrait' | 'landscape';
  sides: 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge';
}

/** The agent's proposed print options (all optional; validated downstream). */
export interface ProposedPrintSettings {
  printerId?: string;
  copies?: number;
  colorMode?: 'color' | 'monochrome';
  paperSize?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  sides?: 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge';
}

/** Fields safe to return to the frontend (no storage keys, no paths). */
export interface JobView {
  id: string;
  status: JobStatus;
  originalFilename: string;
  inputFormat: string;
  outputFormat: string | null;
  instruction: string | null;
  copies: number;
  createdAt: string;
  updatedAt: string;
  error: { code: string; message: string } | null;
  agentMessage: string | null;
  changeSummary: Record<string, unknown> | null;
  validationReport: Record<string, unknown> | null;
  hasOutput: boolean;
  events: JobEvent[];
  printConfig: PrintConfig | null;
  printSettings: PrintSettingsView | null;
  printerStatus: string | null;
  configWarnings: string[];
  proposedPrintSettings: ProposedPrintSettings | null;
  printerMode: PrinterMode;
}

export function toView(job: Job): JobView {
  return {
    id: job.id,
    status: job.status,
    originalFilename: job.originalFilename,
    inputFormat: job.inputFormat,
    outputFormat: job.outputFormat,
    instruction: job.instruction,
    copies: job.copies,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    error: job.error,
    agentMessage: job.agentMessage,
    changeSummary: job.changeSummary,
    validationReport: job.validationReport,
    hasOutput: Boolean(job.outputFileReference),
    events: job.events,
    printConfig: job.printConfig,
    printSettings: job.printSettings,
    printerStatus: job.printerStatus,
    configWarnings: job.configWarnings,
    proposedPrintSettings: job.proposedPrintSettings,
    printerMode: job.printerMode,
  };
}

/** A subscriber receives the current JobView whenever a job changes. */
export type JobSubscriber = (view: JobView) => void;

export class JobStore {
  private jobs = new Map<string, Job>();
  /** Per-job SSE/event subscribers. Used to push live updates (Phase 5). */
  private subscribers = new Map<string, Set<JobSubscriber>>();

  /**
   * Subscribe to live updates for a job. Returns an unsubscribe function.
   * Emits are best-effort and never throw into the caller.
   */
  subscribe(id: string, fn: JobSubscriber): () => void {
    let set = this.subscribers.get(id);
    if (!set) {
      set = new Set();
      this.subscribers.set(id, set);
    }
    set.add(fn);
    return () => {
      const s = this.subscribers.get(id);
      if (s) {
        s.delete(fn);
        if (s.size === 0) this.subscribers.delete(id);
      }
    };
  }

  /** Notify subscribers of a job's current state. Never throws. */
  private emit(id: string): void {
    const set = this.subscribers.get(id);
    if (!set || set.size === 0) return;
    const job = this.jobs.get(id);
    if (!job) return;
    const view = toView(job);
    for (const fn of set) {
      try {
        fn(view);
      } catch {
        /* a bad subscriber must not break the store */
      }
    }
  }

  create(init: {
    id: string;
    originalFilename: string;
    inputFormat: string;
    inputFileReference: string;
    instruction?: string | null;
  }): Job {
    const now = new Date().toISOString();
    const job: Job = {
      id: init.id,
      status: 'UPLOADED',
      originalFilename: init.originalFilename,
      inputFormat: init.inputFormat,
      outputFormat: null,
      instruction: init.instruction ?? null,
      copies: 1,
      createdAt: now,
      updatedAt: now,
      error: null,
      inputFileReference: init.inputFileReference,
      outputFileReference: null,
      agentMessage: null,
      changeSummary: null,
      validationReport: null,
      events: [{ type: 'CUSTOMER_SENT_JOB', at: now }],
      printConfig: null,
      printSettings: null,
      printerStatus: null,
      configWarnings: [],
      proposedPrintSettings: null,
      printerMode: null,
    };
    this.jobs.set(job.id, job);
    this.emit(job.id);
    persistJob(job); // best-effort durable mirror (no-op unless enabled)
    return job;
  }

  /** Append a lifecycle event to a job (truthful audit trail). */
  addEvent(id: string, type: JobEventType, detail?: string): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    job.events.push({ type, at: new Date().toISOString(), ...(detail ? { detail } : {}) });
    job.updatedAt = new Date().toISOString();
    this.emit(id);
    persistJob(job);
    return job;
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  update(id: string, patch: Partial<Job>): Job | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    Object.assign(job, patch, { updatedAt: new Date().toISOString() });
    this.jobs.set(id, job);
    this.emit(id);
    persistJob(job);
    return job;
  }

  delete(id: string): void {
    this.jobs.delete(id);
    removeJob(id);
  }

  all(): Job[] {
    return [...this.jobs.values()];
  }

  /**
   * Repopulate the in-memory map from durable storage at startup (so jobs
   * survive a restart / new Cloud Run instance). Best-effort; no-op when
   * persistence is disabled. Does NOT emit (no subscribers exist yet at boot)
   * and does NOT re-persist (avoids a write storm on load).
   */
  async hydrate(): Promise<number> {
    const jobs = await loadAllJobs();
    for (const job of jobs) {
      if (job && typeof job.id === 'string') this.jobs.set(job.id, job);
    }
    return jobs.length;
  }
}

export const jobStore = new JobStore();

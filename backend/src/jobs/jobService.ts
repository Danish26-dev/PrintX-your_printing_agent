/**
 * Application-level job orchestration.
 *
 * This is the control plane logic: it creates jobs, stores files via the
 * StorageProvider, forwards work to the Strands Agent, records results, and
 * drives lifecycle transitions. It performs NO document manipulation.
 */
import { config } from '../config.js';
import { strandsAgent, AgentClientError } from '../clients/strandsAgentClient.js';
import { documentEngine, EngineClientError } from '../clients/documentEngineClient.js';
import type { StorageProvider } from '../storage/StorageProvider.js';
import { createStorageProvider } from '../storage/storageFactory.js';
import { jobStore, type Job, type PrintConfig, type PrintSettingsView } from './jobModel.js';
import { resolveShopId, jobBelongsToShop, PRINTX_LAB_SHOP_ID } from './shop.js';
import { newId, storageKey, checkFormat } from '../util/ids.js';
import { printerAdapter, buildPrintConfig, type PrinterAdapter } from '../printing/PrinterAdapter.js';
import { demoPrinterAdapter, DEMO_PRINTER_IDS } from '../printing/DemoPrinterAdapter.js';
import type { PrintSettings } from '../printing/printSettings.js';
import type { PrinterMode } from './jobModel.js';

export class JobServiceError extends Error {
  code: string;
  httpStatus: number;
  constructor(code: string, message: string, httpStatus = 400) {
    super(message);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class JobService {
  constructor(private storage: StorageProvider) {}

  /** Create a job from an uploaded file (no processing yet). */
  async createFromUpload(params: {
    fileBuffer: Buffer;
    originalFilename: string;
    mime: string;
    instruction?: string | null;
    /** Shop/channel to associate the job with (validated; defaults to PrintX Lab). */
    shopId?: string | null;
  }): Promise<Job> {
    const { fileBuffer, originalFilename, mime } = params;

    if (!fileBuffer || fileBuffer.length === 0) {
      throw new JobServiceError('EMPTY_FILE', 'The uploaded file is empty.', 400);
    }
    const fmt = checkFormat(originalFilename, mime);
    if (!fmt.ok) {
      throw new JobServiceError('UNSUPPORTED_FILE', fmt.reason ?? 'Unsupported file.', 415);
    }

    const jobId = newId('job_');
    const inputKey = storageKey(jobId, 'input', fmt.ext!);
    await this.storage.save(inputKey, fileBuffer);

    return jobStore.create({
      id: jobId,
      originalFilename,
      inputFormat: fmt.ext!,
      inputFileReference: inputKey,
      instruction: params.instruction ?? null,
      // Validate + default server-side (create() also resolves, but passing the
      // candidate keeps the intent explicit at the service boundary).
      shopId: resolveShopId(params.shopId ?? undefined),
    });
  }

  /**
   * Apply a natural-language instruction to a job's document via the agent,
   * then store the processed output and transition the job accordingly.
   */
  async applyInstruction(jobId: string, instruction: string): Promise<Job> {
    const job = jobStore.get(jobId);
    if (!job) throw new JobServiceError('JOB_NOT_FOUND', 'Job not found.', 404);

    // Guard against duplicate processing. A long PDF edit can make the browser
    // retry (or the user resend) while the first request is still running. If
    // the job is already PROCESSING, reject the second request instead of
    // launching a second full agent + Document Engine run on the same job.
    if (job.status === 'PROCESSING') {
      throw new JobServiceError(
        'ALREADY_PROCESSING',
        'This document is already being processed. Please wait for it to finish.',
        409,
      );
    }

    const trimmed = (instruction ?? '').trim();
    if (!trimmed) {
      throw new JobServiceError('MISSING_INSTRUCTION', 'An instruction is required.', 400);
    }
    if (trimmed.length > config.maxInstructionLength) {
      throw new JobServiceError('INSTRUCTION_TOO_LONG', 'The instruction is too long.', 400);
    }

    jobStore.update(jobId, { status: 'PROCESSING', instruction: trimmed, error: null });
    jobStore.addEvent(jobId, 'JOB_RECEIVED');
    jobStore.addEvent(jobId, 'AGENT_ACKNOWLEDGED');
    jobStore.addEvent(jobId, 'DOCUMENT_INSPECTION_STARTED');

    const inputBuffer = await this.storage.read(job.inputFileReference);

    let result;
    try {
      result = await strandsAgent.edit(inputBuffer, job.originalFilename, trimmed);
    } catch (err) {
      const code = err instanceof AgentClientError ? err.code : 'PROCESSING_FAILED';
      jobStore.addEvent(jobId, 'PROCESSING_FAILED', code);
      jobStore.update(jobId, {
        status: 'PROCESSING_FAILED',
        error: { code, message: 'The document could not be processed.' },
      });
      throw new JobServiceError(code, 'The document could not be processed.', 502);
    }

    // A TERMINAL agent/engine failure (e.g. PDF renderer unavailable) is a
    // real failure, NOT a clarification. Record a clean failed state so the job
    // never stays stuck and the frontend shows an actionable message.
    if (!result.executed && result.errorCode) {
      const terminalCode = result.errorCode;
      // scanned_pdf / unsupported stay as their own codes; renderer/conversion
      // problems map to CONVERSION_FAILED; anything else PROCESSING_FAILED.
      const status =
        terminalCode === 'libreoffice_unavailable' ? 'CONVERSION_FAILED' : 'PROCESSING_FAILED';
      jobStore.addEvent(jobId, status === 'CONVERSION_FAILED' ? 'CONVERSION_FAILED' : 'PROCESSING_FAILED', terminalCode);
      jobStore.update(jobId, {
        status,
        agentMessage: result.message || null,
        error: { code: terminalCode, message: result.message || 'The document could not be processed.' },
      });
      return jobStore.get(jobId)!;
    }

    // PRINT-SETTINGS-ONLY SUCCESS: the customer only changed print settings and
    // requested no document edit. There is no engine output, but this is NOT a
    // clarification — the agent fully understood the request. Make the ORIGINAL
    // (unedited) document ready to preview and carry the proposed settings so
    // the customer can review and send it to the shop. This is what prevents
    // the "proceed with just copies?" loop: the job advances to a real,
    // actionable state instead of NEEDS_CLARIFICATION.
    if (result.printOptionsOnly && result.printOptions && !result.document) {
      // MERGE the newly-proposed settings over any already-proposed on this job
      // so a follow-up like "change to 3 copies" keeps the earlier colour/paper
      // choices. Each agent turn is stateless, so the merge must happen here.
      const merged = { ...(job.proposedPrintSettings ?? {}), ...result.printOptions };

      // If the document was already edited earlier in this conversation, keep
      // that edited output; only reuse the input when there is no output yet.
      let outExt = (job.outputFormat || job.inputFormat).toLowerCase();
      let outputKey = job.outputFileReference;
      if (!outputKey) {
        outExt = job.inputFormat.toLowerCase();
        outputKey = storageKey(jobId, 'output', outExt);
        const inputBytes = await this.storage.read(job.inputFileReference);
        await this.storage.save(outputKey, inputBytes);
        jobStore.addEvent(jobId, 'DOCUMENT_INSPECTED');
      }
      jobStore.addEvent(jobId, 'PREVIEW_READY');
      jobStore.update(jobId, {
        status: 'READY_FOR_PREVIEW',
        outputFormat: outExt,
        outputFileReference: outputKey,
        copies: merged.copies ?? job.copies ?? 1,
        agentMessage: result.message,
        // Preserve any existing change summary (from a prior edit); only set a
        // no-op summary when there was never an edit.
        changeSummary:
          job.changeSummary ?? { copies: merged.copies ?? 1, total_replacements: 0, operations: [] },
        proposedPrintSettings: merged,
        error: null,
      });
      return jobStore.get(jobId)!;
    }

    // The agent asked for clarification (or nothing executed): do NOT mark ready.
    if (!result.executed || !result.document) {
      jobStore.addEvent(jobId, 'NEEDS_CLARIFICATION');
      jobStore.update(jobId, {
        status: 'NEEDS_CLARIFICATION',
        agentMessage: result.message || 'Please clarify your request.',
        // Preserve any print options already captured so they survive a
        // follow-up clarification round.
        proposedPrintSettings: result.printOptions ?? null,
      });
      return jobStore.get(jobId)!;
    }

    // The agent inspected, planned, validated and executed — record the trail.
    jobStore.addEvent(jobId, 'DOCUMENT_INSPECTED');
    jobStore.addEvent(jobId, 'OPERATION_PLAN_CREATED');
    jobStore.addEvent(jobId, 'OPERATION_PLAN_VALIDATED');
    jobStore.addEvent(jobId, 'DOCUMENT_EDIT_STARTED');

    // Pull the processed bytes from the Document Engine and store our own copy.
    const doc = result.document;
    let outputBuffer: Buffer;
    try {
      outputBuffer = await documentEngine.download(doc.job_id);
    } catch (err) {
      const code = err instanceof EngineClientError ? err.code : 'CONVERSION_FAILED';
      jobStore.addEvent(jobId, 'CONVERSION_FAILED', code);
      jobStore.update(jobId, {
        status: 'CONVERSION_FAILED',
        error: { code, message: 'The processed document could not be retrieved.' },
      });
      throw new JobServiceError(code, 'The processed document could not be retrieved.', 502);
    }

    // Validate the retrieved output is non-empty before trusting it.
    if (!outputBuffer || outputBuffer.length === 0) {
      jobStore.addEvent(jobId, 'CONVERSION_FAILED', 'empty_output');
      jobStore.update(jobId, {
        status: 'CONVERSION_FAILED',
        error: { code: 'EMPTY_OUTPUT', message: 'The processed document was empty.' },
      });
      throw new JobServiceError('EMPTY_OUTPUT', 'The processed document was empty.', 502);
    }

    const outExt = (doc.output_format || job.inputFormat).toLowerCase();
    const outputKey = storageKey(jobId, 'output', outExt);
    await this.storage.save(outputKey, outputBuffer);

    jobStore.addEvent(jobId, 'DOCUMENT_EDIT_COMPLETED');
    jobStore.addEvent(jobId, 'PREVIEW_READY');
    jobStore.update(jobId, {
      status: 'READY_FOR_PREVIEW',
      outputFormat: outExt,
      outputFileReference: outputKey,
      copies: doc.changes?.copies ?? 1,
      agentMessage: result.message,
      changeSummary: doc.changes as unknown as Record<string, unknown>,
      validationReport: (doc.validation ?? null) as unknown as Record<string, unknown> | null,
      // Store the agent's PROPOSED print options, MERGED over any already on
      // this job so a combined edit+settings turn (or a later change) never
      // drops previously-requested settings. Validated + applied later by
      // configurePrinter against the real printer — never auto-applied here.
      proposedPrintSettings: result.printOptions
        ? { ...(job.proposedPrintSettings ?? {}), ...result.printOptions }
        : job.proposedPrintSettings ?? null,
      error: null,
    });

    return jobStore.get(jobId)!;
  }

  /** Read the processed output bytes for preview/download. */
  async readOutput(jobId: string): Promise<{ buffer: Buffer; ext: string; job: Job }> {
    const job = jobStore.get(jobId);
    if (!job) throw new JobServiceError('JOB_NOT_FOUND', 'Job not found.', 404);
    if (!job.outputFileReference) {
      throw new JobServiceError('NO_OUTPUT', 'No processed document is available yet.', 409);
    }
    const buffer = await this.storage.read(job.outputFileReference);
    return { buffer, ext: job.outputFormat || job.inputFormat, job };
  }

  /**
   * Real shop job feed for PrintX Lab (the single MVP shop). Returns ACTUAL
   * jobs from the store — never fabricated. Excludes DELETED jobs. Most-recent
   * first. This is the smallest honest replacement for the old hardcoded
   * shopkeeper dashboard data.
   */
  listJobs(shopId: string = PRINTX_LAB_SHOP_ID): Job[] {
    const shop = resolveShopId(shopId);
    return jobStore
      .all()
      .filter((j) => j.status !== 'DELETED')
      // Associate every job with a shop: a job belongs to the queried shop when
      // its (resolved) shopId matches. Legacy jobs with no shopId resolve to
      // PrintX Lab, so they still appear for the single MVP shop.
      .filter((j) => jobBelongsToShop(j.shopId, shop))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  /**
   * Honest overview counts derived from real jobs. No revenue or fabricated
   * totals — only counts we can truthfully compute from the job store.
   */
  overview(shopId: string = PRINTX_LAB_SHOP_ID): {
    activeJobs: number;
    completedJobs: number;
    pendingJobs: number;
    failedJobs: number;
    totalJobs: number;
  } {
    const jobs = this.listJobs(shopId);
    const inFlight = new Set([
      'PROCESSING',
      'CONFIGURING_PRINTER',
      'READY_FOR_PREVIEW',
      'READY_FOR_APPROVAL',
      'APPROVED',
      'NEEDS_CLARIFICATION',
    ]);
    const completed = new Set(['PRINT_COMMAND_SUBMITTED', 'PRINT_SUBMITTED', 'PRINTED']);
    const failed = new Set(['PROCESSING_FAILED', 'CONVERSION_FAILED', 'PRINT_FAILED']);
    let activeJobs = 0;
    let completedJobs = 0;
    let pendingJobs = 0;
    let failedJobs = 0;
    for (const j of jobs) {
      if (j.status === 'UPLOADED') pendingJobs += 1;
      else if (inFlight.has(j.status)) activeJobs += 1;
      else if (completed.has(j.status)) completedJobs += 1;
      else if (failed.has(j.status)) failedJobs += 1;
    }
    return { activeJobs, completedJobs, pendingJobs, failedJobs, totalJobs: jobs.length };
  }

  approve(jobId: string): Job {
    const job = jobStore.get(jobId);
    if (!job) throw new JobServiceError('JOB_NOT_FOUND', 'Job not found.', 404);
    if (job.status !== 'READY_FOR_PREVIEW') {
      throw new JobServiceError('INVALID_STATE', 'The job is not ready to approve.', 409);
    }
    jobStore.addEvent(jobId, 'CUSTOMER_APPROVED');
    return jobStore.update(jobId, { status: 'APPROVED' })!;
  }

  /**
   * Submit a print command for an approved job via the PrinterAdapter.
   *
   * HONEST LIFECYCLE: because there is no real printer integration, the adapter
   * reports PRINT_COMMAND_SUBMITTED and we stop there. We do NOT advance to
   * PRINTING/PRINTED, because nothing can confirm physical printing. The job's
   * document operations are already done; this only concerns print settings.
   */
  /**
   * PHASE: CONFIGURING_PRINTER -> READY_FOR_APPROVAL.
   *
   * The agent PROPOSES print settings; this deterministic code discovers real
   * printers, validates the proposal against them (allowlist + capabilities),
   * checks the selected printer is actually available, and records the verified
   * settings + any warnings. It emits a truthful event per step so the live
   * activity panel reflects REAL operations. It NEVER submits here, and NEVER
   * reports configuration success on failure. The document is preserved on
   * failure so the job can be retried.
   *
   * @param proposed the agent-proposed settings (untrusted; validated here)
   */
  /**
   * Pick the adapter for a job's EXPLICIT mode. Demo jobs use the simulated
   * demo adapter; everything else uses the real/null adapter. This is the only
   * place the two adapters are chosen between — there is NO silent fallback
   * from real to demo.
   */
  private adapterForJob(job: Job): PrinterAdapter {
    return job.printerMode === 'demo' ? demoPrinterAdapter : printerAdapter;
  }

  /**
   * Resolve the printer mode for a configure request. The mode is EXPLICIT:
   *   - caller passes mode: 'demo' | 'real', OR
   *   - the proposed printerId is the demo id -> 'demo',
   *   - otherwise the CONFIGURED default (config.defaultPrinterMode).
   *
   * The default is 'real' in production (preserving the guarantee of no silent
   * real->demo fallback on a discovery failure). A hardware-free demo
   * deployment sets DEFAULT_PRINTER_MODE=demo so a customer "send to print
   * shop" with no device selected uses the simulated demo adapter. This is an
   * explicit, env-gated choice — NOT a fallback inferred from a failure.
   */
  private resolveMode(proposedObj: Record<string, unknown>, requested?: PrinterMode): PrinterMode {
    if (requested === 'demo' || requested === 'real') return requested;
    // Recognise ANY demo device id (there can be more than one selectable demo
    // printer), not only the primary one.
    if (typeof proposedObj.printerId === 'string' && DEMO_PRINTER_IDS.has(proposedObj.printerId)) return 'demo';
    return config.defaultPrinterMode;
  }

  async configurePrinter(jobId: string, proposed: unknown, requestedMode?: PrinterMode): Promise<Job> {
    const job = jobStore.get(jobId);
    if (!job) throw new JobServiceError('JOB_NOT_FOUND', 'Job not found.', 404);
    // Must have an approved, processed document to configure printing for.
    if (job.status !== 'APPROVED' && job.status !== 'PRINT_FAILED') {
      throw new JobServiceError(
        'INVALID_STATE',
        'The document must be approved before configuring the printer.',
        409,
      );
    }
    if (!job.outputFileReference) {
      throw new JobServiceError('NO_OUTPUT', 'There is no processed document to print.', 409);
    }

    // Resolve + record the EXPLICIT adapter mode for this job up front.
    const proposedObj = (proposed ?? {}) as Record<string, unknown>;
    const mode = this.resolveMode(proposedObj, requestedMode);
    jobStore.update(jobId, { status: 'CONFIGURING_PRINTER', error: null, configWarnings: [], printerMode: mode });
    jobStore.addEvent(jobId, 'PRINTER_CONFIG_STARTED', mode === 'demo' ? 'demo' : 'real');
    const adapter = this.adapterForJob(jobStore.get(jobId)!);

    // 1. Discover printers via the SELECTED adapter (real agent or demo).
    jobStore.addEvent(jobId, 'CHECKING_PRINTERS');
    const printers = await adapter.discover();
    if (printers.length === 0) {
      jobStore.addEvent(jobId, 'NO_PRINTER_FOUND');
      jobStore.update(jobId, {
        status: 'PRINT_FAILED',
        error: {
          code: 'NO_PRINTER',
          message:
            'No printers were found. Make sure the PrintX local printer agent is running on the ' +
            'shop computer and a printer is installed.',
        },
      });
      throw new JobServiceError('NO_PRINTER', 'No printers were found.', 502);
    }

    // 2. Validate the agent-proposed settings against the real printers.
    // If no printerId was proposed, default to the discovered default printer
    // (or the first one) so the customer flow does not need to know ids.
    jobStore.addEvent(jobId, 'PREPARING_SETTINGS');
    if (!proposedObj.printerId) {
      const def = printers.find((p) => p.isDefault) ?? printers[0];
      if (def) proposedObj.printerId = def.id;
    }
    const validation = adapter.validateSettings(proposedObj, printers);
    if (!validation.ok || !validation.value) {
      const detail = validation.errors.join('; ');
      jobStore.addEvent(jobId, 'PRINT_FAILED', `invalid_configuration: ${detail}`.slice(0, 180));
      jobStore.update(jobId, {
        status: 'PRINT_FAILED',
        error: { code: 'INVALID_PRINT_CONFIG', message: `Invalid print configuration: ${detail}` },
      });
      throw new JobServiceError('INVALID_PRINT_CONFIG', `Invalid print configuration: ${detail}`, 400);
    }
    const settings = validation.value;
    const printer = printers.find((p) => p.id === settings.printerId);
    jobStore.addEvent(jobId, 'PRINTER_DETECTED', printer?.name);

    // Emit a per-setting "applied" event (verified against the chosen printer).
    for (const [key, value] of Object.entries({
      printer: printer?.name ?? settings.printerId,
      copies: settings.copies,
      colorMode: settings.colorMode,
      paperSize: settings.paperSize,
      orientation: settings.orientation,
      sides: settings.sides,
    })) {
      jobStore.addEvent(jobId, 'SETTING_APPLIED', `${key}=${value}`);
    }

    // 3. Confirm the selected printer is actually available right now.
    const availability = await adapter.checkAvailability(settings.printerId);
    if (!availability.available) {
      jobStore.addEvent(jobId, 'PRINTER_UNAVAILABLE', availability.status);
      jobStore.update(jobId, {
        status: 'PRINT_FAILED',
        printerStatus: availability.status,
        error: {
          code: 'PRINTER_UNAVAILABLE',
          message: `The selected printer is not available (${availability.status}). Check its power and connection, then retry.`,
        },
      });
      throw new JobServiceError('PRINTER_UNAVAILABLE', 'The selected printer is not available.', 502);
    }

    // 4. Verified — record settings + warnings and wait for shopkeeper approval.
    const settingsView: PrintSettingsView = { ...settings, printerName: printer?.name };
    jobStore.addEvent(jobId, 'CONFIGURATION_VERIFIED');
    jobStore.addEvent(jobId, 'PRINT_CONFIGURATION_CREATED');
    jobStore.addEvent(jobId, 'WAITING_FOR_APPROVAL');
    return jobStore.update(jobId, {
      status: 'READY_FOR_APPROVAL',
      printSettings: settingsView,
      printerStatus: availability.status,
      configWarnings: validation.warnings,
      copies: settings.copies,
      error: null,
    })!;
  }

  /**
   * PHASE: READY_FOR_APPROVAL -> PRINT_SUBMITTED (after explicit approval).
   *
   * Submits the APPROVED job's processed document to the printer via the local
   * agent. Idempotent against duplicate clicks: once a job is past
   * READY_FOR_APPROVAL it will not submit again. A success means the spooler
   * ACCEPTED the job (PRINT_SUBMITTED) — NOT that paper physically printed, so
   * we never set PRINTED here. On failure the job + document are preserved and
   * the job returns to a retryable failed state.
   */
  async submitPrint(jobId: string): Promise<Job> {
    const job = jobStore.get(jobId);
    if (!job) throw new JobServiceError('JOB_NOT_FOUND', 'Job not found.', 404);

    // DUPLICATE-SUBMIT GUARD: only submit from READY_FOR_APPROVAL. Repeated
    // clicks (which leave the job in PRINT_SUBMITTED) are rejected safely.
    if (job.status === 'PRINT_SUBMITTED' || job.status === 'PRINT_COMMAND_SUBMITTED') {
      throw new JobServiceError('ALREADY_SUBMITTED', 'This job has already been submitted to the printer.', 409);
    }
    if (job.status !== 'READY_FOR_APPROVAL') {
      throw new JobServiceError('INVALID_STATE', 'The print configuration must be verified before printing.', 409);
    }
    if (!job.printSettings) {
      throw new JobServiceError('INVALID_STATE', 'No verified print settings are available.', 409);
    }
    if (!job.outputFileReference) {
      throw new JobServiceError('NO_OUTPUT', 'There is no processed document to print.', 409);
    }

    jobStore.addEvent(jobId, 'CUSTOMER_APPROVED');

    const settings: PrintSettings = {
      printerId: job.printSettings.printerId,
      copies: job.printSettings.copies,
      colorMode: job.printSettings.colorMode,
      paperSize: job.printSettings.paperSize,
      orientation: job.printSettings.orientation,
      sides: job.printSettings.sides,
    };

    const outputBytes = await this.storage.read(job.outputFileReference);
    // Submit via the SAME adapter the job was configured with (real or demo).
    const result = await this.adapterForJob(job).submitSettings(settings, outputBytes);

    if (!result.ok) {
      const code =
        result.state === 'PRINTER_UNAVAILABLE'
          ? 'PRINTER_UNAVAILABLE'
          : result.state === 'PRINTER_ADAPTER_UNAVAILABLE'
            ? 'PRINTER_ADAPTER_UNAVAILABLE'
            : result.state === 'INVALID_CONFIG'
              ? 'INVALID_PRINT_CONFIG'
              : 'PRINT_FAILED';
      jobStore.addEvent(jobId, result.state === 'PRINTER_UNAVAILABLE' ? 'PRINTER_UNAVAILABLE' : 'PRINT_FAILED', code);
      // Preserve the document + settings so the shopkeeper can retry.
      jobStore.update(jobId, { status: 'PRINT_FAILED', error: { code, message: result.message } });
      throw new JobServiceError(code, result.message, 502);
    }

    // Honest stop point: the spooler accepted the job. Physical completion is
    // not observable, so we report PRINT_SUBMITTED, NOT PRINTED.
    jobStore.addEvent(jobId, 'PRINT_SUBMITTED', result.note);
    return jobStore.update(jobId, { status: 'PRINT_SUBMITTED' })!;
  }

  /**
   * PHASE 5 — "Test Agent Configuration" (document-free).
   *
   * Runs the real configuration steps (discover -> validate -> availability)
   * through the EXPLICITLY selected adapter (real or demo) using a fixed test
   * configuration, and returns a structured, ordered step list the dashboard
   * can replay the cursor against. It NEVER edits a document, NEVER submits a
   * print, and (for a real printer) NEVER sends anything to the spooler. Every
   * step reflects a REAL adapter result — nothing is fabricated.
   *
   * @param mode 'real' | 'demo' — the explicit adapter to test.
   */
  async testConfiguration(mode: PrinterMode): Promise<{
    ok: boolean;
    mode: 'real' | 'demo';
    isDemo: boolean;
    printer: PrintSettingsView | null;
    steps: Array<{ field: string; label: string; value?: string | number }>;
    warnings: string[];
    error: { code: string; message: string } | null;
  }> {
    const resolved: 'real' | 'demo' = mode === 'demo' ? 'demo' : 'real';
    const adapter: PrinterAdapter = resolved === 'demo' ? demoPrinterAdapter : printerAdapter;
    const steps: Array<{ field: string; label: string; value?: string | number }> = [];
    const isDemo = resolved === 'demo';

    // The fixed test configuration (Phase 5): 2 / monochrome / A4 / portrait /
    // two-sided. The agent does NOT touch any document.
    const testConfig = {
      copies: 2,
      colorMode: 'monochrome' as const,
      paperSize: 'A4' as const,
      orientation: 'portrait' as const,
      sides: 'two-sided-long-edge' as const,
    };

    steps.push({ field: 'printer', label: 'Checking available printers' });
    const printers = await adapter.discover();
    if (printers.length === 0) {
      return {
        ok: false,
        mode: resolved,
        isDemo,
        printer: null,
        steps,
        warnings: [],
        error: {
          code: 'NO_PRINTER',
          message: isDemo
            ? 'The demo printer is unavailable.'
            : 'No printers were found. Make sure the PrintX local printer agent is running and a printer is installed.',
        },
      };
    }

    const def = printers.find((p) => p.isDefault) ?? printers[0];
    const proposed = { ...testConfig, printerId: def.id };
    const validation = adapter.validateSettings(proposed, printers);
    if (!validation.ok || !validation.value) {
      return {
        ok: false,
        mode: resolved,
        isDemo,
        printer: null,
        steps,
        warnings: validation.warnings,
        error: { code: 'INVALID_PRINT_CONFIG', message: validation.errors.join('; ') },
      };
    }

    const s = validation.value;
    const printer = printers.find((p) => p.id === s.printerId);
    for (const [field, value] of [
      ['printer', printer?.name ?? s.printerId],
      ['copies', s.copies],
      ['color', s.colorMode],
      ['paper', s.paperSize],
      ['layout', s.orientation],
      ['sides', s.sides],
    ] as Array<[string, string | number]>) {
      steps.push({ field, label: `Applied ${field}`, value });
    }

    const availability = await adapter.checkAvailability(s.printerId);
    if (!availability.available) {
      return {
        ok: false,
        mode: resolved,
        isDemo,
        printer: { ...s, printerName: printer?.name },
        steps,
        warnings: validation.warnings,
        error: {
          code: 'PRINTER_UNAVAILABLE',
          message: `The selected printer is not available (${availability.status}).`,
        },
      };
    }

    steps.push({ field: 'verify', label: 'Configuration verified' });
    return {
      ok: true,
      mode: resolved,
      isDemo,
      printer: { ...s, printerName: printer?.name },
      steps,
      warnings: validation.warnings,
      error: null,
    };
  }

  /**
   * LEGACY one-shot print (kept for backward compatibility with the original
   * /print route + demo). Configures then submits in one call. New flows should
   * use configurePrinter() + submitPrint() for the approval gate.
   */
  async startPrint(jobId: string, overrides: Partial<PrintConfig> = {}): Promise<Job> {
    const job = jobStore.get(jobId);
    if (!job) throw new JobServiceError('JOB_NOT_FOUND', 'Job not found.', 404);
    if (job.status !== 'APPROVED') {
      throw new JobServiceError('INVALID_STATE', 'The job must be approved before printing.', 409);
    }
    // Map legacy overrides into the strict settings schema using the default
    // printer when none is specified.
    const printers = await printerAdapter.discover();
    const defaultPrinter = printers.find((p) => p.isDefault) ?? printers[0];
    const proposed = {
      printerId: overrides.printer ?? defaultPrinter?.id,
      copies: overrides.copies ?? job.copies ?? 1,
      colorMode: overrides.colorMode === 'Color' ? 'color' : 'monochrome',
      paperSize: overrides.paperSize ?? 'A4',
      orientation: overrides.orientation === 'Landscape' ? 'landscape' : 'portrait',
      sides: 'one-sided',
    };
    await this.configurePrinter(jobId, proposed);
    return this.submitPrint(jobId);
  }

  /**
   * Idempotent, safe, logged cleanup of a job's stored files. Marks DELETED.
   * Only the stored bytes are removed; the job record is retained for auditing
   * (status becomes DELETED).
   */
  async cleanup(jobId: string): Promise<Job> {
    const job = jobStore.get(jobId);
    if (!job) throw new JobServiceError('JOB_NOT_FOUND', 'Job not found.', 404);

    jobStore.addEvent(jobId, 'CLEANUP_STARTED');
    try {
      if (job.inputFileReference) {
        await this.storage.delete(job.inputFileReference);
      }
      if (job.outputFileReference) {
        await this.storage.delete(job.outputFileReference);
      }
    } catch (err) {
      // Cleanup must be honest: if deletion fails, say so rather than claiming
      // the files were removed.
      jobStore.addEvent(jobId, 'CLEANUP_FAILED');
      jobStore.update(jobId, {
        error: { code: 'CLEANUP_FAILED', message: 'Some temporary files could not be removed.' },
      });
      throw new JobServiceError('CLEANUP_FAILED', 'Some temporary files could not be removed.', 500);
    }

    // eslint-disable-next-line no-console
    console.log(`[cleanup] removed files for job ${jobId}`);
    jobStore.addEvent(jobId, 'CLEANUP_COMPLETED');
    return jobStore.update(jobId, {
      status: 'DELETED',
      inputFileReference: '',
      outputFileReference: null,
    })!;
  }
}

export const jobService = new JobService(createStorageProvider());

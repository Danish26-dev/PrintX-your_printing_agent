/**
 * Job lifecycle API — the surface the frontend consumes.
 *
 * Endpoints:
 *   POST /api/files/upload         upload a file, create a job (no processing)
 *   POST /api/jobs                 upload + instruction in one call (convenience)
 *   GET  /api/jobs/:id             job view
 *   GET  /api/jobs/:id/status      job status (lightweight)
 *   POST /api/jobs/:id/instruction apply an instruction to an existing job
 *   GET  /api/jobs/:id/preview     stream the processed document (inline)
 *   GET  /api/jobs/:id/download    stream the processed document (attachment)
 *   POST /api/jobs/:id/approve     mark READY_FOR_PREVIEW -> APPROVED
 *   POST /api/jobs/:id/print       APPROVED -> PRINTING (no fake completion)
 *   DELETE /api/jobs/:id           cleanup stored files (idempotent) -> DELETED
 *
 * Job IDs are validated before use. No filesystem paths are ever exposed.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { jobService } from '../jobs/jobService.js';
import { jobStore, toView, type JobView } from '../jobs/jobModel.js';
import { printerAdapter } from '../printing/PrinterAdapter.js';
import { DEMO_PRINTER, DEMO_PRINTERS } from '../printing/DemoPrinterAdapter.js';
import { requireShopkeeper } from '../middleware/requireShopkeeper.js';
import { PRINTX_LAB_SHOP_ID, resolveShopId } from '../jobs/shop.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

const router = Router();

const JOB_ID = /^job_[a-f0-9]{32}$/;

function requireValidJobId(req: Request, res: Response): string | null {
  const id = req.params.id;
  if (!JOB_ID.test(id)) {
    res.status(400).json({ error: { code: 'INVALID_JOB_ID', message: 'Invalid job id.' } });
    return null;
  }
  return id;
}

const contentType = (ext: string): string =>
  ext === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// A safe, ASCII download filename derived from the job id + format (never the
// user's raw filename used as a path).
const outputName = (id: string, ext: string) => `printx_${id}.${ext}`;

/** POST /api/files/upload — create a job from a file. */
router.post('/files/upload', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: { code: 'MISSING_FILE', message: 'A file is required.' } });
      return;
    }
    const job = await jobService.createFromUpload({
      fileBuffer: req.file.buffer,
      originalFilename: req.file.originalname || 'upload',
      mime: req.file.mimetype || '',
      instruction: null,
      // Associate with the selected shop (validated; defaults to PrintX Lab).
      shopId: resolveShopId(req.body?.shopId),
    });
    res.status(201).json({ job: toView(job) });
  } catch (err) {
    next(err);
  }
});

/** POST /api/jobs — upload + optional instruction; processes if instruction given. */
router.post('/jobs', upload.single('file'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: { code: 'MISSING_FILE', message: 'A file is required.' } });
      return;
    }
    const instruction = (req.body?.instruction ?? '').toString();
    const job = await jobService.createFromUpload({
      fileBuffer: req.file.buffer,
      originalFilename: req.file.originalname || 'upload',
      mime: req.file.mimetype || '',
      instruction: instruction || null,
      // Associate with the selected shop (validated; defaults to PrintX Lab).
      shopId: resolveShopId(req.body?.shopId),
    });

    if (instruction.trim()) {
      const processed = await jobService.applyInstruction(job.id, instruction);
      res.status(201).json({ job: toView(processed) });
      return;
    }
    res.status(201).json({ job: toView(job) });
  } catch (err) {
    next(err);
  }
});

/** GET /api/jobs/:id */
router.get('/jobs/:id', (req: Request, res: Response) => {
  const id = requireValidJobId(req, res);
  if (!id) return;
  const job = jobStore.get(id);
  if (!job) {
    res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found.' } });
    return;
  }
  res.json({ job: toView(job) });
});

/**
 * GET /api/jobs/:id/events — Server-Sent Events stream of live job updates.
 *
 * The shopkeeper activity panel subscribes here to receive the job view (with
 * its truthful event trail + status) each time it changes — no polling needed.
 * Polling GET /api/jobs/:id remains available as a fallback.
 */
router.get('/jobs/:id/events', (req: Request, res: Response) => {
  const id = requireValidJobId(req, res);
  if (!id) return;
  const job = jobStore.get(id);
  if (!job) {
    res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found.' } });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering
  res.flushHeaders?.();

  const send = (view: JobView) => {
    res.write(`event: job\ndata: ${JSON.stringify(view)}\n\n`);
  };

  // Send the current state immediately so late subscribers are in sync.
  send(toView(job));

  const unsubscribe = jobStore.subscribe(id, send);

  // Keep-alive comments so proxies/load-balancers don't drop the connection.
  const keepAlive = setInterval(() => {
    res.write(`: keep-alive ${Date.now()}\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
    res.end();
  });
});

/** GET /api/jobs/:id/status */
router.get('/jobs/:id/status', (req: Request, res: Response) => {
  const id = requireValidJobId(req, res);
  if (!id) return;
  const job = jobStore.get(id);
  if (!job) {
    res.status(404).json({ error: { code: 'JOB_NOT_FOUND', message: 'Job not found.' } });
    return;
  }
  res.json({ id: job.id, status: job.status, updatedAt: job.updatedAt });
});

/** POST /api/jobs/:id/instruction */
router.post('/jobs/:id/instruction', async (req: Request, res: Response, next: NextFunction) => {
  const id = requireValidJobId(req, res);
  if (!id) return;
  try {
    const instruction = (req.body?.instruction ?? '').toString();
    const job = await jobService.applyInstruction(id, instruction);
    res.json({ job: toView(job) });
  } catch (err) {
    next(err);
  }
});

async function streamOutput(req: Request, res: Response, next: NextFunction, disposition: 'inline' | 'attachment') {
  const id = requireValidJobId(req, res);
  if (!id) return;
  try {
    const { buffer, ext } = await jobService.readOutput(id);
    res.setHeader('Content-Type', contentType(ext));
    res.setHeader('Content-Disposition', `${disposition}; filename="${outputName(id, ext)}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

/** GET /api/jobs/:id/preview */
router.get('/jobs/:id/preview', (req, res, next) => streamOutput(req, res, next, 'inline'));

/** GET /api/jobs/:id/download */
router.get('/jobs/:id/download', (req, res, next) => streamOutput(req, res, next, 'attachment'));

/**
 * POST /api/jobs/:id/approve — PUBLIC (customer action).
 * This is the customer confirming THEIR OWN edited document and sending it to
 * the shop (READY_FOR_PREVIEW -> APPROVED). It commands no hardware and reveals
 * nothing; the shopkeeper-gated steps are configure-printer + submit-print.
 * Kept public so the customer workflow is not broken.
 */
router.post('/jobs/:id/approve', (req: Request, res: Response, next: NextFunction) => {
  const id = requireValidJobId(req, res);
  if (!id) return;
  try {
    res.json({ job: toView(jobService.approve(id)) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/jobs/:id/configure-printer — APPROVED -> READY_FOR_APPROVAL.
 * Body: { settings: { printerId, copies, colorMode, paperSize, orientation, sides } }
 * The agent proposes `settings`; the Backend discovers real printers, validates
 * against them, checks availability, and records verified settings + warnings.
 * It does NOT submit. (Shopkeeper-authorized action.)
 */
// NOTE: configure-printer is PUBLIC (customer action), like /approve. It is the
// customer handing their APPROVED document to PrintX Lab and having the print
// settings VERIFIED against the shop's printer. It commands NO physical
// hardware — it only validates settings and moves the job to
// READY_FOR_APPROVAL. The genuinely shop-only, hardware-touching steps
// (submit-print, legacy print, delete) remain requireShopkeeper. Gating this
// step broke the customer's "send to print shop" flow with a 401.
router.post('/jobs/:id/configure-printer', async (req: Request, res: Response, next: NextFunction) => {
  const id = requireValidJobId(req, res);
  if (!id) return;
  try {
    const proposed = req.body?.settings ?? req.body ?? {};
    // Explicit adapter mode: 'demo' | 'real'. Never inferred from a failure.
    const rawMode = (req.body?.mode ?? '').toString();
    const mode = rawMode === 'demo' ? 'demo' : rawMode === 'real' ? 'real' : undefined;
    const job = await jobService.configurePrinter(id, proposed, mode);
    res.json({ job: toView(job) });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/jobs/:id/submit-print — READY_FOR_APPROVAL -> PRINT_SUBMITTED.
 * Requires explicit shopkeeper approval (this endpoint IS that approval).
 * Idempotent against duplicate clicks (ALREADY_SUBMITTED after the first).
 */
router.post('/jobs/:id/submit-print', requireShopkeeper, async (req: Request, res: Response, next: NextFunction) => {
  const id = requireValidJobId(req, res);
  if (!id) return;
  try {
    const job = await jobService.submitPrint(id);
    res.json({
      job: toView(job),
      note:
        'Print job submitted to the printer spooler. Physical completion is not observable, so the ' +
        'job is reported as submitted, not printed.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/jobs/:id/print — LEGACY one-shot (configure + submit). Kept for
 * backward compatibility; the approval-gated flow uses configure-printer then
 * submit-print.
 */
router.post('/jobs/:id/print', requireShopkeeper, async (req: Request, res: Response, next: NextFunction) => {
  const id = requireValidJobId(req, res);
  if (!id) return;
  try {
    const overrides = (req.body && typeof req.body === 'object') ? req.body : {};
    const job = await jobService.startPrint(id, overrides);
    res.json({
      job: toView(job),
      note:
        'Print job submitted to the printer spooler. Physical completion is not observable, so the ' +
        'job is reported as submitted, not printed.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/printers — real printer discovery via the local printer agent.
 * Returns the actual printers the agent reports (empty if no agent / offline).
 * `realPrinting` = a real agent is configured; `agentReachable` = reachable now.
 * Never fabricates a device.
 */
router.get('/printers', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [printers, agentReachable] = await Promise.all([
      printerAdapter.discover(),
      printerAdapter.agentReachable(),
    ]);
    res.json({
      printers,
      realPrinting: printerAdapter.isReal(),
      agentReachable,
      // The explicit, clearly-labelled DEMO devices the shopkeeper can select
      // when no physical hardware is available. These are NOT fabricated real
      // printers — the frontend labels them DEMO and selecting one uses the demo
      // adapter explicitly (never a silent fallback). `demoPrinters` is the full
      // list; `demoPrinter` is kept (= the first/default) for backward
      // compatibility with any existing caller.
      demoPrinters: DEMO_PRINTERS.map((p) => ({ ...p, isDemo: true })),
      demoPrinter: { ...DEMO_PRINTER, isDemo: true },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/printers/test — run a document-free configuration test through the
 * EXPLICITLY selected adapter (body: { mode: 'real' | 'demo' }). Validates the
 * fixed test config against the chosen printer and returns ordered steps for
 * the cursor to replay. Never edits a document, never submits a print.
 */
router.post('/printers/test', requireShopkeeper, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawMode = (req.body?.mode ?? '').toString();
    const mode = rawMode === 'demo' ? 'demo' : 'real';
    const result = await jobService.testConfiguration(mode);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/jobs/:id — cleanup (destructive: removes stored files).
 * Shopkeeper-authorized to prevent an anonymous caller from destroying another
 * job's documents by guessing ids.
 */
router.delete('/jobs/:id', requireShopkeeper, async (req: Request, res: Response, next: NextFunction) => {
  const id = requireValidJobId(req, res);
  if (!id) return;
  try {
    res.json({ job: toView(await jobService.cleanup(id)) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/shop/jobs — real job feed for PrintX Lab (the single MVP shop).
 * Returns ACTUAL jobs from the store (never fabricated). This is the honest
 * replacement for the old hardcoded shopkeeper dashboard data.
 */
router.get('/shop/jobs', requireShopkeeper, (_req: Request, res: Response, next: NextFunction) => {
  try {
    // The dashboard queries the single MVP shop. listJobs filters by this shop
    // id so every PrintX Lab job (including legacy jobs with no stored shopId)
    // is returned, and the wrapper shopId matches each job's own shopId.
    const shopId = PRINTX_LAB_SHOP_ID;
    res.json({ shopId, jobs: jobService.listJobs(shopId).map(toView) });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/shop/overview — honest counts derived from real jobs. No revenue or
 * fabricated totals.
 */
router.get('/shop/overview', requireShopkeeper, (_req: Request, res: Response, next: NextFunction) => {
  try {
    const shopId = PRINTX_LAB_SHOP_ID;
    res.json({ shopId, overview: jobService.overview(shopId) });
  } catch (err) {
    next(err);
  }
});

export default router;

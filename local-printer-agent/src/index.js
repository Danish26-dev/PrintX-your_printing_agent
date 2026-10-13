// PrintX Local Printer Agent — runs on the shopkeeper's machine.
//
// WHY: a browser and a cloud/container Backend cannot reliably control a local
// USB/network printer. This small local service is the trust boundary that can.
// The PrintX Backend calls it over localhost (or LAN) to discover printers,
// check availability, validate a configuration, and submit an APPROVED job.
//
// SECURITY:
//   - Binds to 127.0.0.1 by default (localhost only).
//   - Requires a shared token (PRINTER_AGENT_TOKEN) on every request if set.
//   - Exposes ONLY these allowlisted operations. There is NO generic shell or
//     "run command" endpoint. Nothing from a request is executed as a command.
//   - The PDF to print is received as base64 in the submit body; it is written
//     to a temp file, spooled, and deleted. Document bytes are never logged.

import express from 'express';
import cors from 'cors';
import { discoverPrinters, findPrinter, submitPrintJob, PrinterAgentError } from './windowsPrinter.js';
import { validatePrintConfig } from './printConfig.js';

const PORT = parseInt(process.env.PRINTER_AGENT_PORT ?? '7777', 10);
const HOST = process.env.PRINTER_AGENT_HOST ?? '127.0.0.1';
const TOKEN = (process.env.PRINTER_AGENT_TOKEN ?? '').trim(); // optional shared secret
const MAX_PDF_BYTES = parseInt(process.env.PRINTER_AGENT_MAX_PDF_BYTES ?? String(50 * 1024 * 1024), 10);

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '80mb' })); // base64 PDF inflates ~33%

// Shared-token auth. If PRINTER_AGENT_TOKEN is set, every request must carry it
// as `x-printer-agent-token`. If unset, we only accept localhost connections.
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (TOKEN) {
    if (req.get('x-printer-agent-token') !== TOKEN) {
      return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or missing agent token.' } });
    }
    return next();
  }
  // No token configured: only allow loopback callers.
  const ip = req.ip || req.socket.remoteAddress || '';
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return next();
  return res.status(401).json({
    error: { code: 'UNAUTHORIZED', message: 'Non-local request rejected (set PRINTER_AGENT_TOKEN to allow).' },
  });
});

app.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'local-printer-agent', platform: process.platform });
});

/** GET /printers — real discovery. */
app.get('/printers', async (_req, res) => {
  try {
    const { printers, defaultPrinter } = await discoverPrinters();
    res.json({ ok: true, printers, defaultPrinter });
  } catch (err) {
    const code = err instanceof PrinterAgentError ? err.code : 'DISCOVERY_FAILED';
    res.status(502).json({ ok: false, error: { code, message: 'Printer discovery failed.' } });
  }
});

/** GET /printers/:id/availability — is this specific printer available now? */
app.get('/printers/:id/availability', async (req, res) => {
  try {
    const printer = await findPrinter(req.params.id);
    if (!printer) {
      return res.json({ ok: true, available: false, status: 'not_found' });
    }
    res.json({ ok: true, available: printer.status !== 'offline', status: printer.status, printer });
  } catch (err) {
    const code = err instanceof PrinterAgentError ? err.code : 'DISCOVERY_FAILED';
    res.status(502).json({ ok: false, error: { code, message: 'Availability check failed.' } });
  }
});

/** POST /validate — validate a proposed config against discovered printers. */
app.post('/validate', async (req, res) => {
  try {
    const { printers } = await discoverPrinters();
    const result = validatePrintConfig(req.body?.config, printers);
    res.json(result);
  } catch (err) {
    const code = err instanceof PrinterAgentError ? err.code : 'DISCOVERY_FAILED';
    res.status(502).json({ ok: false, errors: ['Could not validate against discovered printers.'], code });
  }
});

/**
 * POST /print — submit an APPROVED job.
 * Body: { config: {...}, documentBase64: string }
 * The Backend is responsible for enforcing approval BEFORE calling this.
 */
app.post('/print', async (req, res) => {
  const { config, documentBase64 } = req.body || {};
  if (typeof documentBase64 !== 'string' || documentBase64.length === 0) {
    return res.status(400).json({ ok: false, state: 'BAD_REQUEST', message: 'documentBase64 is required.' });
  }
  let pdfBytes;
  try {
    pdfBytes = Buffer.from(documentBase64, 'base64');
  } catch {
    return res.status(400).json({ ok: false, state: 'BAD_REQUEST', message: 'documentBase64 is not valid base64.' });
  }
  if (pdfBytes.length === 0 || pdfBytes.length > MAX_PDF_BYTES) {
    return res.status(400).json({ ok: false, state: 'BAD_REQUEST', message: 'Document is empty or too large.' });
  }

  // Re-validate the config against currently discovered printers — never trust
  // the caller to have validated, and never execute anything from free text.
  let printers = [];
  try {
    ({ printers } = await discoverPrinters());
  } catch {
    return res.status(502).json({ ok: false, state: 'PRINTER_ADAPTER_UNAVAILABLE', message: 'Printer discovery failed; cannot submit.' });
  }
  const v = validatePrintConfig(config, printers);
  if (!v.ok) {
    return res.status(400).json({ ok: false, state: 'INVALID_CONFIG', message: 'Invalid print configuration.', errors: v.errors });
  }

  const result = await submitPrintJob(pdfBytes, v.value);
  const httpStatus = result.ok ? 200 : 502;
  res.status(httpStatus).json(result);
});

app.listen(PORT, HOST, () => {
  // Never log document contents or secrets.
  // eslint-disable-next-line no-console
  console.log(`PrintX Local Printer Agent listening on http://${HOST}:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`Token auth: ${TOKEN ? 'enabled' : 'disabled (localhost-only)'}`);
});

export default app;

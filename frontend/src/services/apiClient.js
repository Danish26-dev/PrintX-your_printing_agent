// Centralized API client for the PrintX Backend.
//
// This is the ONLY place the frontend talks to the Backend. Components and
// higher-level services (fileService, chatService) go through this layer.
//
// The frontend never calls the Strands Agent, the Document Engine, Bedrock, or
// AWS directly. It only calls the Backend control plane.

const BASE_URL = (process.env.REACT_APP_API_BASE_URL || 'http://localhost:3001').replace(/\/+$/, '');

/** Maps backend error codes to human-readable, non-leaking UI messages. */
const ERROR_MESSAGES = {
  UNSUPPORTED_FILE:
    "This file type isn't supported yet. PrintsX currently supports DOCX and digital PDF files.",
  scanned_pdf:
    'This PDF appears to be scanned or image-based. PrintsX currently supports editable digital PDFs.',
  SCANNED_PDF:
    'This PDF appears to be scanned or image-based. PrintsX currently supports editable digital PDFs.',
  EMPTY_FILE: 'That file appears to be empty. Please choose a valid document.',
  MISSING_FILE: 'Please choose a file to upload.',
  MISSING_INSTRUCTION: 'Please type what you would like PrintsX to change.',
  INSTRUCTION_TOO_LONG: 'That instruction is a bit too long. Please shorten it and try again.',
  PROCESSING_FAILED: "We couldn't prepare this document. Please try again.",
  CONVERSION_FAILED: "We couldn't convert this document. Please try again.",
  AGENT_TIMEOUT: 'PrintsX is taking longer than expected. Please try again.',
  AGENT_UNREACHABLE: 'PrintsX is temporarily unavailable. Please try again shortly.',
  AGENT_FAILURE: "PrintsX couldn't process the instruction right now. Please try again.",
  AGENT_BAD_RESPONSE: "PrintsX couldn't process the instruction right now. Please try again.",
  ENGINE_TIMEOUT: 'PrintsX is taking longer than expected. Please try again.',
  ENGINE_UNREACHABLE: 'PrintsX is temporarily unavailable. Please try again shortly.',
  ENGINE_DOWNLOAD_FAILED: "We couldn't retrieve the processed document. Please try again.",
  NO_OUTPUT: 'No processed document is available yet.',
  EMPTY_OUTPUT: "The processed document came back empty. Please try again.",
  ALREADY_PROCESSING:
    'This document is still being prepared. Please wait a moment before sending another change.',
  JOB_NOT_FOUND: "We couldn't find that document. It may have expired.",
  INVALID_JOB_ID: "We couldn't find that document. It may have expired.",
  INVALID_STATE: 'That action is not available for this document right now.',
  BAD_OUTPUT_FORMAT: 'That output format is not supported.',
  // Document-engine validation / content errors
  TEXT_NOT_FOUND: "We couldn't find the text you asked us to change.",
  output_validation_failed: 'The edited document failed our quality check, so we did not keep it.',
  DOCUMENT_EDIT_UNSUPPORTED: 'That change is not something PrintsX can safely make to this document.',
  // Agent / Bedrock (honest, sanitized)
  AGENT_MISCONFIGURED: "PrintsX's AI service is not configured correctly right now.",
  BEDROCK_ACCESS_DENIED: "PrintsX's AI service is temporarily unavailable.",
  BEDROCK_MODEL_UNAVAILABLE: "PrintsX's AI service is temporarily unavailable.",
  BEDROCK_AUTH_FAILED: "PrintsX's AI service is temporarily unavailable.",
  BEDROCK_THROTTLED: "PrintsX's AI service is busy. Please try again shortly.",
  BEDROCK_NO_CREDENTIALS: "PrintsX's AI service is temporarily unavailable.",
  // Printing (honest)
  PRINTER_UNAVAILABLE: 'The selected printer is currently unavailable.',
  PRINT_FAILED: 'The print command could not be submitted. Please try again.',
  INVALID_PRINT_CONFIG: 'The print settings are invalid. Please review and try again.',
  CLEANUP_FAILED: 'Some temporary files could not be removed.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  NETWORK: 'Cannot reach PrintsX right now. Check your connection and try again.',
};

/** Error thrown by the API client with a friendly message + machine code. */
export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code || 'UNKNOWN';
    this.status = status;
  }
}

function friendly(code, fallback) {
  return ERROR_MESSAGES[code] || fallback || 'Something went wrong. Please try again.';
}

// Shopkeeper credentials for shopkeeper-only endpoints. Two mechanisms:
//   1. Firebase ID token (PRODUCTION): set at runtime after Google sign-in and
//      sent as `Authorization: Bearer <idToken>`. The backend verifies it with
//      the Admin SDK. This is the primary, secure path.
//   2. Shared token (CI / simple hosted): REACT_APP_SHOPKEEPER_API_TOKEN or a
//      runtime setter, sent as `x-shopkeeper-token`. Fallback only.
// Neither is ever logged.
let SHOPKEEPER_TOKEN = (process.env.REACT_APP_SHOPKEEPER_API_TOKEN || '').trim();
let FIREBASE_ID_TOKEN = '';
// An ON-DEMAND provider that returns a FRESH Firebase ID token (or '').
// Registered by firebaseAuth at startup. This is the fix for the dashboard
// 401 race: the dashboard mounts and polls before the onIdTokenChanged
// listener has pushed the token into FIREBASE_ID_TOKEN after a reload, and the
// cached token also expires after ~1h. Fetching on demand guarantees every
// shopkeeper request carries a currently-valid token.
let FIREBASE_TOKEN_PROVIDER = null;
export function setShopkeeperToken(token) {
  SHOPKEEPER_TOKEN = (token || '').trim();
}
/** Set (or clear) the current Firebase ID token for shopkeeper requests. */
export function setFirebaseIdToken(token) {
  FIREBASE_ID_TOKEN = (token || '').trim();
}
/**
 * Register an async getter that returns a fresh Firebase ID token (or '').
 * Called once by firebaseAuth. Lets the apiClient obtain a valid token even
 * when the cached one isn't set yet (post-reload race) or has expired.
 */
export function setFirebaseTokenProvider(fn) {
  FIREBASE_TOKEN_PROVIDER = typeof fn === 'function' ? fn : null;
}

/** Resolve the best available Firebase ID token: cached first, else on demand. */
async function resolveFirebaseToken() {
  if (FIREBASE_ID_TOKEN) return FIREBASE_ID_TOKEN;
  if (FIREBASE_TOKEN_PROVIDER) {
    try {
      const t = (await FIREBASE_TOKEN_PROVIDER()) || '';
      if (t) FIREBASE_ID_TOKEN = t.trim();
      return FIREBASE_ID_TOKEN;
    } catch {
      return '';
    }
  }
  return '';
}

/**
 * Headers for a shopkeeper-only request (prefers the Firebase ID token).
 * ASYNC: it will fetch a fresh token on demand when none is cached, closing the
 * post-reload race where the dashboard polled before the token was restored.
 */
async function shopkeeperHeaders(extra = {}) {
  const h = { ...extra };
  const token = await resolveFirebaseToken();
  if (token) h.Authorization = `Bearer ${token}`;
  if (SHOPKEEPER_TOKEN) h['x-shopkeeper-token'] = SHOPKEEPER_TOKEN;
  return h;
}

async function toApiError(response) {
  let code = 'INTERNAL_ERROR';
  try {
    const body = await response.json();
    const err = body && body.error ? body.error : body;
    if (err && (err.code || err.message)) {
      code = err.code || code;
    }
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(code, friendly(code), response.status);
}

// Client-side request timeout. This is the OUTERMOST tier of the timeout
// hierarchy and is deliberately LARGER than the backend's own agent budget
// (default 180s) so the browser never aborts a legitimate long PDF edit before
// the backend can return a structured result/error. It only exists so the UI
// does not hang forever if the backend becomes unreachable mid-request.
const DEFAULT_TIMEOUT_MS = Number(process.env.REACT_APP_REQUEST_TIMEOUT_MS) || 320000;

async function request(path, { method = 'GET', body, headers, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, { method, body, headers, signal: controller.signal });
  } catch (err) {
    // An abort means we hit the client-side ceiling (backend unresponsive).
    // Everything else is a network/CORS/connection failure. Never surface raw
    // details in either case.
    if (err && err.name === 'AbortError') {
      throw new ApiError('AGENT_TIMEOUT', friendly('AGENT_TIMEOUT'));
    }
    throw new ApiError('NETWORK', friendly('NETWORK'));
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response;
}

export const api = {
  baseUrl: BASE_URL,

  async health() {
    return request('/api/health');
  },

  /** Upload a file and (optionally) an instruction in one call → { job }. */
  async createJob(file, instruction, shopId) {
    const form = new FormData();
    form.append('file', file);
    if (instruction) form.append('instruction', instruction);
    // Shop/channel association (validated + defaulted server-side to PrintX Lab).
    if (shopId) form.append('shopId', shopId);
    const data = await request('/api/jobs', { method: 'POST', body: form });
    return data.job;
  },

  /** Upload a file without processing → { job } in UPLOADED state. */
  async uploadFile(file, shopId) {
    const form = new FormData();
    form.append('file', file);
    if (shopId) form.append('shopId', shopId);
    const data = await request('/api/files/upload', { method: 'POST', body: form });
    return data.job;
  },

  async getJob(jobId) {
    const data = await request(`/api/jobs/${jobId}`);
    return data.job;
  },

  async getStatus(jobId) {
    return request(`/api/jobs/${jobId}/status`);
  },

  async sendInstruction(jobId, instruction) {
    const data = await request(`/api/jobs/${jobId}/instruction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction }),
    });
    return data.job;
  },

  async approve(jobId) {
    const data = await request(`/api/jobs/${jobId}/approve`, { method: 'POST' });
    return data.job;
  },

  /**
   * Configure the printer for an APPROVED job (real printer flow).
   * `settings` is the strict schema { printerId, copies, colorMode, paperSize,
   * orientation, sides }. The Backend validates against discovered printers and
   * moves the job to READY_FOR_APPROVAL (or PRINT_FAILED). Returns the job.
   */
  async configurePrinter(jobId, settings, mode) {
    const data = await request(`/api/jobs/${jobId}/configure-printer`, {
      method: 'POST',
      headers: await shopkeeperHeaders({ 'Content-Type': 'application/json' }),
      // `mode` is the EXPLICIT adapter choice ('real' | 'demo'); omitted lets
      // the backend infer from the printerId (demo id => demo).
      body: JSON.stringify(mode ? { settings, mode } : { settings }),
    });
    return data.job;
  },

  /**
   * Run a document-free "Test Agent Configuration" through the EXPLICITLY
   * selected adapter. `mode` is 'real' | 'demo'. Returns the structured step
   * list + result (never edits a document, never submits a print).
   */
  async testConfiguration(mode) {
    return request('/api/printers/test', {
      method: 'POST',
      headers: await shopkeeperHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ mode }),
    });
  },

  /**
   * Submit an approved+configured job to the printer (READY_FOR_APPROVAL ->
   * PRINT_SUBMITTED). This IS the explicit shopkeeper approval to print.
   * Returns { job, note }.
   */
  async submitPrint(jobId) {
    return request(`/api/jobs/${jobId}/submit-print`, {
      method: 'POST',
      headers: await shopkeeperHeaders(),
    });
  },

  /** LEGACY one-shot print (configure + submit). Kept for compatibility. */
  async print(jobId, printConfig) {
    return request(`/api/jobs/${jobId}/print`, {
      method: 'POST',
      headers: await shopkeeperHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(printConfig || {}),
    });
  },

  /** URL for the SSE live-events stream of a job (used by the activity panel). */
  eventsUrl(jobId) {
    return `${BASE_URL}/api/jobs/${jobId}/events`;
  },

  /** List printers known to the Backend (via the local printer agent, if any). */
  async listPrinters() {
    return request('/api/printers');
  },

  /** Real job feed for PrintX Lab (shopkeeper view). → { shopId, jobs }. */
  async shopJobs() {
    return request('/api/shop/jobs', { headers: await shopkeeperHeaders() });
  },

  /** Honest shopkeeper overview counts derived from real jobs. */
  async shopOverview() {
    return request('/api/shop/overview', { headers: await shopkeeperHeaders() });
  },

  async cleanup(jobId) {
    const data = await request(`/api/jobs/${jobId}`, { method: 'DELETE', headers: await shopkeeperHeaders() });
    return data.job;
  },

  /** Direct URLs for browser-native preview/download of the processed output. */
  previewUrl(jobId) {
    return `${BASE_URL}/api/jobs/${jobId}/preview`;
  },
  downloadUrl(jobId) {
    return `${BASE_URL}/api/jobs/${jobId}/download`;
  },

  /** Fetch the processed output as a Blob (for object-URL preview/download). */
  async fetchOutputBlob(jobId, kind = 'download') {
    const path = kind === 'preview' ? `/api/jobs/${jobId}/preview` : `/api/jobs/${jobId}/download`;
    const response = await request(path);
    return response.blob();
  },
};

export default api;

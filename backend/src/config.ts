/**
 * Backend configuration, resolved from environment variables (.env.example).
 * No credentials and no service URLs are hardcoded here; everything is
 * environment-driven so the system works locally and in containers.
 */
import dotenv from 'dotenv';

dotenv.config();

export interface BackendConfig {
  port: number;
  strandsAgentUrl: string;
  documentEngineUrl: string;
  storageDir: string;
  /** Job store backend: 'memory' (default; dev/tests) | 'firestore' (durable). */
  jobStore: 'memory' | 'firestore';
  /** File storage backend: 'local' (default; dev/tests) | 'gcs' (durable). */
  storageBackend: 'local' | 'gcs';
  /** GCS bucket for documents (required when storageBackend === 'gcs'). */
  gcsBucket: string;
  /** Firestore collection for jobs. */
  firestoreCollection: string;
  /** Google Cloud project id (for Firestore/GCS/Firebase Admin). Optional:
   *  the client libraries also infer it from ADC on Cloud Run. */
  googleCloudProject: string;
  /** Firebase project id for ID-token verification (defaults to the GCP project). */
  firebaseProjectId: string;
  /** Comma-separated allowlist of shopkeeper emails authorized for the dashboard. */
  shopkeeperAllowlist: string[];
  /**
   * Shopkeeper auth mode:
   *   'firebase' — verify Firebase ID tokens (PRODUCTION).
   *   'token'    — shared x-shopkeeper-token header (CI / simple hosted).
   *   'none'     — guard disabled (LOCAL DEV / tests ONLY; must be explicit).
   * Default is derived: 'firebase' if an allowlist/project is configured,
   * 'token' if a shared token is set, else 'none'. */
  authMode: 'firebase' | 'token' | 'none';
  maxUploadBytes: number;
  maxInstructionLength: number;
  maxCopies: number;
  agentTimeoutMs: number;
  engineTimeoutMs: number;
  corsOrigin: string;
  /** URL of the LOCAL printer agent on the shopkeeper machine (empty = none). */
  printerAgentUrl: string;
  /** Optional shared token the local printer agent requires. */
  printerAgentToken: string;
  /** Timeout for calls to the local printer agent. */
  printerAgentTimeoutMs: number;
  /**
   * Optional shared token that gates shopkeeper-only printer-control endpoints
   * (configure-printer, submit-print, print, shop feeds). When set, those
   * endpoints require the `x-shopkeeper-token` header. When empty (local dev),
   * the guard is disabled — a documented MVP limitation.
   */
  shopkeeperApiToken: string;
}

const stripSlash = (u: string) => u.replace(/\/+$/, '');

/**
 * Resolve the shopkeeper auth mode. An EXPLICIT AUTH_MODE always wins. When it
 * is unset we derive a SAFE default: if a Firebase project + allowlist is
 * configured, require Firebase; else if a shared token is set, use token; else
 * 'none' (local dev). Production deployments set AUTH_MODE=firebase explicitly.
 */
function resolveAuthMode(): 'firebase' | 'token' | 'none' {
  const raw = (process.env.AUTH_MODE ?? '').trim().toLowerCase();
  if (raw === 'firebase' || raw === 'token' || raw === 'none') return raw;
  const hasFirebase =
    Boolean((process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? '').trim()) &&
    Boolean((process.env.SHOPKEEPER_ALLOWLIST ?? '').trim());
  if (hasFirebase) return 'firebase';
  if ((process.env.SHOPKEEPER_API_TOKEN ?? '').trim()) return 'token';
  return 'none';
}

export const config: BackendConfig = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  strandsAgentUrl: stripSlash(process.env.STRANDS_AGENT_URL ?? 'http://localhost:4000'),
  documentEngineUrl: stripSlash(process.env.DOCUMENT_ENGINE_URL ?? 'http://localhost:5001'),
  storageDir: process.env.STORAGE_DIR ?? './_storage',
  jobStore: (process.env.JOB_STORE ?? 'memory').trim() === 'firestore' ? 'firestore' : 'memory',
  storageBackend: (process.env.STORAGE_BACKEND ?? 'local').trim() === 'gcs' ? 'gcs' : 'local',
  gcsBucket: (process.env.GCS_BUCKET ?? '').trim(),
  firestoreCollection: (process.env.FIRESTORE_COLLECTION ?? 'jobs').trim() || 'jobs',
  googleCloudProject: (process.env.GOOGLE_CLOUD_PROJECT ?? '').trim(),
  firebaseProjectId: (process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT ?? '').trim(),
  shopkeeperAllowlist: (process.env.SHOPKEEPER_ALLOWLIST ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  authMode: resolveAuthMode(),
  maxUploadBytes: parseInt(process.env.MAX_UPLOAD_BYTES ?? String(50 * 1024 * 1024), 10),
  maxInstructionLength: parseInt(process.env.MAX_INSTRUCTION_LENGTH ?? '2000', 10),
  maxCopies: parseInt(process.env.MAX_COPIES ?? '999', 10),
  // Backend -> Agent budget. This MUST sit ABOVE the agent's entire round-trip
  // (Gemini planning calls + Document Engine inspect/process, which includes a
  // cold LibreOffice start of ~20-30s on first PDF edit, plus bounded 429
  // backoff). It is deliberately larger than the agent's own Agent->Engine
  // process timeout (default 100s) so the INNER layer fails first with a
  // specific error instead of the backend aborting generically. Hierarchy:
  //   engine convert (90s) < agent->engine (100s) < backend->agent (180s).
  agentTimeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS ?? '180000', 10),
  // Backend -> Engine is only a processed-file download; 120s is ample.
  engineTimeoutMs: parseInt(process.env.ENGINE_TIMEOUT_MS ?? '120000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  // Local printer agent (runs on the shopkeeper machine). Empty by default: the
  // backend then honestly reports no real printer instead of fabricating one.
  printerAgentUrl: stripSlash(process.env.PRINTER_AGENT_URL ?? ''),
  printerAgentToken: (process.env.PRINTER_AGENT_TOKEN ?? '').trim(),
  printerAgentTimeoutMs: parseInt(process.env.PRINTER_AGENT_TIMEOUT_MS ?? '20000', 10),
  shopkeeperApiToken: (process.env.SHOPKEEPER_API_TOKEN ?? '').trim(),
};

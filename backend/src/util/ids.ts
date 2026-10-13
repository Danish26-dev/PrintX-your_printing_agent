/**
 * Safe identifier generation and file-format helpers.
 *
 * All IDs are opaque hex tokens. User-supplied filenames are NEVER used as
 * storage keys or filesystem paths — only for display (originalFilename).
 */
import { randomBytes } from 'node:crypto';

export function newId(prefix = ''): string {
  return prefix + randomBytes(16).toString('hex');
}

const ALLOWED_EXT = new Set(['docx', 'pdf']);

const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
  'application/pdf', // .pdf
  'application/octet-stream', // some browsers send this; extension is the real check
]);

export interface FormatCheck {
  ok: boolean;
  ext?: 'docx' | 'pdf';
  reason?: string;
}

/** Validate an upload by extension (authoritative) and MIME (advisory). */
export function checkFormat(filename: string, mime: string): FormatCheck {
  const dot = filename.lastIndexOf('.');
  const ext = dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
  if (!ALLOWED_EXT.has(ext)) {
    return { ok: false, reason: `Unsupported file type. Only .docx and .pdf are allowed.` };
  }
  if (mime && !ALLOWED_MIME.has(mime)) {
    // Advisory only: reject obviously wrong types but tolerate generic ones.
    if (mime.startsWith('image/') || mime.startsWith('text/html')) {
      return { ok: false, reason: `File content type '${mime}' is not allowed.` };
    }
  }
  return { ok: true, ext: ext as 'docx' | 'pdf' };
}

/** A safe storage key for an internal file, derived only from generated IDs. */
export function storageKey(jobId: string, role: 'input' | 'output', ext: string): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin';
  return `${jobId}_${role}.${safeExt}`;
}

// Real file service — talks to the Backend through the API client.
// The frontend only uploads the file and displays what the Backend returns.
// It does NOT parse, convert, or edit documents.

import { api, ApiError } from './apiClient';

/**
 * Upload a file to the Backend and create a real job (no instruction yet).
 * Returns a UI-friendly object that preserves the shape the existing
 * components expect (id/name/size/type/status), plus the real backend job.
 */
export const uploadFile = async (file, shopId) => {
  // Associate the job with the selected shop (PrintX Lab). The backend
  // validates + defaults this; sending it keeps the customer job on the same
  // channel the shopkeeper dashboard queries.
  const job = await api.createJob(file, undefined, shopId); // UPLOADED (no instruction)

  // Build a client-side object URL from the ACTUAL uploaded bytes so the
  // "Uploaded" preview tab can render the real document (PDF/image) the user
  // just picked. The Backend streams only the PROCESSED output, so the
  // original upload is previewed locally from the File object itself.
  // The caller owns this URL and must revoke it when the file is replaced or
  // the view unmounts (see Workspace.jsx) to avoid leaking blob URLs.
  let previewUrl = null;
  try {
    previewUrl = URL.createObjectURL(file);
  } catch {
    previewUrl = null; // non-fatal: the card/fallback still renders
  }

  return {
    // Keep fields the existing UI already reads:
    id: job.id, // REAL backend job id (source of truth) — replaces fake Date.now()
    name: job.originalFilename || file.name,
    size: file.size,
    type: file.type,
    uploadedAt: job.createdAt,
    status: job.status, // real backend status (e.g. UPLOADED)
    // Local object URL for previewing the ORIGINAL uploaded document.
    previewUrl,
    // Backend-backed extras:
    jobId: job.id,
    inputFormat: job.inputFormat,
  };
};

/**
 * Ask the Backend to process an instruction against an existing job.
 * Returns the updated real job.
 */
export const processInstruction = async (jobId, instruction) => {
  return api.sendInstruction(jobId, instruction);
};

export const getJob = async (jobId) => api.getJob(jobId);

export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

export { ApiError };

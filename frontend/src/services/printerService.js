// Printer status via the Backend, which talks to the local printer agent.
//
// HONESTY: this never fabricates a connected printer. It reads the Backend's
// /api/printers response, which reflects whatever the local printer agent
// reports. If the local agent is not running, `realPrinting` is false and the
// status is reported as unknown/offline — not a fake "online".

import { api } from './apiClient';

export const STATUS_LABELS = {
  online: 'online',
  offline: 'offline',
  unknown: 'unknown',
};

/**
 * Return the current default/first printer status for the shopkeeper header.
 * Shape: { name, status, real, printers }
 * - real: whether a real local printer agent is connected
 * - never throws; returns a safe "unknown" status on error.
 */
export async function getPrinterStatus() {
  try {
    const data = await api.listPrinters(); // { printers, realPrinting }
    const printers = Array.isArray(data.printers) ? data.printers : [];
    const def = printers.find((p) => p.isDefault) || printers[0] || null;
    return {
      name: def ? def.name : 'No printer detected',
      status: def ? def.status : 'unknown',
      real: Boolean(data.realPrinting),
      printers,
    };
  } catch {
    return { name: 'Printer agent offline', status: 'unknown', real: false, printers: [] };
  }
}

/** List all discovered printers (real). Empty array if none / agent offline. */
export async function listPrinters() {
  try {
    const data = await api.listPrinters();
    return {
      printers: Array.isArray(data.printers) ? data.printers : [],
      real: Boolean(data.realPrinting),
    };
  } catch {
    return { printers: [], real: false };
  }
}

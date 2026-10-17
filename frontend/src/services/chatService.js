// Real chat/instruction service — turns the chat into a faithful representation
// of the real Backend job state. NO fake AI responses, NO fake job ids, NO fake
// edited documents, NO fake print/deletion.
//
// The Backend (control plane) → Strands Agent (reasoning) → Document Engine
// (deterministic editing) pipeline does all the work. This service only sends
// the instruction and maps the returned job state into chat messages.

import { api } from './apiClient';

/**
 * Build the AI-side chat message that reflects the REAL job returned by the
 * Backend after an instruction. Never invents success.
 */
export function messageFromJob(job) {
  const base = {
    id: `job-${job.id}-${Date.now()}`,
    type: 'ai',
    timestamp: new Date().toISOString(),
    jobStatus: job.status,
    jobId: job.id,
  };

  switch (job.status) {
    case 'READY_FOR_PREVIEW': {
      // Honest layout note: when the engine flags that the edit may have
      // altered the document's layout (e.g. a PDF that had to go through the
      // conversion fallback and reflowed), tell the user plainly. We never
      // claim the original layout was preserved when it was not.
      const vr = job.validationReport || {};
      const baseText = job.agentMessage || 'Your document is ready to preview.';
      const layoutNote =
        vr.review_recommended
          ? '\n\nNote: this edit may have changed the document’s layout or page count. ' +
            'Please review the preview carefully before printing.'
          : '';
      return {
        ...base,
        // The agent's own human-readable confirmation (from the real Backend).
        text: baseText + layoutNote,
        reviewRecommended: Boolean(vr.review_recommended),
        editedDoc: {
          jobId: job.id,
          name: `printx_${job.id}.${job.outputFormat || job.inputFormat}`,
          outputFormat: job.outputFormat || job.inputFormat,
          copies: job.copies,
          // The agent's proposed print options (colour/paper/orientation/sides/
          // copies/printer) parsed from the customer's request — carried so the
          // "send to print shop" step can forward them to the real printer.
          proposedPrintSettings: job.proposedPrintSettings || null,
          previewUrl: api.previewUrl(job.id),
          downloadUrl: api.downloadUrl(job.id),
          isEdited: true,
        },
      };
    }

    case 'NEEDS_CLARIFICATION':
      return {
        ...base,
        // The agent's real clarifying question. Keeps the conversation alive.
        text: job.agentMessage || 'Could you clarify your request?',
        needsClarification: true,
      };

    case 'PROCESSING_FAILED':
    case 'CONVERSION_FAILED':
      return {
        ...base,
        text:
          (job.error && job.error.message) ||
          "We couldn't prepare this document. Please try again.",
        isError: true,
      };

    default:
      return {
        ...base,
        text: `Document status: ${job.status}.`,
      };
  }
}

/** Send an instruction for a real job; returns the updated real job. */
export async function sendInstruction(jobId, instruction) {
  return api.sendInstruction(jobId, instruction);
}

/** Approve a real job (READY_FOR_PREVIEW -> APPROVED). */
export async function approveJob(jobId) {
  return api.approve(jobId);
}

/**
 * Send an APPROVED job to PrintX Lab for printer configuration. The customer
 * does NOT submit the print; the Backend validates settings against the real
 * printer and moves the job to READY_FOR_APPROVAL, where the shopkeeper gives
 * the final approval. `settings` is optional; the Backend fills sensible
 * defaults using the discovered default printer when printerId is omitted.
 */
export async function sendToPrintShop(jobId, settings, mode) {
  // Start from minimal safe defaults, then OVERLAY the agent's proposal (the
  // print options it parsed from the customer's natural-language request, e.g.
  // "black and white, A4, portrait, double-sided"). Only fields the customer
  // actually asked for are present in `settings`, so defaults fill the rest.
  // printerId is left undefined unless the agent set it -> Backend uses the
  // shop's default printer. The Backend still validates everything against the
  // chosen (real or demo) printer and reports anything unsupported.
  const proposed = {
    copies: 1,
    colorMode: 'monochrome',
    paperSize: 'A4',
    orientation: 'portrait',
    sides: 'one-sided',
    ...(settings || {}),
  };
  // `mode` is the EXPLICIT adapter choice ('real' | 'demo') from the shopkeeper's
  // selected device. Passed through so a demo selection runs the demo adapter.
  return api.configurePrinter(jobId, proposed, mode);
}

/** LEGACY one-shot print. Returns { job, note }. Kept for compatibility. */
export async function printJob(jobId) {
  return api.print(jobId);
}

/** The initial system welcome shown before any shop is selected. */
export const getWelcomeMessage = () => ({
  id: 'welcome',
  type: 'system',
  text:
    '👋 Welcome to PrintsX!\n\nSelect a print shop, upload a DOCX or digital PDF, and tell PrintsX what to change in plain language.\n\nPrintsX prepares your document and shows you a preview before printing.',
  timestamp: new Date().toISOString(),
});

/** Message shown right after a real upload succeeds. */
export const getUploadedMessage = (job) => ({
  id: `uploaded-${job.id}`,
  type: 'ai',
  text:
    "I've received your document. Tell me what you'd like to change — for example, " +
    '"Replace John with Jane and make 3 copies."',
  timestamp: new Date().toISOString(),
  jobStatus: job.status,
  jobId: job.id,
});

// ============================================================================
// CONVERSATION STATE MACHINE
// ============================================================================
//
// The chat has ONE real backend job at a time. The customer's follow-up
// messages must be interpreted according to the job's CURRENT workflow state —
// not blindly re-sent to the document-editing agent. Without this, a message
// like "proceed" (which has no find/replace target) makes the agent re-inspect
// the document and ask "what do you want to change?", looping forever.
//
// This classifier is PURE (no network) and keeps document-edit operations
// strictly separate from the print workflow. The component uses the returned
// intent to decide which real action to take.

/** Intents the chat can act on. */
export const ChatIntent = {
  EDIT: 'EDIT', // a genuine document-edit / print-settings instruction -> agent
  CONFIRM_PRINT: 'CONFIRM_PRINT', // "proceed"/"go ahead" on an edited doc -> approve + send to shop
  CHANGE_SETTINGS: 'CHANGE_SETTINGS', // "change copies/paper/colour" -> agent re-proposes settings
  DECLINE: 'DECLINE', // "no"/"cancel" -> stop the pending action, preserve the job
  ALREADY_IN_SHOP: 'ALREADY_IN_SHOP', // confirmation after it's already with the shop
  NEEDS_UPLOAD: 'NEEDS_UPLOAD', // acting before any document exists
  CLARIFY_CONFIRM: 'CLARIFY_CONFIRM', // bare confirmation with nothing to confirm yet
};

// Decline / cancel the pending action (a WHOLE short message, so a real edit
// like "remove the no-smoking line" is not caught).
const DECLINE_PATTERNS = [
  /^\s*(no|nope|nah|cancel|stop|don'?t|do\s+not|not\s+now|wait)\s*[.!]*\s*$/i,
  /^\s*(cancel|stop)\b.*\b(print|job|that|it|this)\b/i,
];

// "Change / adjust a print setting" — routed to the agent so it re-proposes the
// updated settings via set_print_options (keeping the others).
const CHANGE_SETTINGS_PATTERNS = [
  /\b(change|set|make\s+it|update|use|switch\s+to|instead)\b.*\b(cop(y|ies)|colou?r|black\s*(and|&)?\s*white|b\s*&\s*w|monochrome|paper|a4|letter|legal|portrait|landscape|orientation|single[-\s]?sided|double[-\s]?sided|duplex|sides?)\b/i,
  /\b(cop(y|ies)|colou?r|paper\s*size|orientation|sides?)\b.*\b(to|should\s+be|=)\b/i,
];

// Short, high-confidence confirmation / "send to print" phrases. Matched as a
// whole trimmed message (optionally with trailing punctuation) OR as a clear
// leading phrase. Deliberately conservative so real edit instructions that
// merely contain the word "print" (e.g. "change the word print to copy") are
// NOT misread as a confirmation.
const CONFIRM_PATTERNS = [
  // "proceed"/"procees"/"proced" and similar common typos: pro + optional c +
  // "ee"/"e" + optional d. Keeps real words like "process" out.
  /^\s*(ok(ay)?\s+)?proce{1,3}d?s?\s*[.!]*\s*$/i,
  /^\s*(ok(ay)?\s+)?(go\s*ahead|proceed|continue|confirm|yes[,\s]*proceed|print\s+it|go\s+for\s+it)\b/i,
  /^\s*(please\s+)?(print|send)\b.*\b(it|this|the\s+(edited\s+)?(doc(ument)?|file)|to\s+(the\s+)?(print\s*shop|printx(\s+lab)?|shop))\b/i,
  /^\s*send\s+(it\s+)?to\s+(the\s+)?(print\s*shop|printx(\s+lab)?|shop)\b/i,
  /^\s*(go\s+ahead\s+with\s+the\s+print|proceed\s+with\s+(the\s+)?(edited\s+)?(doc(ument)?|print)|print\s+the\s+(edited\s+)?(doc(ument)?|file))\b/i,
  // Short, whole-message "print" confirmations: "print", "print now",
  // "ok print", "okay print", "print this", "print document", "print please".
  // Anchored to the WHOLE trimmed message so an edit like
  // "change the word print to copy" (which has other text around it) is NOT
  // matched here.
  /^\s*(ok(ay)?\s+|yes\s+|please\s+)?print(\s+(it|this|now|please|the\s+(edited\s+)?(doc(ument)?|file)|doc(ument)?|file))?\s*[.!]*\s*$/i,
  /^\s*(yes|yep|yeah|sure|ok(ay)?)\s*[.!]*\s*$/i, // bare affirmation (only meaningful with context)
];

// Phrases that clearly express "print"/"send to shop" even if not at the start.
const SEND_TO_SHOP_PATTERNS = [
  /\bsend\b.*\b(to\s+)?(print\s*shop|printx(\s+lab)?|the\s+shop)\b/i,
  /\b(go\s+ahead|proceed)\b.*\bprint\b/i,
];

/** True if the message is a short confirmation / "send to print" phrase. */
export function isConfirmationMessage(text) {
  const t = (text || '').trim();
  if (!t) return false;
  if (t.length > 120) return false; // long messages are almost certainly edits
  return CONFIRM_PATTERNS.some((re) => re.test(t)) || SEND_TO_SHOP_PATTERNS.some((re) => re.test(t));
}

/** True if the message declines / cancels the pending action. */
export function isDeclineMessage(text) {
  const t = (text || '').trim();
  if (!t || t.length > 80) return false;
  return DECLINE_PATTERNS.some((re) => re.test(t));
}

/** True if the message asks to change a specific print setting. */
export function isChangeSettingsMessage(text) {
  const t = (text || '').trim();
  if (!t) return false;
  return CHANGE_SETTINGS_PATTERNS.some((re) => re.test(t));
}

/**
 * Classify a customer message against the current job (or null if none yet).
 * Returns { intent, reason }. PURE — never calls the network.
 *
 * @param {string} text   the customer's raw message
 * @param {object|null} job  the current backend job view (has .status), or null
 */
export function classifyMessage(text, job) {
  const status = job?.status || null;
  const confirmation = isConfirmationMessage(text);
  const decline = isDeclineMessage(text);
  const changeSettings = isChangeSettingsMessage(text);

  // No document/job yet: an edit instruction can't apply, and a bare
  // confirmation has nothing to confirm.
  if (!status || status === 'UPLOADED') {
    if (confirmation || decline) {
      return {
        intent: status === 'UPLOADED' ? ChatIntent.CLARIFY_CONFIRM : ChatIntent.NEEDS_UPLOAD,
        reason: 'nothing to confirm yet',
      };
    }
    return { intent: status === 'UPLOADED' ? ChatIntent.EDIT : ChatIntent.NEEDS_UPLOAD, reason: 'edit before preview' };
  }

  // The document is edited/previewed (incl. a print-settings-only proposal).
  if (status === 'READY_FOR_PREVIEW') {
    if (decline) return { intent: ChatIntent.DECLINE, reason: 'decline send-to-shop' };
    // "change copies/paper/colour" is a settings change -> let the agent
    // re-propose the updated settings (keeps the others). Checked before the
    // confirmation so "change to 3 copies" is not mistaken for a plain edit.
    if (changeSettings) return { intent: ChatIntent.CHANGE_SETTINGS, reason: 'adjust print settings' };
    // A confirmation means "send to the print shop" — NOT a new edit.
    if (confirmation) return { intent: ChatIntent.CONFIRM_PRINT, reason: 'confirm edited doc -> shop' };
    // Any other instruction is a further edit / settings request to the agent.
    return { intent: ChatIntent.EDIT, reason: 'further edit on previewed doc' };
  }

  // Already handed to the shop (or being configured / submitted). Another
  // "proceed" must NOT create a new job or restart editing; explain the state.
  if (
    status === 'APPROVED' ||
    status === 'CONFIGURING_PRINTER' ||
    status === 'READY_FOR_APPROVAL' ||
    status === 'PRINT_SUBMITTED' ||
    status === 'PRINT_COMMAND_SUBMITTED'
  ) {
    if (decline) return { intent: ChatIntent.DECLINE, reason: 'decline while in shop' };
    if (confirmation) return { intent: ChatIntent.ALREADY_IN_SHOP, reason: 'already with shop' };
    // A real edit request after sending to the shop is still an edit attempt.
    return { intent: ChatIntent.EDIT, reason: 'edit after sent to shop' };
  }

  // Clarification pending. A bare confirmation ("yes") has nothing concrete to
  // act on, so DO NOT re-send it to the agent (that is the loop). Ask for the
  // specific detail instead. A decline cancels. A real answer goes to the agent.
  if (status === 'NEEDS_CLARIFICATION') {
    if (decline) return { intent: ChatIntent.DECLINE, reason: 'decline during clarification' };
    if (confirmation) return { intent: ChatIntent.CLARIFY_CONFIRM, reason: 'bare confirm during clarification' };
    return { intent: ChatIntent.EDIT, reason: 'answer to clarification' };
  }

  // Default: send as an edit instruction.
  return { intent: ChatIntent.EDIT, reason: 'default edit' };
}

/** A contextual, concise AI message for a non-actionable confirmation. */
export function contextualPrompt(intent, job) {
  switch (intent) {
    case ChatIntent.DECLINE:
      return 'No problem — I\'ve stopped there and kept your document and settings as they are. Tell me what you\'d like to change, or say "proceed" when you\'re ready to send it to PrintsX Lab.';
    case ChatIntent.NEEDS_UPLOAD:
      return 'Please upload a DOCX or digital PDF first, then tell me what to change.';
    case ChatIntent.CLARIFY_CONFIRM:
      if (job?.status === 'NEEDS_CLARIFICATION') {
        return job.agentMessage || "I need a bit more detail before I can edit. What exactly should I change?";
      }
      return "I haven't made any edits yet. Tell me what to change (for example, \"Replace John with Jane\"), and I'll prepare a preview you can approve.";
    case ChatIntent.ALREADY_IN_SHOP: {
      const s = job?.status;
      if (s === 'READY_FOR_APPROVAL') {
        return 'Your document is already with PrintsX Lab and the print settings have been verified. The shop will give the final approval before anything prints.';
      }
      if (s === 'CONFIGURING_PRINTER') {
        return 'PrintsX Lab is configuring the printer for your document right now. Nothing prints until the shop approves.';
      }
      if (s === 'PRINT_SUBMITTED' || s === 'PRINT_COMMAND_SUBMITTED') {
        return 'This job has already been submitted to the printer at PrintsX Lab. A successful submission means the spooler accepted it, not that it has physically printed yet.';
      }
      return 'This document has already been sent to PrintsX Lab.';
    }
    default:
      return '';
  }
}

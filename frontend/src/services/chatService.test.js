// Regression tests for the print-settings fix on the frontend side.
//
// Two things must hold:
//   1. messageFromJob carries the agent's proposed print settings onto the
//      edited-document object so the "send to print shop" step can forward them.
//   2. sendToPrintShop overlays the proposal over minimal defaults and calls
//      the real Backend configure-printer endpoint — it never hardcodes the
//      customer's request away.

// Mock the API client so no real network calls happen.
jest.mock('./apiClient', () => ({
  api: {
    previewUrl: (id) => `/api/jobs/${id}/preview`,
    downloadUrl: (id) => `/api/jobs/${id}/download`,
    configurePrinter: jest.fn(async (jobId, settings) => ({
      job: { id: jobId, status: 'READY_FOR_APPROVAL', printSettings: settings },
    })),
  },
}));

import { api } from './apiClient';
import { messageFromJob, sendToPrintShop } from './chatService';

afterEach(() => {
  jest.clearAllMocks();
});

test('messageFromJob carries proposedPrintSettings onto the edited document', () => {
  const job = {
    id: 'job_abc',
    status: 'READY_FOR_PREVIEW',
    outputFormat: 'pdf',
    copies: 2,
    agentMessage: 'Ready to preview.',
    proposedPrintSettings: {
      copies: 2,
      colorMode: 'monochrome',
      paperSize: 'A4',
      orientation: 'portrait',
      sides: 'two-sided-long-edge',
    },
  };
  const msg = messageFromJob(job);
  expect(msg.editedDoc.proposedPrintSettings).toEqual(job.proposedPrintSettings);
});

test('messageFromJob yields null proposal when the agent proposed none', () => {
  const msg = messageFromJob({
    id: 'job_x',
    status: 'READY_FOR_PREVIEW',
    outputFormat: 'pdf',
    copies: 1,
  });
  expect(msg.editedDoc.proposedPrintSettings).toBeNull();
});

test('sendToPrintShop overlays the agent proposal over defaults', async () => {
  await sendToPrintShop('job_abc', {
    colorMode: 'color',
    paperSize: 'Letter',
    orientation: 'landscape',
    sides: 'two-sided-long-edge',
    copies: 3,
  });
  expect(api.configurePrinter).toHaveBeenCalledTimes(1);
  const [, settings] = api.configurePrinter.mock.calls[0];
  // Overlaid values win over the minimal defaults.
  expect(settings).toEqual({
    copies: 3,
    colorMode: 'color',
    paperSize: 'Letter',
    orientation: 'landscape',
    sides: 'two-sided-long-edge',
  });
});

test('sendToPrintShop falls back to safe defaults when no proposal is given', async () => {
  await sendToPrintShop('job_abc', null);
  const [, settings] = api.configurePrinter.mock.calls[0];
  expect(settings).toEqual({
    copies: 1,
    colorMode: 'monochrome',
    paperSize: 'A4',
    orientation: 'portrait',
    sides: 'one-sided',
  });
  // Crucially, no printerId is forced -> Backend picks the real default printer.
  expect(settings.printerId).toBeUndefined();
});

test('sendToPrintShop does not force a printerId unless the agent set one', async () => {
  await sendToPrintShop('job_abc', { colorMode: 'color' });
  const [, settings] = api.configurePrinter.mock.calls[0];
  expect(settings.printerId).toBeUndefined();
  expect(settings.colorMode).toBe('color');
});

// ============================================================================
// Conversation state machine (Issue 1) regression tests.
// ============================================================================
import {
  classifyMessage,
  isConfirmationMessage,
  contextualPrompt,
  ChatIntent,
} from './chatService';

describe('isConfirmationMessage', () => {
  test.each([
    'proceed',
    'Proceed',
    'procees', // typo
    'proced', // typo
    'proceeds',
    'ok go ahead with the print',
    'go ahead with the print',
    'proceed with the edited doc',
    'proceed with the edited document',
    'send it to PrintX Lab',
    'send to the shop',
    'print it',
    'yes',
    'ok',
  ])('treats %j as a confirmation', (t) => {
    expect(isConfirmationMessage(t)).toBe(true);
  });

  test.each([
    'Replace Rahul Kumar with Danish Ali',
    'make it 3 copies',
    'change the word print to copy',
    'process the document',
    'procedure for printing',
    '', // empty
    'Set 2 copies, black and white, A4, portrait, double-sided and preserve the rest of the document please now', // long edit
  ])('does NOT treat %j as a confirmation', (t) => {
    expect(isConfirmationMessage(t)).toBe(false);
  });
});

describe('classifyMessage — the Issue 1 scenario', () => {
  const previewed = { id: 'job_1', status: 'READY_FOR_PREVIEW' };

  test('"ok go ahead with the print" on an edited doc -> CONFIRM_PRINT', () => {
    expect(classifyMessage('ok go ahead with the print', previewed).intent).toBe(ChatIntent.CONFIRM_PRINT);
  });
  test('"proceed" on an edited doc -> CONFIRM_PRINT', () => {
    expect(classifyMessage('proceed', previewed).intent).toBe(ChatIntent.CONFIRM_PRINT);
  });
  test('"proceed with the edited doc" -> CONFIRM_PRINT', () => {
    expect(classifyMessage('proceed with the edited doc', previewed).intent).toBe(ChatIntent.CONFIRM_PRINT);
  });
  test('"send it to PrintX Lab" -> CONFIRM_PRINT', () => {
    expect(classifyMessage('send it to PrintX Lab', previewed).intent).toBe(ChatIntent.CONFIRM_PRINT);
  });

  test('a further edit after preview -> agent (CHANGE_SETTINGS for settings, EDIT for text)', () => {
    // "make it 3 copies" is a print-settings change -> CHANGE_SETTINGS (still
    // routed to the agent on the same job, which re-proposes settings).
    expect(classifyMessage('make it 3 copies', previewed).intent).toBe(ChatIntent.CHANGE_SETTINGS);
    // A text edit is a plain document edit.
    expect(classifyMessage('also replace Acme with Globex', previewed).intent).toBe(ChatIntent.EDIT);
  });
});

describe('classifyMessage — guardrails against the inspection loop', () => {
  test('confirmation before any document -> NEEDS_UPLOAD', () => {
    expect(classifyMessage('proceed', null).intent).toBe(ChatIntent.NEEDS_UPLOAD);
  });
  test('confirmation on a freshly uploaded doc (no edit yet) -> CLARIFY_CONFIRM', () => {
    expect(classifyMessage('proceed', { id: 'j', status: 'UPLOADED' }).intent).toBe(ChatIntent.CLARIFY_CONFIRM);
  });
  test('confirmation after already sent to shop -> ALREADY_IN_SHOP (no new job, no re-edit)', () => {
    for (const status of ['APPROVED', 'CONFIGURING_PRINTER', 'READY_FOR_APPROVAL', 'PRINT_SUBMITTED']) {
      expect(classifyMessage('proceed', { id: 'j', status }).intent).toBe(ChatIntent.ALREADY_IN_SHOP);
    }
  });
  test('confirmation during clarification -> CLARIFY_CONFIRM (asks for detail, not an edit)', () => {
    expect(classifyMessage('yes', { id: 'j', status: 'NEEDS_CLARIFICATION' }).intent).toBe(ChatIntent.CLARIFY_CONFIRM);
  });
  test('a real answer during clarification -> EDIT', () => {
    expect(classifyMessage('replace John with Jane', { id: 'j', status: 'NEEDS_CLARIFICATION' }).intent).toBe(ChatIntent.EDIT);
  });
});

describe('contextualPrompt', () => {
  test('ALREADY_IN_SHOP for READY_FOR_APPROVAL mentions the shop + final approval', () => {
    const msg = contextualPrompt(ChatIntent.ALREADY_IN_SHOP, { status: 'READY_FOR_APPROVAL' });
    expect(msg).toMatch(/PrintX Lab/i);
    expect(msg).toMatch(/approval/i);
  });
  test('ALREADY_IN_SHOP for PRINT_SUBMITTED is honest about submission vs printing', () => {
    const msg = contextualPrompt(ChatIntent.ALREADY_IN_SHOP, { status: 'PRINT_SUBMITTED' });
    expect(msg).toMatch(/submitted/i);
    expect(msg).toMatch(/not that it has physically printed/i);
  });
  test('NEEDS_UPLOAD asks for a document first', () => {
    expect(contextualPrompt(ChatIntent.NEEDS_UPLOAD, null)).toMatch(/upload/i);
  });
  test('CLARIFY_CONFIRM during clarification echoes the agent question', () => {
    const msg = contextualPrompt(ChatIntent.CLARIFY_CONFIRM, { status: 'NEEDS_CLARIFICATION', agentMessage: 'Which name should I replace?' });
    expect(msg).toMatch(/which name/i);
  });
});

// ============================================================================
// P0 regression: confirmation / decline / change-settings routing.
// ============================================================================
import { isDeclineMessage, isChangeSettingsMessage } from './chatService';

describe('decline + change-settings detection', () => {
  test.each(['no', 'nope', 'cancel', 'cancel the print', 'stop that'])('decline: %j', (t) => {
    expect(isDeclineMessage(t)).toBe(true);
  });
  test.each(['yes', 'proceed', 'change to 3 copies', 'replace John with Jane'])('not decline: %j', (t) => {
    expect(isDeclineMessage(t)).toBe(false);
  });
  test.each([
    'change to 3 copies',
    'make it colour',
    'change paper to Letter',
    'switch to double-sided',
    'set orientation to landscape',
  ])('change-settings: %j', (t) => {
    expect(isChangeSettingsMessage(t)).toBe(true);
  });
  test.each(['proceed', 'yes', 'replace John with Jane'])('not change-settings: %j', (t) => {
    expect(isChangeSettingsMessage(t)).toBe(false);
  });
});

describe('classifyMessage — P0 scenarios (C/D/E/F/G/M + decline)', () => {
  const previewed = { id: 'job_1', status: 'READY_FOR_PREVIEW', proposedPrintSettings: { copies: 2 } };

  test('C. "yes" at READY_FOR_PREVIEW advances to CONFIRM_PRINT (does not loop)', () => {
    expect(classifyMessage('yes', previewed).intent).toBe(ChatIntent.CONFIRM_PRINT);
  });
  test('D. "proceed with the edited document" at READY_FOR_PREVIEW -> CONFIRM_PRINT', () => {
    expect(classifyMessage('proceed with the edited document', previewed).intent).toBe(ChatIntent.CONFIRM_PRINT);
  });
  test('E. "change to 3 copies" -> CHANGE_SETTINGS (re-propose, not a plain edit)', () => {
    expect(classifyMessage('change to 3 copies', previewed).intent).toBe(ChatIntent.CHANGE_SETTINGS);
  });
  test('F. "make it colour" -> CHANGE_SETTINGS', () => {
    expect(classifyMessage('make it colour', previewed).intent).toBe(ChatIntent.CHANGE_SETTINGS);
  });
  test('G. "change paper to Letter" -> CHANGE_SETTINGS', () => {
    expect(classifyMessage('change paper to Letter', previewed).intent).toBe(ChatIntent.CHANGE_SETTINGS);
  });
  test('decline at READY_FOR_PREVIEW -> DECLINE (stop, preserve job)', () => {
    expect(classifyMessage('no', previewed).intent).toBe(ChatIntent.DECLINE);
    expect(classifyMessage('cancel', previewed).intent).toBe(ChatIntent.DECLINE);
  });
  test('a genuine edit at READY_FOR_PREVIEW still -> EDIT', () => {
    expect(classifyMessage('replace Rahul with Danish', previewed).intent).toBe(ChatIntent.EDIT);
  });
});

describe('classifyMessage — no re-loop on a bare confirmation during clarification', () => {
  const clarifying = { id: 'j', status: 'NEEDS_CLARIFICATION', agentMessage: 'Which name?' };
  test('"yes" during clarification -> CLARIFY_CONFIRM (NOT sent back to the agent)', () => {
    expect(classifyMessage('yes', clarifying).intent).toBe(ChatIntent.CLARIFY_CONFIRM);
  });
  test('a real answer during clarification -> EDIT', () => {
    expect(classifyMessage('replace John', clarifying).intent).toBe(ChatIntent.EDIT);
  });
  test('"no" during clarification -> DECLINE', () => {
    expect(classifyMessage('no', clarifying).intent).toBe(ChatIntent.DECLINE);
  });
});

// ============================================================================
// Issue 6 regression: the "OK PRINT" existing-job continuation.
// The exact phrases from the spec must be recognised as print confirmations and,
// on a READY_FOR_PREVIEW job, classified as CONFIRM_PRINT (send the EXISTING
// edited job to the shop) — never NEEDS_UPLOAD / "please upload again".
// ============================================================================
describe('Issue 6 — "OK PRINT" and friends are print confirmations', () => {
  test.each([
    'OK PRINT',
    'ok print',
    'Okay print',
    'print',
    'Print',
    'print it',
    'print this',
    'print the document',
    'print the edited document',
    'print now',
    'go ahead',
    'Go ahead',
    'send it to the shop',
    'proceed with the edited document',
  ])('isConfirmationMessage(%j) === true', (t) => {
    expect(isConfirmationMessage(t)).toBe(true);
  });

  test.each([
    'change the word print to copy', // a real edit that merely contains "print"
    'remove the printing instructions section',
    'replace Rahul Kumar with Danish Ali and keep the print layout', // long edit
  ])('isConfirmationMessage(%j) === false (real edit, not a confirmation)', (t) => {
    expect(isConfirmationMessage(t)).toBe(false);
  });

  describe('on a READY_FOR_PREVIEW job -> CONFIRM_PRINT (resolve existing edited job)', () => {
    const previewed = {
      id: 'job_existing',
      status: 'READY_FOR_PREVIEW',
      proposedPrintSettings: { copies: 3, colorMode: 'monochrome', paperSize: 'A4', orientation: 'portrait', sides: 'two-sided-long-edge' },
    };
    test.each([
      'OK PRINT',
      'print it',
      'go ahead',
      'send it to the shop',
      'proceed with the edited document',
    ])('%j -> CONFIRM_PRINT', (t) => {
      expect(classifyMessage(t, previewed).intent).toBe(ChatIntent.CONFIRM_PRINT);
    });
  });
});

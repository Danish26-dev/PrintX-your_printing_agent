/**
 * The PrintX planning orchestrator.
 *
 * Wires a real Strands Agent (Google Vertex AI / Gemini model) to the three
 * document tools and drives one edit request end-to-end:
 *
 *   user instruction
 *     -> agent calls inspect_document (reads text via Document Engine)
 *     -> agent reasons and calls plan_operations (validated against schema)
 *     -> agent calls execute_operation_plan (Document Engine applies it)
 *     -> agent returns a human-readable message
 *
 * The LLM never edits document bytes. It only selects/validates operations;
 * the Python Document Engine performs and re-validates the actual edit.
 */
import { Agent } from '@strands-agents/sdk';
import type { GoogleModel } from '@strands-agents/sdk/models/google';
import { buildVertexModel } from '../model/vertexProvider.js';
import { buildTools, type DocumentContext } from '../tools/documentTools.js';
import { toAgentError } from '../errors.js';
import type { AgentEditResult } from '../types.js';

const SYSTEM_PROMPT = `You are PrintX's document editing assistant for a print shop.

Your job: turn a customer's natural-language instruction into precise, safe edits
on THEIR uploaded document, then execute them.

You have these tools:
- inspect_document: read the document's text. ALWAYS call this first (for edits).
- plan_operations: validate the exact DOCUMENT EDITS you intend to perform.
- execute_operation_plan: apply the validated document edits.
- set_print_options: record the customer's requested PRINT settings (how the
  document should be PRINTED — this is NOT a document edit).

DOCUMENT-EDIT operations (change the document's content) — ONLY these:
- replace_text { find, replace, pages? }  -> replace literal text (case-sensitive, exact).
    * Optional "pages": an inclusive 1-based range { from, to } that RESTRICTS the
      replacement to those pages (e.g. { from: 1, to: 3 } means pages 1, 2 and 3).
      Omit "pages" to replace throughout the whole document (the default).
      Page numbers are 1-based (the first page is page 1).
- set_copies { copies }           -> set number of print copies.

PRINT settings (how the document is PRINTED — captured via set_print_options; all
optional, set only what the customer asked for):
- printerId    -> a specific printer (usually leave unset; the shop uses its default).
- copies       -> number of copies (int).
- colorMode    -> "color" or "monochrome"  (map "black and white"/"B&W" -> "monochrome").
- paperSize    -> "A4", "Letter", or "Legal".
- orientation  -> "portrait" or "landscape".
- sides        -> "one-sided", "two-sided-long-edge", or "two-sided-short-edge"
                  (map "double-sided"/"duplex" -> "two-sided-long-edge";
                   "single-sided" -> "one-sided").

CAPABILITIES — do NOT claim these are impossible; they ARE supported:
- Page-restricted edits ARE supported for PDFs via the "pages" field above. The Document
  Engine enforces the page boundary; occurrences outside the range are left unchanged.
  When the customer says "only pages 1 to 3", translate that to pages: { from: 1, to: 3 }.
- Digital PDFs are edited IN PLACE, preserving the original layout, page count, page
  size and images. You do not need to warn that native PDF editing is impossible.
- A preview of the edited document IS generated and retrievable after a successful edit.
  Never tell the customer a preview cannot be produced.
- PRINT settings (colour/monochrome, paper size, orientation, single/double-sided,
  copies, printer) ARE supported. When the customer mentions any of them, call
  set_print_options with the mapped values. The print shop validates them against its
  REAL printer and applies the supported ones; any option the printer cannot do is
  reported honestly to the shopkeeper. NEVER tell the customer that colour, paper size,
  orientation, or double-sided printing is unsupported by your tools — capture them with
  set_print_options. Do NOT claim a print setting was physically applied; the shop
  confirms that after approval.

Hard rules:
1. NEVER invent or guess find/replace targets. Use the exact text from the document.
2. If the instruction is ambiguous (e.g. "change the name" when several names exist,
   or the target/replacement is unclear), DO NOT edit. Ask the customer a specific
   clarifying question and stop.
3. Before saying something is unsupported, CHECK the operations above. If the request can
   be expressed with replace_text (optionally page-scoped) or set_copies, DO IT via the
   tools — do not merely describe what could be done. Only decline for things genuinely
   outside these operations, and say specifically what is and isn't possible.
4. If the text to replace does not exist in the document (or in the requested page range),
   tell the customer it was not found; do not execute a no-op silently.
5. Only call execute_operation_plan after plan_operations returns valid: true. Do NOT
   claim the document has been edited until execute_operation_plan has SUCCEEDED. If a
   tool returns an error, report that error plainly; never fabricate a success or a preview.
6. Never mention tools, JSON, schemas, or internal mechanics to the customer.
7. If a page range is given for a document that is not a digital PDF, the engine will
   reject it with a clear error; relay that honestly rather than applying the change
   document-wide.

When you finish, reply with a short, friendly confirmation of what you did — the document
edits (include pages when page-scoped) AND the print settings you recorded (noting the
shop will apply them on its printer). Example: "I'll replace 'Rahul Kumar' with 'Danish
Ali', set 2 copies, and prepare the print as black & white, A4, portrait, double-sided —
the shop will confirm these on its printer before printing."`;

export interface EditRequest {
  instruction: string;
  fileBuffer: Buffer;
  filename: string;
}

export class PlanningOrchestrator {
  private buildModel(): GoogleModel {
    // Vertex AI via ADC. buildVertexModel() validates GOOGLE_CLOUD_PROJECT /
    // GOOGLE_CLOUD_LOCATION / VERTEX_AI_MODEL_ID (throws a clear, secret-free
    // error otherwise). Credentials come from ADC and are never read here.
    return buildVertexModel();
  }

  async runEdit(req: EditRequest): Promise<AgentEditResult> {
    const ctx: DocumentContext = {
      fileBuffer: req.fileBuffer,
      filename: req.filename,
    };
    const { inspectDocument, planOperations, executeOperationPlan, setPrintOptions } = buildTools(ctx);

    let result: unknown;
    try {
      const agent = new Agent({
        model: this.buildModel(),
        systemPrompt: SYSTEM_PROMPT,
        tools: [inspectDocument, planOperations, executeOperationPlan, setPrintOptions],
        printer: false,
      });
      result = await withThrottleRetry(() => agent.invoke(req.instruction));
    } catch (err) {
      // Map Vertex AI / config failures to a sanitized, typed error. Never leak
      // credentials or raw provider internals.
      throw toAgentError(err);
    }

    const message = extractText(result);

    // The orchestrator's truth about what happened comes from the context the
    // tools populated, not from parsing the model's prose. Print options (if the
    // customer requested any) are carried on EVERY path so the Backend can use
    // the agent's proposal when configuring the real printer.
    if (ctx.lastProcessResult) {
      return {
        executed: true,
        message,
        plan: ctx.committedPlan,
        document: ctx.lastProcessResult,
        printOptions: ctx.printOptions,
      };
    }

    // A TERMINAL engine failure (e.g. PDF renderer unavailable) is a definite
    // failure, NOT a clarification. Surface it so the backend records a clean
    // failed state rather than leaving the job ambiguous.
    if (ctx.terminalError) {
      return {
        executed: false,
        message: message || ctx.terminalError.message,
        plan: ctx.committedPlan,
        errorCode: ctx.terminalError.code,
        printOptions: ctx.printOptions,
      };
    }

    // PRINT-SETTINGS-ONLY SUCCESS: the customer asked only to change print
    // settings (e.g. "2 copies, black and white, A4"). The agent captured them
    // via set_print_options but did NO document edit (none was requested). This
    // is a SUCCESS — the proposal is complete — NOT a clarification. Reporting
    // it as a clarification is exactly what made the assistant loop ("would you
    // like me to proceed with just copies?") and re-ask on "yes".
    if (ctx.printOptions && Object.keys(ctx.printOptions).length > 0) {
      return {
        executed: true,
        message,
        plan: ctx.committedPlan,
        printOptions: ctx.printOptions,
        printOptionsOnly: true,
      };
    }

    // No execution happened: either clarification is needed or nothing matched.
    return {
      executed: false,
      message,
      plan: ctx.committedPlan,
      needsClarification: true,
      printOptions: ctx.printOptions,
    };
  }
}

/** Detect a Vertex/Gemini throttling (HTTP 429 / RESOURCE_EXHAUSTED) error by
 * walking the cause chain. Status/message only; never reads credentials. */
function isThrottle(err: unknown): boolean {
  let cur: any = err;
  for (let depth = 0; cur && depth < 4; depth++) {
    const status = cur.status ?? cur.statusCode ?? cur.code;
    if (status === 429) return true;
    if (typeof cur.message === 'string' && /RESOURCE_EXHAUSTED|429|quota/i.test(cur.message)) return true;
    cur = cur.cause;
  }
  return false;
}

/**
 * Run an agent invocation with a BOUNDED retry/backoff that triggers ONLY on
 * throttling (429). Max 2 retries with exponential backoff. Non-throttle errors
 * propagate immediately. This never loops indefinitely.
 */
async function withThrottleRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let attempt = 0;
  // 1.5s, then 4s — short, bounded, and only on 429.
  const delays = [1500, 4000];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt < maxRetries && isThrottle(err)) {
        const wait = delays[attempt] ?? 4000;
        // eslint-disable-next-line no-console
        console.warn(`[agent] Vertex throttled (429); retrying in ${wait}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise((r) => setTimeout(r, wait));
        attempt += 1;
        continue;
      }
      throw err;
    }
  }
}

/** Pull the assistant's final text out of a Strands AgentResult, tolerant of
 * SDK shape differences across versions. */
function extractText(result: unknown): string {
  const r = result as any;
  const last = r?.lastMessage ?? r?.message ?? r;
  if (typeof last === 'string') return last.trim();
  const content = last?.content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (typeof c === 'string' ? c : c?.text ?? ''))
      .join('')
      .trim();
  }
  if (typeof content === 'string') return content.trim();
  if (typeof last?.text === 'string') return last.text.trim();
  return '';
}

export const planningOrchestrator = new PlanningOrchestrator();

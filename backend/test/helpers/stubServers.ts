/**
 * Tiny in-process stub servers for the Strands Agent and Document Engine, so we
 * can test the full Backend flow without AWS or the Python service.
 *
 * These are TEST DOUBLES — clearly fakes used only in mocked-service tests. The
 * real integration test uses the real services instead.
 */
import http from 'node:http';
import { Document, Packer, Paragraph, TextRun } from 'docx';

export interface StubHandles {
  agentUrl: string;
  engineUrl: string;
  close: () => Promise<void>;
  /** Control how the stub agent responds next. */
  setAgentMode: (m: AgentMode) => void;
}

export interface StubPrintOptions {
  printerId?: string;
  copies?: number;
  colorMode?: 'color' | 'monochrome';
  paperSize?: 'A4' | 'Letter' | 'Legal';
  orientation?: 'portrait' | 'landscape';
  sides?: 'one-sided' | 'two-sided-long-edge' | 'two-sided-short-edge';
}

export type AgentMode =
  | {
      kind: 'execute';
      copies: number;
      replacements: number;
      outputFormat?: string;
      /** When set, the stub agent returns a structured print proposal too. */
      printOptions?: StubPrintOptions;
    }
  | { kind: 'clarify'; message: string; printOptions?: StubPrintOptions }
  /**
   * PRINT-SETTINGS-ONLY success: the agent captured print options but performed
   * NO document edit (executed:true, printOptionsOnly:true, no document). This
   * mirrors the real orchestrator's settings-only branch.
   */
  | { kind: 'settingsOnly'; message?: string; printOptions: StubPrintOptions }
  | { kind: 'error'; status: number; code: string };

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (addr && typeof addr === 'object') return addr.port;
  throw new Error('no port');
}

export async function startStubs(): Promise<StubHandles> {
  let agentMode: AgentMode = { kind: 'execute', copies: 1, replacements: 1 };

  // Fake Document Engine: /health and /jobs/:id/download (returns a real docx).
  const engine = http.createServer(async (req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy' }));
      return;
    }
    if (req.url?.match(/^\/jobs\/[a-z0-9]+\/download$/)) {
      const doc = new Document({
        sections: [{ children: [new Paragraph({ children: [new TextRun('Omkar L Kulkarni processed output')] })] }],
      });
      const buf = await Packer.toBuffer(doc);
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(buf);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  // Fake Strands Agent: /api/health and /api/edit.
  const agent = http.createServer((req, res) => {
    if (req.url === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy' }));
      return;
    }
    if (req.url === '/api/edit' && req.method === 'POST') {
      // We don't parse multipart in the stub; the mode dictates the response.
      let body = '';
      req.on('data', (c) => (body += c.length)); // drain
      req.on('end', () => {
        if (agentMode.kind === 'error') {
          res.writeHead(agentMode.status, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { code: agentMode.code, message: 'stub error' } }));
          return;
        }
        if (agentMode.kind === 'clarify') {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              result: {
                executed: false,
                message: agentMode.message,
                needsClarification: true,
                ...(agentMode.printOptions ? { printOptions: agentMode.printOptions } : {}),
              },
            }),
          );
          return;
        }
        if (agentMode.kind === 'settingsOnly') {
          // SUCCESS with print options but NO document edit (no `document`).
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              success: true,
              result: {
                executed: true,
                message: agentMode.message ?? "I'll prepare the print settings.",
                printOptions: agentMode.printOptions,
                printOptionsOnly: true,
              },
            }),
          );
          return;
        }
        // execute
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            success: true,
            result: {
              executed: true,
              message: "I'll apply your changes.",
              plan: { operations: [{ type: 'replace_text', find: 'a', replace: 'b' }] },
              ...(agentMode.printOptions ? { printOptions: agentMode.printOptions } : {}),
              document: {
                job_id: 'engine123',
                input_format: 'docx',
                output_format: agentMode.outputFormat ?? 'docx',
                output_filename: 'edited.docx',
                changes: {
                  copies: agentMode.copies,
                  total_replacements: agentMode.replacements,
                  operations: [],
                },
                download_url: '/jobs/engine123/download',
              },
            },
          }),
        );
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const [agentPort, enginePort] = await Promise.all([listen(agent), listen(engine)]);

  return {
    agentUrl: `http://127.0.0.1:${agentPort}`,
    engineUrl: `http://127.0.0.1:${enginePort}`,
    setAgentMode: (m) => (agentMode = m),
    close: async () => {
      await Promise.all([
        new Promise<void>((r) => agent.close(() => r())),
        new Promise<void>((r) => engine.close(() => r())),
      ]);
    },
  };
}

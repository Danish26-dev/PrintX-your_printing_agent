# PrintX Backend

The **application control plane**. It owns jobs, uploads, lifecycle, and
preview/download, and forwards document work to the Strands Agent. It performs
**no** document editing, **no** conversion, and **never** calls Bedrock.

```
Frontend → Backend → Strands Agent → Document Engine
```

## Responsibilities

- Receive uploads, validate them, create jobs, track job state
- Store originals + processed outputs via a `StorageProvider`
- Forward file + instruction to the Strands Agent (`POST /api/edit`)
- Retrieve processed bytes from the Document Engine and serve preview/download
- Drive the job lifecycle honestly (no fake print completion)

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Status + agent/engine reachability |
| POST | `/api/files/upload` | Upload a file, create a job |
| POST | `/api/jobs` | Upload + optional instruction |
| GET | `/api/jobs/:id` | Job view |
| GET | `/api/jobs/:id/status` | Status |
| POST | `/api/jobs/:id/instruction` | Apply an instruction |
| GET | `/api/jobs/:id/preview` | Processed document (inline) |
| GET | `/api/jobs/:id/download` | Processed document (attachment) |
| POST | `/api/jobs/:id/approve` | `READY_FOR_PREVIEW → APPROVED` |
| POST | `/api/jobs/:id/print` | `APPROVED → PRINTING` |
| DELETE | `/api/jobs/:id` | Cleanup (idempotent) → `DELETED` |

## Configuration

See `.env.example`. All URLs/limits are environment-driven; no secrets are
hardcoded.

## Run

```bash
npm install
cp .env.example .env      # set STRANDS_AGENT_URL, DOCUMENT_ENGINE_URL
npm run start:dev         # tsx src/index.ts (or npm run dev to watch)
```

Start order for a full stack: Document Engine → Strands Agent → Backend.

## Tests

```bash
npm run test:unit          # ids/format, storage (path traversal), job model
npm run test:integration   # full Backend flow with STUBBED agent + engine,
                           # plus a gated REAL e2e test (skips unless RUN_E2E=1)
```

- **Unit** and **mocked-service** tests need no external services or AWS.
- The **real E2E** test (`test/integration/e2e.real.test.ts`) is gated on
  `RUN_E2E=1` and reachable real services; it **skips** rather than faking
  success. The real Bedrock call inside the agent requires AWS credentials.

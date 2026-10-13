# PrintX Architecture

PrintX turns a customer's natural-language request into safe, deterministic
edits on their document, then prepares it for printing.

```
┌─────────────────────────────────────────────────────────────┐
│                     frontend (React / CRACO)                  │
│  chat workspace, file upload, document preview, approvals     │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP (multipart upload + JSON)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              backend (Node / Express, TypeScript)             │
│  APPLICATION CONTROL PLANE                                    │
│  - jobs + lifecycle, uploads, storage, preview/download       │
│  - forwards document + instruction to the Strands Agent       │
│  - NO document editing, NO Bedrock, NO conversion             │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP  POST /api/edit (file + instruction)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│         strands-agent (TypeScript, @strands-agents/sdk)       │
│  ORCHESTRATION / REASONING                                    │
│  - real Strands Agent + BedrockModel                          │
│  - tools: inspect_document, plan_operations, execute_plan     │
│  - LLM chooses & validates operations; never edits bytes      │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP  /inspect, /process, /jobs/:id/download
                           ▼
┌─────────────────────────────────────────────────────────────┐
│            document-engine (Python / FastAPI)                 │
│  DETERMINISTIC EXECUTION                                      │
│  - PDF↔DOCX (pdf2docx, LibreOffice), python-docx editing      │
│  - closed operation schema + validation (final authority)     │
└─────────────────────────────────────────────────────────────┘
```

## Role separation

| Layer | Responsibility |
|-------|----------------|
| **LLM** | Reasoning — understand intent, decide *which* operations. |
| **strands-agent** | Orchestration — run the agent loop, call tools, produce a validated plan. |
| **tools** | Controlled actions — inspect, validate, execute (no code/shell/fs). |
| **document-engine** | Deterministic execution — the actual conversion + editing. |
| **backend** | Application control plane — jobs, uploads, lifecycle, preview/download. |
| **frontend** | Presentation — UI, uploads, displaying job state and previews. |

The LLM never edits, regenerates, or hallucinates document content. It only
emits operations from a **closed schema**; the document-engine performs and
re-validates the edit.

## Request flow (edit)

1. frontend uploads a file + instruction to the **backend** (`POST /api/jobs`).
2. backend validates the file, creates a **job**, stores the original via the
   `StorageProvider`, and forwards file + instruction to the **strands-agent**.
3. The agent inspects the document (via the document-engine), reasons with
   Bedrock, validates an operation plan, and calls the **document-engine** to
   execute it.
4. The document-engine converts/edits deterministically and returns the file.
5. The backend stores its own copy of the output and moves the job to
   `READY_FOR_PREVIEW` (or `NEEDS_CLARIFICATION` if the request was ambiguous).
6. frontend previews/downloads via the backend; on approval the job advances
   through `APPROVED → PRINTING`. `PRINTED` requires a real printer event
   (not wired).

## Backend API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/health` | Backend status + dependency reachability |
| POST | `/api/files/upload` | Upload a file, create a job (no processing) |
| POST | `/api/jobs` | Upload + optional instruction (processes if given) |
| GET | `/api/jobs/:id` | Job view (safe fields only) |
| GET | `/api/jobs/:id/status` | Lightweight status |
| POST | `/api/jobs/:id/instruction` | Apply an instruction to a job |
| GET | `/api/jobs/:id/preview` | Stream processed document (inline) |
| GET | `/api/jobs/:id/download` | Stream processed document (attachment) |
| POST | `/api/jobs/:id/approve` | `READY_FOR_PREVIEW → APPROVED` |
| POST | `/api/jobs/:id/print` | `APPROVED → PRINTING` |
| DELETE | `/api/jobs/:id` | Cleanup stored files (idempotent) → `DELETED` |

## Job lifecycle

```
UPLOADED → PROCESSING → READY_FOR_PREVIEW → APPROVED → PRINTING → PRINTED*
                     ↘ NEEDS_CLARIFICATION
Failure: PROCESSING_FAILED | CONVERSION_FAILED | PRINT_FAILED
Cleanup: DELETED
```
\* `PRINTED` is only set on a real print-completion event, which is **not**
implemented. The backend never fakes completion.

## Copy count

`set_copies` is **print metadata**. `copies = 3` means "print 3 copies"; it does
NOT duplicate pages or store three files.

## Storage

The backend uses a `StorageProvider` abstraction. `LocalStorageProvider` (dev)
stores files under `STORAGE_DIR` with opaque, generated keys and path-traversal
protection. Ready for an S3 implementation later; **S3 is not implemented**.

## Configuration (env, no hardcoded secrets/URLs)

- **frontend**: `REACT_APP_API_BASE_URL`
- **backend**: `PORT`, `STRANDS_AGENT_URL`, `DOCUMENT_ENGINE_URL`, `STORAGE_DIR`,
  `MAX_UPLOAD_BYTES`, `MAX_INSTRUCTION_LENGTH`, `MAX_COPIES`, `AGENT_TIMEOUT_MS`,
  `ENGINE_TIMEOUT_MS`, `CORS_ORIGIN`
- **strands-agent**: `PORT`, `DOCUMENT_ENGINE_URL`, `AWS_REGION`,
  `BEDROCK_MODEL_ID`, `BEDROCK_TEMPERATURE` (AWS creds via the standard chain)
- **document-engine**: `PORT`, `WORK_DIR`, `SOFFICE_PATH`, `CONVERT_TIMEOUT`

# PrintX — Autonomous Document Editing & Printing

PrintX lets a user upload a document, describe changes in plain language
("Replace John with Jane and make 3 copies"), and get a real edited document
back — ready for a print shop. The AI decides *what* to change; deterministic
code makes the change. The AI never edits document bytes directly.

## Architecture

```
frontend → backend → strands-agent → document-engine
 (React)   (Express)   (Bedrock +      (Python: pdf2docx,
                        Strands tools)   python-docx, LibreOffice)
```

- **LLM** = reasoning · **Strands** = orchestration · **tools** = controlled
  actions · **Python engine** = deterministic execution · **backend** =
  application control plane · **frontend** = UI.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full design.

## Directory structure

```
PrintX/
├── frontend/          React UI (CRA + CRACO)
├── backend/           Express API — jobs, lifecycle, storage, orchestration
├── strands-agent/     Strands Agent + AWS Bedrock reasoning + tools
├── document-engine/   Python FastAPI — conversion + deterministic editing
├── docker-compose.yml
├── ARCHITECTURE.md
├── README.md
└── .gitignore
```

## Prerequisites

- Node.js 22+ and npm
- Python 3.12+
- (Optional) Docker + Docker Compose
- (Optional) LibreOffice — only needed for DOCX↔PDF conversion in local dev;
  it is bundled in the document-engine Docker image
- (Optional) AWS credentials with Amazon Bedrock access — required only for the
  strands-agent to perform real natural-language reasoning

## Install

```bash
# backend
cd backend && npm install --legacy-peer-deps && cd ..

# strands-agent
cd strands-agent && npm install --legacy-peer-deps && cd ..

# frontend
cd frontend && npm install --legacy-peer-deps && cd ..

# document-engine
cd document-engine
python -m venv venv
# Windows:  venv\Scripts\pip install -r requirements.txt
# macOS/Linux:  venv/bin/pip install -r requirements.txt
cd ..
```

## Run (local dev) — start in this order

```bash
# 1) Document Engine (port 5001)
cd document-engine && venv\Scripts\python -m uvicorn app.main:app --port 5001

# 2) Strands Agent (port 4000)  — needs AWS creds to actually reason
cd strands-agent && npm run start:dev

# 3) Backend (port 3001)
cd backend && npm run start:dev

# 4) Frontend (port 3000)
cd frontend && npm start
```

Then open http://localhost:3000.

## Run (Docker)

```bash
# Optional, for real reasoning:
#   export AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...  AWS_REGION=...
docker compose up --build
```

Services: frontend `:3000`, backend `:3001`, strands-agent `:4000`,
document-engine `:5001`.

## Environment variables

Each service ships a `.env.example`. Copy to `.env` and adjust.

- **frontend**: `REACT_APP_API_BASE_URL` (default `http://localhost:3001`)
- **backend**: `STRANDS_AGENT_URL`, `DOCUMENT_ENGINE_URL`, `STORAGE_DIR`,
  `CORS_ORIGIN`, upload/instruction/copy limits, service timeouts
- **strands-agent**: `DOCUMENT_ENGINE_URL`, `AWS_REGION`, `BEDROCK_MODEL_ID`,
  `BEDROCK_TEMPERATURE`; AWS credentials via the standard AWS provider chain
- **document-engine**: `WORK_DIR`, `SOFFICE_PATH`, `CONVERT_TIMEOUT`

No AWS credentials are ever stored in the frontend.

## How the services communicate

`frontend → backend` (REST). `backend → strands-agent` (`POST /api/edit` with the
file + instruction). `strands-agent → document-engine` (`/inspect`, `/process`,
download). The backend also fetches processed bytes from the document-engine to
serve preview/download.

## Tests

```bash
# backend
cd backend && npm run test:unit && npm run test:integration

# strands-agent  (integration needs the document-engine running)
cd strands-agent && npm run test:unit && npm run test:integration

# document-engine
cd document-engine
venv\Scripts\python -m tests.verify_validation
venv\Scripts\python -m tests.verify_pipeline

# frontend build
cd frontend && npm run build
```

Tests that need a real Bedrock call are **gated** and skip unless AWS creds are
present and the enabling flag is set (`RUN_BEDROCK_TESTS=1` for the agent,
`RUN_E2E=1` for the backend). They never fake success.

## What requires AWS credentials

Only the **strands-agent's reasoning step** (Amazon Bedrock). Without creds, the
upload → job → instruction path runs end to end and returns a clean error at the
reasoning step; the deterministic conversion/editing in the document-engine works
without AWS.

## Implemented

- Real file upload, job model + lifecycle, storage abstraction (local)
- Real deterministic DOCX editing (find/replace, copy count) with formatting
  preserved; PDF↔DOCX conversion via LibreOffice + pdf2docx (scanned-PDF
  detection)
- Strands Agent with a closed operation schema, validation, and deterministic
  tools; the LLM never edits bytes
- Backend control plane with clean error handling and honest job states
- Frontend wired to the real backend (upload, instruction, clarification,
  preview, download, approve, honest print state)

## Current limitations

- **Real printing is not implemented.** The flow ends at `PRINTING` /
  "ready for the shop to print"; there is no printer integration and no fake
  `PRINTED` state.
- **Bedrock reasoning requires AWS credentials**; not exercised where absent.
- **PDF round-trip** needs LibreOffice (present in Docker; optional locally).
- **Shop discovery is demo data** in the frontend (`shopService.js`); there is
  no shop/channel backend yet.
- **Shopkeeper auth** remains mock.
- **No S3 / database** — storage is local filesystem; jobs are in-memory.

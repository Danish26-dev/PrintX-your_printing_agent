# PrintX Document Engine

The deterministic document-processing service for PrintX. It is the component
that actually converts and edits documents. It contains **no LLM calls** — the
AI (Strands agent) produces an operation plan upstream; this engine validates
that plan against a closed schema and executes it with plain Python.

```
PDF ──▶ PDF→DOCX ──▶ deterministic edit ──▶ DOCX→PDF ──▶ PDF
DOCX ─────────────▶ deterministic edit ──▶ DOCX
```

## Why a separate Python service

The reliable document libraries live in Python:

- **python-docx** — edit DOCX while preserving formatting
- **pdf2docx** (+ PyMuPDF) — convert digital PDFs to DOCX and detect scanned PDFs
- **LibreOffice headless** — high-fidelity DOCX → PDF

## Reliability model

The AI never edits documents directly. It can only emit operations from a
**closed schema** (`app/editing/schema.py`). Every incoming plan is validated
before any file is touched, so unknown/malicious operations are rejected.

### V1 operations

```json
{ "type": "replace_text", "find": "old text", "replace": "new text" }
{ "type": "set_copies", "copies": 3 }
```

## Format support (V1)

- `.docx`
- digital / text-based `.pdf`

Scanned/image PDFs are rejected with a clear message
(`code: "scanned_pdf"`). No OCR, no images, no PPTX/XLSX.

## Endpoints

| Method | Path                     | Purpose                                        |
|--------|--------------------------|------------------------------------------------|
| GET    | `/health`                | Service status + LibreOffice availability      |
| GET    | `/operations`            | List supported operation types                 |
| POST   | `/inspect`               | Extract plain text (for the agent to reason)   |
| POST   | `/process`               | `file` + `plan` → edited file (creates a job)  |
| GET    | `/jobs/{id}/download`    | Download the edited output                     |
| DELETE | `/jobs/{id}`             | Permanently delete a job's files (privacy)     |

`/process` form fields:
- `file` — the `.docx` or `.pdf`
- `plan` — JSON operation plan (validated server-side)
- `output_format` — optional `docx` | `pdf`; defaults to the input format

## Local development

```powershell
# from document-engine/
py -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 5001
```

> LibreOffice is optional for local dev. Without it, DOCX editing and PDF→DOCX
> still work; only DOCX→PDF output returns `503 libreoffice_unavailable`.
> The Docker image installs LibreOffice so PDF output works in production.

### Verify

```powershell
.\venv\Scripts\python.exe -m tests.verify_pipeline     # convert+edit pipeline
.\venv\Scripts\python.exe -m tests.verify_validation   # closed-schema rejects bad plans
.\venv\Scripts\python.exe -m tests.verify_http         # live HTTP e2e (server must be running)
```

## Docker

```bash
docker build -t printx-document-engine .
docker run -p 5001:5001 printx-document-engine
```

## Configuration

See `.env.example`. Key settings: `PORT`, `WORK_DIR`, `SOFFICE_PATH`,
`CONVERT_TIMEOUT`.

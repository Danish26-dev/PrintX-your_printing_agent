# PrintX Strands Agent

The AI orchestration layer for PrintX. It uses the **real Strands Agents SDK**
(`@strands-agents/sdk`) with an Amazon Bedrock model to turn a customer's
natural-language instruction into a **validated, deterministic OperationPlan**
and execute it through the Python **Document Engine**.

The LLM never edits document bytes. It only selects and validates operations;
the Document Engine performs the actual edit and re-validates.

```
user instruction
  → Strands Agent (Bedrock)
      → inspect_document tool   (reads text via Document Engine /inspect)
      → LLM reasoning
      → plan_operations tool    (validate against closed schema)
      → execute_operation_plan  (Document Engine /process applies it)
  → human-readable confirmation
```

## Tools (narrow, single-responsibility)

| Tool | Responsibility |
|------|----------------|
| `inspect_document` | Read the document's text (never modifies it). |
| `plan_operations` | Validate proposed operations against the closed schema. |
| `execute_operation_plan` | Send the validated plan to the Document Engine. |

Supported operations (mirrors the Document Engine's closed schema):

```json
{ "type": "replace_text", "find": "old", "replace": "new" }
{ "type": "set_copies", "copies": 3 }
```

`set_copies` is print-job metadata only — it does **not** duplicate pages.

## Reliability rules enforced

- The agent validates every plan (zod) before execution; the Document Engine
  re-validates independently and is the final authority.
- No tool can run code, shell, or filesystem operations.
- Ambiguous instructions ("change the name" with multiple names) → the agent
  asks for clarification and does **not** edit.
- Text-not-found is reported honestly (no silent no-op).

## HTTP API

`POST /api/edit` (multipart)
- `file` — the `.docx` or `.pdf`
- `instruction` — natural-language instruction

Returns `{ success, result: { executed, message, plan?, document?, needsClarification? } }`.

`GET /api/health` — agent status + Document Engine reachability.

## Configuration

See `.env.example`. Credentials are **never hardcoded**; AWS resolves them from
the standard chain (env vars / profile / IAM role).

| Var | Purpose |
|-----|---------|
| `PORT` | Agent HTTP port (default 4000) |
| `DOCUMENT_ENGINE_URL` | Document Engine base URL (default `http://localhost:5001`) |
| `AWS_REGION` | Bedrock region |
| `BEDROCK_MODEL_ID` | Model id (default `global.anthropic.claude-sonnet-4-6`) |
| `BEDROCK_TEMPERATURE` | Sampling temperature (default `0`) |

## Develop & run

```bash
npm install
cp .env.example .env      # set AWS + DOCUMENT_ENGINE_URL
npm run start:dev         # tsx src/index.ts  (or: npm run dev to watch)
```

## Tests

```bash
# Unit — schema validation + SDK wiring. No AWS, no network.
npm run test:unit

# Integration — tools against the REAL Document Engine (no AWS).
#   Start the engine first (document-engine), then:
DOCUMENT_ENGINE_URL=http://127.0.0.1:5001 npm run test:integration

# REAL Bedrock — full agent → model → tools. Gated; skips unless enabled:
RUN_BEDROCK_TESTS=1 npm run test:integration    # requires AWS creds + engine up
```

The real Bedrock tests **skip** (they never fake success) unless
`RUN_BEDROCK_TESTS=1` and AWS credentials are present.

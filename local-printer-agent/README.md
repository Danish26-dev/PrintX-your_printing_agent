# PrintX Local Printer Agent

A small service that runs on the **shopkeeper's computer** (the machine
physically connected to the printer) and exposes real printer operations to the
PrintX Backend over HTTP. A browser or a cloud/container Backend cannot reliably
control a local USB/network printer; this agent is the trust boundary that can.

## Why it exists

The PrintX Backend may run in a container or in the cloud, with no path to a
physical printer. Instead of faking printing, the Backend delegates to this
local agent, which uses the **Windows print subsystem** to discover printers,
report availability, and submit jobs. If the agent is not running, the Backend
honestly reports that no printer is connected and refuses to fake a print.

## Capabilities (allowlisted — no generic shell)

- `GET  /health` — liveness.
- `GET  /printers` — real printer discovery (name, driver, port, status,
  default flag). Capabilities it cannot confirm (colour/duplex support) are
  reported as `null` (unknown), never fabricated.
- `GET  /printers/:id/availability` — is a specific printer available now.
- `POST /validate` — validate a proposed print configuration against the
  discovered printers (allowlist only).
- `POST /print` — submit an **approved** job (`{ config, documentBase64 }`).
  The agent re-validates against live discovery before submitting. A success
  means the Windows spooler **accepted** the job — not that paper printed.

There is deliberately **no** generic command/shell endpoint.

## Requirements

- Windows (uses `Get-Printer` / `Win32_Printer` via a PowerShell script file).
- Node 18+.
- A PDF print path: this agent uses [`pdf-to-printer`](https://www.npmjs.com/package/pdf-to-printer),
  which bundles SumatraPDF to spool PDFs with explicit printer/copies settings,
  so it does not depend on a system PDF reader / file association.

## Run

```bash
npm install
# optional config:
#   PRINTER_AGENT_PORT=7777 PRINTER_AGENT_TOKEN=<secret>
npm start
```

Then point the Backend at it: set `PRINTER_AGENT_URL=http://127.0.0.1:7777`
(and `PRINTER_AGENT_TOKEN` if you set one) in the Backend environment.

## Security

- Binds to `127.0.0.1` by default.
- When `PRINTER_AGENT_TOKEN` is set, every request (except `/health`) must send
  a matching `x-printer-agent-token` header; otherwise only loopback callers are
  accepted.
- Document bytes are written to a temp file for spooling and deleted after; they
  are never logged.

## Honesty

- Never returns a fabricated printer device.
- Never claims physical completion — a successful submit is `PRINT_SUBMITTED`
  (spooler accepted), not `PRINTED`.
- Capabilities that cannot be queried are reported as unknown.

## Tests

```bash
node --test
```

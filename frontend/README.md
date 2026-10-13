# PrintX Frontend

React (Create React App + CRACO) UI for PrintX. It talks ONLY to the Backend
control plane — never directly to the Strands Agent, the Document Engine,
Bedrock, or AWS.

```
React (this app) → Backend API → Strands Agent → Document Engine
```

## Toolchain

- Create React App via CRACO (`craco start` / `craco build`)
- Tailwind + shadcn/ui, react-router-dom, lucide-react
- Path alias `@/` → `src/` (see `craco.config.js`, `jsconfig.json`)

## Environment

Configure the Backend URL (CRA convention):

```
# .env  (see .env.example)
REACT_APP_API_BASE_URL=http://localhost:3001
```

The value is read once, centrally, in `src/services/apiClient.js`. Do not
hardcode the URL in components. No AWS credentials ever live in the frontend.

## Run

```bash
npm install --legacy-peer-deps
npm start          # craco start, http://localhost:3000
npm run build      # craco build (real production bundle)
```

## Local full-stack startup order

1. Document Engine  — `document-engine`  (port 5001)
2. Strands Agent    — `strands-agent`     (port 4000, needs AWS creds to reason)
3. Backend          — `backend`           (port 3001)
4. Frontend         — this app            (port 3000)

## Where the real integration lives

- `src/services/apiClient.js` — the single API layer (base URL, JSON/multipart,
  error mapping, preview/download URLs).
- `src/services/fileService.js` — real upload → job creation.
- `src/services/chatService.js` — maps real Backend job state into chat messages
  (READY_FOR_PREVIEW / NEEDS_CLARIFICATION / failures). No fake AI responses.
- `src/components/workspace/ChatInterface.jsx` — upload, instruction, approve,
  and honest print flow.
- `src/components/workspace/PreviewDrawer.jsx` — renders the real processed
  document for preview/download when the Backend reports it is ready.

## Still mocked

- `src/services/shopService.js` — shop discovery is local DEMO data only; there
  is no shop/channel endpoint in the Backend yet. This is clearly isolated and
  is the only remaining mock in the workspace flow.

## Honesty notes

- Printing shows an honest "ready for the shop to print" state. The UI never
  claims a document was physically printed — there is no real printer event.
- The frontend performs no document parsing/conversion/editing; that is entirely
  the Backend + Document Engine's responsibility.

# ernest-mail

Mission: Provide email account creation and email sending APIs for Ernest agents.

## Architecture
- Express 5 service with JSON APIs; `/health` is open, all other routes require admin API key.
- File-backed storage in `data/accounts.json` and `data/agents.json` with atomic writes via temp files.
- Provider adapters isolate email vendors; only `local-dev` is implemented today via `LocalDevProviderAdapter` (no external calls).
- Security: `Authorization: ApiKey <key>` middleware, in-memory rate limiting, structured error responses, and request logging with request IDs.
- Optional agent attestation flows (TPM/FIDO2) are stubbed via `FileAgentRegistry` for future hardware-bound agents.

## API
All admin routes require `Authorization: ApiKey <key>` matching `API_KEY` in environment.

### Health
`GET /health`

```bash
curl http://127.0.0.1:3100/health
```

### Create account
`POST /accounts`

```bash
curl -X POST http://127.0.0.1:3100/accounts \
  -H "Authorization: ApiKey $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"email":"agent@example.com","provider":"local-dev"}'
```

### Fetch account by ID
`GET /accounts/:id`

```bash
curl -H "Authorization: ApiKey $API_KEY" \
  http://127.0.0.1:3100/accounts/<accountId>
```

### Send email
`POST /emails/send`

```bash
curl -X POST http://127.0.0.1:3100/emails/send \
  -H "Authorization: ApiKey $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "accountId": "<accountId>",
    "to": "recipient@example.com",
    "subject": "Hello from Ernest",
    "text": "Plain body",
    "html": "<p>HTML body</p>"
  }'
```

### Agent registration (admin-only)
`GET /agents/register/options?agentId=<id>` to fetch WebAuthn options, then `POST /agents/register` with the attestation result.

```bash
curl -H "Authorization: ApiKey $API_KEY" \
  "http://127.0.0.1:3100/agents/register/options?agentId=agent-123"

curl -X POST http://127.0.0.1:3100/agents/register \
  -H "Authorization: ApiKey $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"agentId":"agent-123","format":"tpm","publicKey":"..."}'
```

## Local development
- Prerequisites: Node.js 20+ and npm.
- Install deps: `npm install`
- Configure env: `cp .env.example .env` then set `API_KEY` (required) and optional paths/limits.
- Start dev server: `npm run dev` (binds 127.0.0.1:3100 by default; production binds 0.0.0.0 when `NODE_ENV=production`).
- Run checks: `npm run lint && npm run build && npm test`
- Data files in `data/` persist between runs; delete them to reset local state.

# Attestation Operational Guide

Agent routes (`POST /emails/send`) require hardware attestation (TPM or FIDO2) via the `X-Attestation` header. Admin routes (`/accounts`, `/agents/register`, `/credits/:tenantId`) use `Authorization: ApiKey <key>`.

## Key Rotation and Revocation

### TPM agents

TPM agents are registered with a public key. To revoke or rotate:

1. **Revoke**: Remove the agent from `data/agents.json` (or `AGENTS_PATH`). The agent will immediately receive 401 or equivalent for attestation verification.

2. **Rotate**: Generate a new TPM key pair. Register the new public key via `POST /agents/register` (admin, API key) with a new or same `agentId`. Update the client to use the new key. Optionally remove the old entry from the registry file.

### FIDO2 agents

FIDO2 credentials are tied to `credentialId`. To revoke:

1. Remove the credential entry from the registry (the `fido2`-format agent record). The client will receive 401 for that credential.

2. To rotate: Register a new FIDO2 credential (new authenticator or new credential on same device), then remove the old credential from the registry.

### Admin API key

Rotate `API_KEY` in the environment and restart the server. Update all admin clients (e.g. Ernest Agent’s `ERNEST_MAIL_API_KEY`) to use the new key.

## Failure Modes

| Symptom | Cause | Remedy |
|---------|-------|--------|
| 401 "X-Attestation" hint | Missing or invalid attestation header | Ensure client sends `X-Attestation` with base64url-encoded TPM/FIDO2 attestation; agent must be registered |
| 401 "Attestation already used" | Replay detected (single-use) | Each request needs a fresh attestation; never reuse |
| 401 "Unauthorized" (no hint) | Path/method/bodyHash mismatch | Attestation payload must match actual request (method, path, canonical body hash, and tenantId when used) |
| 401 timestamp-related | Stale attestation (>5 min) | Re-sign with current timestamp |
| 503 "Admin auth not configured" | `API_KEY` unset | Set `API_KEY` for admin routes |

## Ernest Agent Client Migration

The Ernest Agent `ernest-mail-client` currently uses `Authorization: ApiKey` for all requests. For `POST /emails/send`, ernest-mail now requires `X-Attestation` instead.

### Migration path

1. **Preregistration**: Register the agent via `POST /agents/self-register` (token + key proof) or `POST /agents/register` (admin, API key). For self-register: obtain a token from `POST /tokens`, set `ERNEST_MAIL_REGISTRATION_TOKEN`, then call `registerErnestMailAgent()` once (or rely on lazy registration on first send).
2. **Client changes**: Update `sendViaErnestMail` (and any tool calling it) to:
   - Produce TPM or FIDO2 attestation for each send request
   - Send `X-Attestation: <base64url-encoded-attestation>` instead of (or in addition to) API key for `/emails/send`
3. **Admin routes**: Continue using `ERNEST_MAIL_API_KEY` for `createErnestMailAccount`, `POST /accounts`, etc.

### Attestation payload (TPM)

The signed payload must include:

- `timestamp`: ISO 8601, within 5 minutes of request
- `method`: e.g. `"POST"`
- `path`: e.g. `"/emails/send"`
- `bodyHash`: SHA-256 hex of canonical JSON body (sorted keys, no whitespace)
- `tenantId`: (optional) when the route uses tenant scoping

Use `computeBodyHash` from `ernest-mail` attestation module for body hash compatibility.

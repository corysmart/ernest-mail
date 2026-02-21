# ernest-mail Build Plan

**Validated:** 2026-02-12  
**Source:** HEARTBEAT task queue validation against actual repo state  
**Consumer:** Ernest Agent only — see `../Ernest Agent`

### What's New (beyond HEARTBEAT queue)

- **Agent-only gating**: ernest-mail must be gated so only agents can access it. **Iterative security** (console model): assume max-power adversaries; aim for costly-to-break, detectable, patchable — not "impossible."
- **Integration contract**: Ernest Agent tools will call ernest-mail instead of nodemailer. Contract defined below.
- **Phase 5**: Ernest Agent repo changes (env vars, client, tool refactors) to complete the integration.
- **Resend API**: Default email provider; free tier (3,000 emails/month, 100/day) for early use.
- **Credits / micropayments**: Agents buy credits; each email costs credits. Admin agent(s) get free access.
- **Observability, spam & abuse prevention**: Logging, rate limits, content checks, malicious-use controls.

---

## Agent-Only Gating: Goal and Security Model

**Goal:** The agent ecosystem (ernest-mail and future services) must be **gated so that only agents can access it**. Humans, spoofed clients, and modified code must be excluded.

### Threat Model: Max-Power Adversaries

We assume **maximum-power adversaries** who intend to bring the system down:

- User runs Ernest Agent on **their own machine** with full access: memory, env, disk, network.
- Adversary can root the machine, patch the OS, extract secrets, forge requests.
- A shared API key in env cannot stay secret; it will be extracted.

We do **not** assume we can make the system unbreakable. We assume adversaries will eventually find holes.

### Iterative Security (Console Model)

Video game consoles face max-power adversaries (modders, pirates) yet patch exploits over time. The first release may be imperfect; they ship updates that close holes; the cycle repeats. Security is **iterative**, not perfect.

| Principle | Implementation |
|-----------|----------------|
| **Costly to break** | Hardware-bound keys (TPM, FIDO2). Keys not trivially extractable; breaking requires skill and effort. |
| **Detectable** | Abuse detection (anomalous rate, recipients, patterns). ernest-mail logs and monitors; anomalies flag exploitation. |
| **Patchable** | When a hole is found, we ship an update. New version closes it; adversary must find a new exploit. |
| **Revocable** | Detected abuse → revoke credential. Adversary must re-register and re-extract on new version. |
| **Layered** | Multiple defenses: hardware + code signing + attestation + rate limits + audit. Breaking one layer is not enough. |

We aim for **practical security through iteration**, not mathematical impossibility.

### Attestation Options (Hardware-Bound Keys)

| Approach | Description | Notes |
|----------|-------------|-------|
| **TPM** | Non-exportable key in TPM; optionally bound to agent binary (PCR policy). Signs each request. | Cross-platform (Windows, Linux; Mac with T2/Secure Enclave). Key cannot be extracted. |
| **FIDO2 / YubiKey** | Key in hardware authenticator. Agent uses headless credential. ernest-mail verifies assertion. | Cross-platform. Key not copyable. Requires physical device. |
| **macOS Keychain + app binding** | Key in Keychain; ACL restricts to signed Ernest Agent only. | Mac-only fallback if TPM unavailable. Native helper required. |
| **Server-deployed agent** | Agent runs on trusted infrastructure; key never on user machine. | Strongest; requires hosted deployment. |

**v1: TPM or FIDO2.** Cross-platform from the start. Both are available on Windows, Linux, and Mac (TPM or platform authenticator). Prefer TPM where present (no extra hardware); fall back to FIDO2 (YubiKey, etc.) when TPM is unavailable or not usable.

### Phased Auth Strategy

| Phase | Auth | Use case |
|-------|------|----------|
| **Admin flows** | API key only | Registration, account provisioning. Never used for agent sends. |
| **v1 Agent flows** | TPM or FIDO2 | Cross-platform attestation. Hardware-bound keys from day one. |
| **Server-deployed** | API key (server-held) | Agent on trusted infra; key never on user machine. (Future.) |

### Principles

| Principle | Implementation |
|-----------|----------------|
| **Single consumer** | Only Ernest Agent. No other clients supported. |
| **No client app** | No web UI, no dashboard. Agent calls API programmatically. |
| **No human intervention** | Auth works without login flows, browser, or user action. Hardware signing is automated. |
| **Bind localhost by default** | In dev, ernest-mail on `127.0.0.1`; reduces exposure. |

**Ecosystem scope:** This gating strategy applies to ernest-mail and the broader Ernest agent ecosystem. Future services should use the same model.

---

## Resend API (Default Provider)

ernest-mail uses **Resend** as the primary email provider for real delivery. Resend provides:

| Aspect | Details |
|--------|---------|
| **Free tier** | 3,000 emails/month, 100/day. Sufficient for early use. |
| **API** | REST `POST https://api.resend.com/emails` with `Authorization: Bearer re_xxxx`. |
| **From address** | Must use verified domain or Resend's onboarding domain. |
| **SDK** | Official Node.js SDK: `resend` package. |

**Provider hierarchy:**
- `resend` — Default for production. Single Resend API key in env; all sends go through it.
- `local-dev` — Ethereal/test capture; no real delivery. For development.
- `smtp` — Optional; for agents with their own SMTP. Lower priority than Resend at launch.

**Implementation:** Add `resend` to `AccountProvider` in `accounts.ts`. Resend account provisioning: one global Resend API key in env; accounts specify `from` address (must be verified in Resend or use onboarding domain).

---

## Credits and Micropayments

Agents must have credits to send emails. Each send deducts credits.

| Concept | Implementation |
|--------|----------------|
| **Credit unit** | 1 credit = 1 email (or configurable, e.g. 1 credit = 1 email for Resend). |
| **Wallet** | Per-tenant (or per-agent) balance. Keyed by `tenantId` from Ernest Agent request. |
| **Deduction** | Before `POST /emails/send` succeeds: check balance, deduct cost, then send. If insufficient credits → 402 Payment Required. |
| **Purchase** | Out of scope for v1: manual top-up (admin sets balance), or future payment integration. |
| **Cost** | Configurable. Default: 1 credit per email. |

### Admin Agent Exemption

Tenants listed in `ADMIN_TENANT_IDS` (or `ADMIN_AGENT_IDS`) bypass credit deduction — unlimited free access.

| Env Var | Purpose |
|---------|---------|
| `ADMIN_TENANT_IDS` | Comma-separated tenant IDs that get free credits (e.g. `admin,owner,cory-admin`). |
| `ADMIN_AGENT_IDS` | Alias; same semantics. |

Ernest Agent passes `tenantId` in the request (from auth principal). ernest-mail checks: if `tenantId` is in the allowlist, skip deduction and allow send.

---

## Observability

| Requirement | Implementation |
|-------------|-----------------|
| **Request logging** | Log every request: method, path, tenantId (or principal), status, duration. Structured JSON to stdout. |
| **Send events** | Log each email send: tenantId, accountId, recipient, Resend ID, cost deducted (or "admin-free"). |
| **Error tracking** | Log failures with context (provider error, validation, credit insufficient). |
| **Metrics (optional)** | Counters: sends_total, sends_failed, credits_deducted. Export via optional Prometheus endpoint or log aggregation. |
| **Audit trail** | Immutable log of sends for compliance and abuse investigation. |

---

## Spam Prevention

| Control | Implementation |
|--------|-----------------|
| **Per-tenant rate limit** | Max N emails per tenant per hour (configurable). 429 when exceeded. |
| **Global rate limit** | Max emails per minute across all tenants (respect Resend's 100/day free tier). |
| **Recipient limits** | Max recipients per email (e.g. 1 for v1 — no broadcast). Resend allows up to 50; we restrict lower. |
| **Content validation** | Reject obviously spammy patterns (e.g. excessive links, known spam keywords). Lightweight heuristics. |
| **Daily caps** | Per-tenant daily limit (e.g. 50/day on free tier to stay under Resend's 100). |

---

## Malicious Use Prevention

| Control | Implementation |
|--------|-----------------|
| **API key / attestation auth** | Required; no anonymous sends. Attestation (Phase 3.5) adds hardware-bound keys. |
| **Tenant isolation** | Credits and rate limits are per-tenant. No cross-tenant leakage. |
| **Input validation** | Strict schema: email format, subject/body length limits, no executable content. |
| **Abuse detection** | Anomalous rate, recipients, patterns → flag and revoke credential. Adversary must re-register. |
| **Blocklist** | Optional blocklist of domains or addresses. |
| **Suspicious pattern detection** | Flag rapid repeated sends to same recipient; temporary throttle or block. |
| **Audit on deny** | Log all denied requests for review. Supports iterative response when exploits emerge. |

---

## Integration Contract: Ernest Agent ↔ ernest-mail

Ernest Agent currently has tools that use nodemailer + local file config. They will be migrated to call ernest-mail instead.

### Current Ernest Agent Tools (to migrate)

| Tool | Current Behavior | ernest-mail Equivalent |
|------|------------------|------------------------|
| `create_test_email_account` | Nodemailer createTestAccount (Ethereal) → save to data/email-config.json | `POST /accounts` with `provider: "local-dev"` |
| `save_email_config` | Save SMTP creds to data/email-config.json | `POST /accounts` with `provider: "smtp"` + provider-specific creds |
| `send_email` | Load config, nodemailer.sendMail | `POST /emails/send` with `accountId` or `email` |

### Required ernest-mail API Shape (for Ernest Agent)

| Endpoint | Ernest Agent Use | Credit / Auth |
|----------|------------------|---------------|
| `POST /accounts` | Create managed account. Body: `{ email, provider, status?, smtp?: {...} }`. `resend` uses global Resend key. | API key required. |
| `GET /accounts/:id` | Lookup account before send (optional). | API key required. |
| `POST /emails/send` | Body: `{ accountId?, email?, to, subject, body?, html?, tenantId? }`. Header `X-Tenant-Id` or body `tenantId` for credits. | API key + tenantId. Deduct credits unless admin. Return 402 if insufficient credits. |
| `GET /credits/:tenantId` | (Optional) Agent checks balance before send. | API key required. |

**Note:** Provider-specific credentials (SMTP) stored securely. Resend uses single `RESEND_API_KEY` env var; no per-account Resend creds.

### Ernest Agent Env (new)

| Variable | Purpose |
|----------|---------|
| `ERNEST_MAIL_URL` | Base URL for ernest-mail (e.g. `http://127.0.0.1:3100`). When unset, tools fall back to legacy nodemailer behavior. |
| `ERNEST_MAIL_API_KEY` | API key for ernest-mail. Must match ernest-mail's `API_KEY`. When unset with URL set, requests fail. |

**Credits:** Ernest Agent's ernest-mail client must pass `tenantId` (header or body) so ernest-mail can deduct credits and apply admin exemption.

**Tenant propagation:** Ernest Agent must pass `tenantId` to ernest-mail. Options:
- Header: `X-Tenant-Id: <tenantId>`
- Or body field for `POST /emails/send`: `tenantId`

ernest-mail uses this to: (1) deduct credits from the tenant's wallet, (2) apply per-tenant rate limits, (3) check admin exemption.

### ernest-mail Env Summary

| Variable | Purpose |
|----------|---------|
| `API_KEY` | Required for non-health routes. Ernest Agent sends this. |
| `RESEND_API_KEY` | Resend API key for email delivery. Free tier: 3k/month. |
| `ADMIN_TENANT_IDS` | Comma-separated tenant IDs with free credits (e.g. `admin,owner`). |
| `ACCOUNTS_PATH` | Path to accounts JSON file (default: `data/accounts.json`). |
| `CREDITS_PATH` | Path to credits/wallet store (default: `data/credits.json`). |
| `PORT` | HTTP port (default: 3100). |
| `RATE_LIMIT_EMAILS_PER_TENANT_PER_HOUR` | Per-tenant send limit (default: 30). |
| `RATE_LIMIT_EMAILS_GLOBAL_PER_MINUTE` | Global send limit (default: 10). |

### Migration Strategy

1. **ernest-mail first**: Implement full API (accounts + send) with agent-only auth.
2. **Ernest Agent tools**: Add optional ernest-mail client. When `ERNEST_MAIL_URL` is set, tools call ernest-mail; otherwise use legacy nodemailer (backward compatible).
3. **Deprecation**: Once stable, remove legacy path from Ernest Agent tools.

---

## Goal Realization Criteria

The mission: *"Provide email account creation and email sending APIs for Ernest agents."*

**Goal is realized when:**

1. ernest-mail exposes `POST /accounts` and `POST /emails/send` (plus health).
2. All non-health routes require API key; no public UI exists.
3. Ernest Agent tools can use ernest-mail when `ERNEST_MAIL_URL` is configured.
4. An agent run that creates an account and sends an email via ernest-mail succeeds end-to-end.
5. **Resend** is the default provider (free tier for early use).
6. **Credits** are required for sends; agents without credits get 402. **Admin agent** (via `ADMIN_TENANT_IDS`) bypasses credit deduction.
7. **Observability**: Request and send events logged; failures traced.
8. **Spam and malicious use** mitigated via rate limits, validation, and audit.

---

## Validation Summary: Task Queue vs Actual State

| Task | Queue Status | Actual State | Notes |
|------|--------------|--------------|-------|
| **0.0** Git init, .gitignore, initial commit | [x] | **INCOMPLETE** | No `git init`; no `.gitignore`; workspace reports "Is directory a git repo: No" |
| **0.1** Workspace, README | [x] | ✅ DONE | README exists with mission statement |
| **0.2** Node + TypeScript scaffold | [x] | ✅ DONE | package.json, tsconfig, src/, tests/, build/dev/test/lint scripts; deps installed |
| **0.3** HTTP server + `/health` | [x] | **INCOMPLETE** | `src/index.ts` does not exist; dev script references it; no Express server |
| **1.1** Account domain model | [x] | ✅ DONE | `src/accounts.ts` — Account, CreateAccountInput, AccountRepository |
| **1.2** File-backed repository | [ ] | ✅ DONE | `src/fileAccountRepository.ts` — full CRUD, atomic writes (temp+rename), write lock |
| **1.3** POST /accounts | [ ] | NOT DONE | Blocked by 0.3 (no HTTP server) |
| **1.4** Tests for model/repo/POST | [ ] | NOT DONE | `tests/` is empty |
| **2.x** Email sending | [ ] | NOT DONE | — |
| **3.x** Security/ops | [ ] | NOT DONE | — |
| **4.x** Done criteria | [ ] | NOT DONE | — |

---

## Discrepancies

1. **0.0** — Queue shows complete; repo has no git. Either different environment or reverted.
2. **0.3** — Queue shows complete; Run Notes (2026-02-11) say "Reversed 0.3: src/index.ts missing". No HTTP server present.
3. **1.2** — Queue shows incomplete; implementation exists and is complete (atomic writes, write lock, all interface methods).

---

## Recommended Execution Order

Per HEARTBEAT rules: run only the **first unchecked** task, but 1.2 is already done. Recommended order accounts for blockers and dependencies.

### Step 1 (if needed): 0.0 — Git bootstrap
- Run `git init`
- Add `.gitignore` (node_modules, dist, .env)
- Make initial commit

**Blocker check:** Skip if repo is already a git repo with baseline commit.

---

### Step 2: 0.3 — Minimal HTTP server
- Create `src/index.ts` with Express app and `GET /health` returning `{ "status": "ok" }`
- Verify with local smoke test: `npm run dev` + `curl http://localhost:PORT/health`

**Blocking:** Required for 1.3 (POST /accounts).

---

### Step 3: Mark 1.2 [x] + Run 1.3 — POST /accounts
- 1.2 is done; mark complete in task queue
- Implement `POST /accounts`:
  - Wire `FileAccountRepository` (e.g. from env or default path)
  - Validate body (email, provider)
  - Duplicate check via `getByEmail`
  - Return 201 + account or 409 on duplicate
  - Use appropriate error responses (400 invalid, 409 conflict)

---

### Step 4: 1.4 — Tests
- Unit tests: account model / types
- Repo tests: FileAccountRepository (temp dir, atomic write, duplicate detection)
- API tests: POST /accounts success, validation failure, duplicate

---

### Step 5: Phase 2 — Email sending (2.1–2.4)
- Provider adapter interface
- **Resend adapter** (default): use `resend` npm package, `RESEND_API_KEY` env. Map `Account` with `provider: "resend"` to Resend API.
- Local/dev test adapter (Ethereal or in-memory capture)
- `POST /emails/send` endpoint — Resend for real delivery
- Tests for send flow

---

### Step 6: Phase 2.5 — Credits and admin (or fold into Phase 2/3)
- Wallet/credits store: file-backed or in-memory. Keyed by `tenantId`. Balance, deduct, top-up (admin).
- Credit check before send: if balance < cost (default 1), return 402. Deduct on success.
- Admin exemption: `ADMIN_TENANT_IDS` env. If tenantId in list, skip deduction.
- Optional: `GET /credits/:tenantId` for balance check.

### Step 7: Phase 3 — Security, observability, abuse prevention
- **Auth**: API key middleware (required for non-health routes). **Interim** — Phase 3.5 adds attestation (TPM or FIDO2, cross-platform). Iterative security: v1 raises bar; patch when exploited.
- **Observability**: Structured request logging (method, path, tenantId, status, duration); send-event logging (tenantId, recipient, cost, Resend ID); error logging with context
- **Spam prevention**: Per-tenant rate limit (emails/hour); global rate limit; recipient cap (e.g. 1 per send); light content validation
- **Malicious use**: Tenant isolation; input validation (email format, length limits); blocklist (optional); audit on deny
- **Config**: `.env.example` (API_KEY, RESEND_API_KEY, ADMIN_TENANT_IDS, rate limits, storage path)
- Bind to localhost by default in dev

### Step 7.5: Phase 3.5 — Attestation (iterative, cross-platform, agent-only gating)
- **ernest-mail**: Signature verification middleware. Accept API key (interim) or attested request (TPM or FIDO2).
- **Ernest Agent v1**: TPM or FIDO2 from the start. Cross-platform: Windows, Linux, Mac. Prefer TPM where present; FIDO2 (YubiKey, etc.) when TPM unavailable.
- **Abuse detection**: Anomalous rate/recipients → revoke credential. Adversary must re-register.

---

### Step 8: Phase 4 — Done
- Lint, build, tests green
- README with architecture and API examples
- CHANGELOG initial release note

---

### Step 9: Phase 5 — Ernest Agent Integration (ernest-mail side done; Agent repo changes)

**In ernest-mail (already covered by Phases 1–3):**
- All APIs ready for Agent consumption
- Auth, rate limit, config docs in place

**In Ernest Agent** (`../Ernest Agent`):
- Add `ERNEST_MAIL_URL` and `ERNEST_MAIL_API_KEY` to env validation
- Create `tools/ernest-mail-client.ts`: thin HTTP client for POST /accounts, POST /emails/send
- Refactor `send_email`: when `ERNEST_MAIL_URL` set → call ernest-mail; else legacy nodemailer
- Refactor `create_test_email_account`: when URL set → `POST /accounts` { provider: "local-dev" }; else Ethereal
- Refactor `save_email_config`: when URL set → `POST /accounts` { provider: "smtp", ... }; else file
- Update tools/README.md and docs/api.md with ernest-mail integration
- Add integration test: Agent → ernest-mail (optional; can be e2e in Agent repo)

---

## First Unchecked Task (per HEARTBEAT)

**Task queue:** 1.2 (first unchecked)  
**Actual:** 1.2 is implemented

**Action:** Mark 1.2 `[x]` and treat the next unchecked task as 1.3. However, 1.3 depends on 0.3, which is incomplete. So the practical first run should be either:
- **0.0** if git is required to avoid losing progress, or
- **0.3** to unblock 1.3.

---

## File Inventory (src/)

| File | Purpose |
|------|---------|
| `accounts.ts` | Domain types and `AccountRepository` interface |
| `fileAccountRepository.ts` | File-backed `AccountRepository` implementation |
| `index.ts` | **MISSING** — should be Express app with /health |

---

## Quick Commands

```bash
npm run build   # ✅ passes
npm run test    # (no tests yet; vitest may report 0 tests)
npm run lint    # (requires eslint config for .ts)
npm run dev     # fails — src/index.ts missing
```

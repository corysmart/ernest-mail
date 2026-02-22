# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-02-22

### Added
- Express JSON API service with `/health` open and admin-only `/accounts` and `/emails/send` endpoints secured by API key.
- File-backed account storage with atomic writes; account creation, retrieval, and validation for duplicate emails/providers.
- Email sending through the `local-dev` provider adapter using stored accounts, with structured validation and error handling.
- Security middleware: API key auth, request logging with request IDs, in-memory rate limiting, and standardized error responses.
- Agent attestation stub endpoints backed by a file registry for future TPM/FIDO2 support.
- Tooling and docs: lint/build/test scripts, passing test suite, and `.env.example` documenting configuration.

### Known gaps
- Only the `local-dev` provider exists; no real email delivery provider integration yet.
- Storage is local filesystem only; no external database, backups, or migrations.
- Rate limiting is in-memory and not distributed; single-process only.
- No account listing or deletion endpoints; minimal audit logging.
- Attestation flow is stubbed and not verified against hardware keys.
- No outbound SMTP/third-party transport is wired; emails are not actually sent beyond the dev adapter.

/**
 * Integration tests for POST /emails/send auth.
 * Agent routes require X-Attestation; API key is rejected.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { computeBodyHash } from '../src/attestation/bodyHash.js';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { app } from '../src/index.js';
import type { Server } from 'node:http';

let server: Server;
let baseUrl: string;

const minimalPayload = {
  accountId: '00000000-0000-0000-0000-000000000000',
  to: 'test@example.com',
  subject: 'Test',
  text: 'Body',
};

beforeEach(async () => {
  process.env.API_KEY = 'test-key';
  process.env.AGENTS_PATH = join(
    mkdtempSync(join(tmpdir(), 'ernest-agents-')),
    'agents.json'
  );
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  baseUrl =
    addr && typeof addr === 'object'
      ? `http://127.0.0.1:${addr.port}`
      : 'http://127.0.0.1:3100';
});

afterEach(() => {
  delete process.env.API_KEY;
  return new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
});

describe('POST /emails/send', () => {
  it('returns 401 when X-Attestation header is missing', async () => {
    const res = await fetch(`${baseUrl}/emails/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(minimalPayload),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(body.hint).toContain('X-Attestation');
  });

  it('returns 401 when API key is used instead of attestation', async () => {
    const res = await fetch(`${baseUrl}/emails/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: 'ApiKey test-key',
      },
      body: JSON.stringify(minimalPayload),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
    expect(body.hint).toContain('X-Attestation');
  });

  it('returns 401 when X-Attestation is invalid (not base64url JSON)', async () => {
    const res = await fetch(`${baseUrl}/emails/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Attestation': 'not-valid-base64-json!!!',
      },
      body: JSON.stringify(minimalPayload),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 401 when attestation bodyHash does not match request body', async () => {
    const att = {
      format: 'tpm',
      signature: 'sig',
      publicKey: 'pk',
      payload: {
        timestamp: new Date().toISOString(),
        method: 'POST',
        path: '/emails/send',
        bodyHash: 'wrong-hash',
      },
    };
    const raw = Buffer.from(JSON.stringify(att), 'utf8').toString('base64url');
    const res = await fetch(`${baseUrl}/emails/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Attestation': raw,
      },
      body: JSON.stringify(minimalPayload),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when attestation path does not match request (cross-route replay)', async () => {
    const att = {
      format: 'tpm',
      signature: 'sig',
      publicKey: 'pk',
      payload: {
        timestamp: new Date().toISOString(),
        method: 'GET',
        path: '/health',
        bodyHash: '',
      },
    };
    const raw = Buffer.from(JSON.stringify(att), 'utf8').toString('base64url');
    const res = await fetch(`${baseUrl}/emails/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Attestation': raw,
      },
      body: JSON.stringify(minimalPayload),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when X-Attestation is valid base64 but unknown agent', async () => {
    const bodyHash = computeBodyHash(minimalPayload);
    const att = {
      format: 'tpm',
      signature: 'sig',
      publicKey: 'unknown-pubkey',
      payload: {
        timestamp: new Date().toISOString(),
        method: 'POST',
        path: '/emails/send',
        bodyHash,
      },
    };
    const raw = Buffer.from(JSON.stringify(att), 'utf8').toString('base64url');
    const res = await fetch(`${baseUrl}/emails/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Attestation': raw,
      },
      body: JSON.stringify(minimalPayload),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

});

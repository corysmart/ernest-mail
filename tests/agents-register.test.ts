/**
 * Tests for POST /agents/register and GET /agents/register/options.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { app } from '../src/index.js';
import type { Server } from 'node:http';

let server: Server;
let baseUrl: string;

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

const authHeaders = { authorization: 'ApiKey test-key' };

describe('GET /agents/register/options', () => {
  it('returns 400 when agentId is missing', async () => {
    const res = await fetch(`${baseUrl}/agents/register/options`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const res = await fetch(
      `${baseUrl}/agents/register/options?agentId=test-agent`
    );
    expect(res.status).toBe(401);
  });

  it('returns registration options with auth', async () => {
    const res = await fetch(
      `${baseUrl}/agents/register/options?agentId=test-agent`,
      { headers: authHeaders }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.challenge).toBeDefined();
    expect(body.rp).toBeDefined();
    expect(body.user).toBeDefined();
  });
});

describe('POST /agents/register', () => {
  it('returns 400 when agentId is missing', async () => {
    const res = await fetch(`${baseUrl}/agents/register`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({ format: 'tpm', publicKey: 'dummy' }),
    });
    expect(res.status).toBe(400);
  });

  it('registers TPM agent', async () => {
    const res = await fetch(`${baseUrl}/agents/register`, {
      method: 'POST',
      headers: { ...authHeaders, 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: 'tpm-agent-1',
        format: 'tpm',
        publicKey:
          'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE' +
          'xampleBase64UrlEncodedSpkiKeyPlaceholder',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.agentId).toBe('tpm-agent-1');
    expect(body.format).toBe('tpm');
  });
});

/**
 * Tests for POST /agents/self-register (token + attestation-based, no admin).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateKeyPairSync, createSign, createPublicKey } from 'node:crypto';
import { app } from '../src/index.js';
import type { Server } from 'node:http';

let server: Server;
let baseUrl: string;
let token: string;

beforeEach(async () => {
  process.env.API_KEY = 'test-key';
  const tmpDir = mkdtempSync(join(tmpdir(), 'ernest-self-reg-'));
  process.env.AGENTS_PATH = join(tmpDir, 'agents.json');
  process.env.REGISTRATION_TOKENS_PATH = join(tmpDir, 'tokens.json');
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  baseUrl =
    addr && typeof addr === 'object'
      ? `http://127.0.0.1:${addr.port}`
      : 'http://127.0.0.1:3100';
  const tokRes = await fetch(`${baseUrl}/tokens`, {
    method: 'POST',
    headers: { Authorization: 'ApiKey test-key', 'Content-Type': 'application/json' },
    body: '{}',
  });
  const tokData = (await tokRes.json()) as { tokens: string[] };
  token = tokData.tokens[0];
});

afterEach(() => {
  delete process.env.API_KEY;
  delete process.env.AGENTS_PATH;
  delete process.env.REGISTRATION_TOKENS_PATH;
  return new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
});

function createSelfRegisterPayload() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = createPublicKey(privateKey);
  const publicKey = pub.export({ type: 'spki', format: 'der' }) as Buffer;
  const payload = {
    action: 'register',
    agentId: 'my-agent',
    timestamp: new Date().toISOString()
  };
  const sign = createSign('SHA256');
  sign.update(JSON.stringify(payload, ['action', 'agentId', 'timestamp']), 'utf8');
  sign.end();
  const signature = sign.sign(privateKey).toString('base64url');
  return {
    token,
    agentId: 'my-agent',
    format: 'tpm',
    publicKey: publicKey.toString('base64url'),
    signature,
    payload
  };
}

describe('POST /agents/self-register', () => {
  it('registers agent with valid signature (no API key)', async () => {
    const body = createSelfRegisterPayload();
    const res = await fetch(`${baseUrl}/agents/self-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data).toMatchObject({ agentId: 'my-agent', format: 'tpm' });
  });

  it('returns 401 for invalid signature', async () => {
    const body = createSelfRegisterPayload();
    body.signature = 'invalid';
    const res = await fetch(`${baseUrl}/agents/self-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 when agentId missing', async () => {
    const body = createSelfRegisterPayload();
    delete (body as Record<string, unknown>).agentId;
    const res = await fetch(`${baseUrl}/agents/self-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    expect(res.status).toBe(400);
  });

  it('returns 401 when token missing', async () => {
    const body = createSelfRegisterPayload();
    delete (body as Record<string, unknown>).token;
    const res = await fetch(`${baseUrl}/agents/self-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when token invalid', async () => {
    const body = createSelfRegisterPayload();
    (body as Record<string, unknown>).token = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${baseUrl}/agents/self-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 when token already used', async () => {
    const body = createSelfRegisterPayload();
    const res1 = await fetch(`${baseUrl}/agents/self-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    expect(res1.status).toBe(201);
    const body2 = createSelfRegisterPayload();
    (body2 as Record<string, unknown>).token = body.token;
    const res2 = await fetch(`${baseUrl}/agents/self-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body2)
    });
    expect(res2.status).toBe(401);
  });
});

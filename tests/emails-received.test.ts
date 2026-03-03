/**
 * Tests for GET /emails/received (Resend Inbound).
 * Agent routes require X-Attestation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSign, createPublicKey, generateKeyPairSync } from 'crypto';
import { computeBodyHash } from '../src/attestation/bodyHash.js';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Set AGENTS_PATH before app import so agentRegistry uses our temp path
const agentsDir = mkdtempSync(join(tmpdir(), 'ernest-received-'));
process.env.AGENTS_PATH = join(agentsDir, 'agents.json');
process.env.API_KEY = 'test-key';

import { app } from '../src/index.js';
import type { Server } from 'node:http';

vi.mock('../src/resendReceiving.js', () => ({
  listReceivedEmails: vi.fn().mockResolvedValue({
    ok: true,
    data: { object: 'list', has_more: false, data: [{ id: 'e1', from: 'a@b.com', to: ['c@d.com'], subject: 'Hi', created_at: '2025-01-01T00:00:00Z' }] }
  }),
  getReceivedEmail: vi.fn().mockResolvedValue({
    ok: true,
    data: { id: 'e1', from: 'a@b.com', to: ['c@d.com'], subject: 'Hi', text: 'Hello', html: null, created_at: '2025-01-01T00:00:00Z' }
  })
}));

let server: Server;
let baseUrl: string;
let keyPair: ReturnType<typeof generateKeyPairSync>;

function getPublicKeyBase64Url(pem: string): string {
  const pub = createPublicKey(pem);
  const der = pub.export({ type: 'spki', format: 'der' });
  return Buffer.from(der).toString('base64url');
}

function createGetAttestation(path: string, tenantId?: string): string {
  const payload = {
    timestamp: new Date().toISOString(),
    method: 'GET',
    path,
    bodyHash: computeBodyHash(undefined),
    ...(tenantId ? { tenantId } : {})
  };
  const payloadStr = JSON.stringify(payload, Object.keys(payload).sort());
  const sign = createSign('SHA256');
  sign.update(payloadStr, 'utf8');
  sign.end();
  const sig = sign.sign(keyPair.privateKey);
  const att = { format: 'tpm', signature: sig.toString('base64url'), publicKey: getPublicKeyBase64Url(keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' })), payload };
  return Buffer.from(JSON.stringify(att), 'utf8').toString('base64url');
}

beforeEach(async () => {
  process.env.API_KEY = 'test-key';
  keyPair = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const pubB64 = getPublicKeyBase64Url(keyPair.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string);

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  baseUrl = addr && typeof addr === 'object' ? `http://127.0.0.1:${addr.port}` : 'http://127.0.0.1:3100';

  const regRes = await fetch(`${baseUrl}/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'ApiKey test-key' },
    body: JSON.stringify({ agentId: 'test-agent', format: 'tpm', publicKey: pubB64 })
  });
  expect(regRes.status).toBe(201);
});

afterEach(() => {
  delete process.env.API_KEY;
  vi.clearAllMocks();
  return new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
});

describe('GET /emails/received', () => {
  it('returns 401 when X-Attestation header is missing', async () => {
    const res = await fetch(`${baseUrl}/emails/received`);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns list with valid attestation', async () => {
    const att = createGetAttestation('/emails/received');
    const res = await fetch(`${baseUrl}/emails/received`, {
      headers: { 'X-Attestation': att }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data[0]).toMatchObject({ id: 'e1', from: 'a@b.com', subject: 'Hi' });
  });

  it('passes limit query to listReceivedEmails', async () => {
    const { listReceivedEmails } = await import('../src/resendReceiving.js');
    const att = createGetAttestation('/emails/received');
    await fetch(`${baseUrl}/emails/received?limit=5`, {
      headers: { 'X-Attestation': att }
    });
    expect(listReceivedEmails).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
  });
});

describe('GET /emails/received/:id', () => {
  it('returns 401 when X-Attestation header is missing', async () => {
    const res = await fetch(`${baseUrl}/emails/received/e1`);
    expect(res.status).toBe(401);
  });

  it('returns email with valid attestation', async () => {
    const att = createGetAttestation('/emails/received/e1');
    const res = await fetch(`${baseUrl}/emails/received/e1`, {
      headers: { 'X-Attestation': att }
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('e1');
    expect(body.from).toBe('a@b.com');
    expect(body.text).toBe('Hello');
  });
});

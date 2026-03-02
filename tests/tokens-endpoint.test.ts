/**
 * Tests for POST /tokens (admin).
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
  process.env.REGISTRATION_TOKENS_PATH = join(
    mkdtempSync(join(tmpdir(), 'ernest-tokens-')),
    'tokens.json'
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
  delete process.env.REGISTRATION_TOKENS_PATH;
  return new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
});

describe('POST /tokens', () => {
  it('creates one token by default', async () => {
    const res = await fetch(`${baseUrl}/tokens`, {
      method: 'POST',
      headers: {
        Authorization: 'ApiKey test-key',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { tokens: string[] };
    expect(data.tokens).toHaveLength(1);
    expect(data.tokens[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('creates multiple tokens when count specified', async () => {
    const res = await fetch(`${baseUrl}/tokens`, {
      method: 'POST',
      headers: {
        Authorization: 'ApiKey test-key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ count: 5 }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { tokens: string[] };
    expect(data.tokens).toHaveLength(5);
    expect(new Set(data.tokens).size).toBe(5);
  });

  it('returns 401 without API key', async () => {
    const res = await fetch(`${baseUrl}/tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with invalid API key', async () => {
    const res = await fetch(`${baseUrl}/tokens`, {
      method: 'POST',
      headers: {
        Authorization: 'ApiKey wrong-key',
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(res.status).toBe(401);
  });
});

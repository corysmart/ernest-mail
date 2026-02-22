/**
 * E2E tests for ernest-mail HTTP server.
 * Setup file sets API_KEY and ACCOUNTS_PATH before app is imported.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { app } from '../../src/index.js';

let server: Server;
let baseUrl: string;

beforeAll(() => {
  return new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
      } else {
        baseUrl = 'http://127.0.0.1:3100';
      }
      resolve();
    });
  });
});

afterAll(() => {
  return new Promise<void>((resolve) => {
    server?.close(() => resolve());
  });
});

const authHeaders = {
  Authorization: 'ApiKey e2e-test-key',
  'Content-Type': 'application/json',
};

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });
});

describe('POST /accounts', () => {
  it('creates account and returns 201', async () => {
    const res = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        email: 'post-test@example.com',
        provider: 'resend',
      }),
    });
    expect(res.status).toBe(201);
    const account = await res.json();
    expect(account).toMatchObject({
      email: 'post-test@example.com',
      provider: 'resend',
      status: 'pending',
    });
    expect(account.id).toBeDefined();
    expect(account.createdAt).toBeDefined();
    expect(account.updatedAt).toBeDefined();
  });

  it('returns 400 when provider invalid', async () => {
    const res = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        email: 'bad@example.com',
        provider: 'invalid',
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('provider');
  });

  it('returns 400 when email invalid', async () => {
    const res = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        email: 'not-an-email',
        provider: 'resend',
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('email');
  });

  it('returns 409 when email already exists', async () => {
    const email = 'dup-e2e@example.com';
    await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ email, provider: 'resend' }),
    });
    const res = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ email, provider: 'smtp' }),
    });
    expect(res.status).toBe(409);
  });

  it('returns 401 without API key', async () => {
    const res = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'noauth@example.com',
        provider: 'resend',
      }),
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /accounts/:id', () => {
  it('returns account when found', async () => {
    const createRes = await fetch(`${baseUrl}/accounts`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        email: 'getbyid-e2e@example.com',
        provider: 'local-dev',
      }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/accounts/${created.id}`, {
      headers: authHeaders,
    });
    expect(res.status).toBe(200);
    const account = await res.json();
    expect(account).toEqual(created);
  });

  it('returns 404 when not found', async () => {
    const res = await fetch(
      `${baseUrl}/accounts/00000000-0000-0000-0000-000000000000`,
      { headers: authHeaders }
    );
    expect(res.status).toBe(404);
  });

  it('returns 401 without API key', async () => {
    const res = await fetch(
      `${baseUrl}/accounts/00000000-0000-0000-0000-000000000000`
    );
    expect(res.status).toBe(401);
  });
});

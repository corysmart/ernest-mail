/**
 * Unit tests for attestation auth middleware.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  createAuthMiddleware,
  createAdminAuthMiddleware,
  createAgentAuthMiddleware,
} from '../src/attestation/middleware.js';

function mockReq(options: {
  path?: string;
  headers?: Record<string, string>;
}): Request {
  return {
    path: options.path ?? '/',
    headers: options.headers ?? {},
  } as Request;
}

function mockRes(): Response & { statusCode?: number; body?: unknown } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(obj: unknown) {
      this.body = obj;
      return this;
    },
  } as Response & { statusCode?: number; body?: unknown };
  return res;
}

describe('createAuthMiddleware', () => {
  it('allows /health without auth', async () => {
    const middleware = createAuthMiddleware({ apiKey: 'secret' });
    const req = mockReq({ path: '/health' });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('allows request with valid API key', async () => {
    const middleware = createAuthMiddleware({ apiKey: 'secret' });
    const req = mockReq({
      path: '/accounts',
      headers: { authorization: 'ApiKey secret' },
    });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
  });

  it('allows Bearer token', async () => {
    const middleware = createAuthMiddleware({ apiKey: 'token123' });
    const req = mockReq({
      path: '/accounts',
      headers: { authorization: 'Bearer token123' },
    });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects request without auth when API_KEY is set', async () => {
    const middleware = createAuthMiddleware({ apiKey: 'secret' });
    const req = mockReq({ path: '/accounts' });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect((res as { body?: { error?: string } }).body).toMatchObject({
      error: 'Unauthorized',
    });
  });

  it('rejects invalid API key', async () => {
    const middleware = createAuthMiddleware({ apiKey: 'secret' });
    const req = mockReq({
      path: '/accounts',
      headers: { authorization: 'ApiKey wrong' },
    });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('allows any request when API_KEY is not set (dev mode)', async () => {
    const middleware = createAuthMiddleware({});
    const req = mockReq({ path: '/accounts' });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('createAdminAuthMiddleware', () => {
  it('allows request with valid API key', async () => {
    const middleware = createAdminAuthMiddleware({ apiKey: 'admin-secret' });
    const req = mockReq({ headers: { authorization: 'ApiKey admin-secret' } });
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('rejects request without API key', async () => {
    const middleware = createAdminAuthMiddleware({ apiKey: 'admin-secret' });
    const req = mockReq({});
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('returns 503 when API_KEY not configured', async () => {
    const middleware = createAdminAuthMiddleware({});
    const req = mockReq({ headers: { authorization: 'ApiKey whatever' } });
    const res = mockRes();
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });
});

describe('createAgentAuthMiddleware', () => {
  it('rejects API key — attestation only', async () => {
    const middleware = createAgentAuthMiddleware({
      getAgentRegistry: async () => new Map(),
    });
    const req = mockReq({
      headers: { authorization: 'ApiKey secret' },
    });
    const res = mockRes();
    const next = vi.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import {
  createRateLimiter,
  requestLogger,
  withRequestId,
  errorHandler,
  notFoundHandler,
} from '../src/middleware/observability.js';

function mockReq(init: Partial<Request> = {}): Request {
  return {
    method: 'GET',
    url: '/',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...init,
  } as Request;
}

function mockRes() {
  const res: Partial<Response & { body?: unknown }> = {
    statusCode: 200,
    locals: {},
    headers: {},
    setHeader(key: string, value: string) {
      this.headers![key.toLowerCase()] = value;
      return this as Response;
    },
    status(code: number) {
      this.statusCode = code;
      return this as Response;
    },
    json(body: unknown) {
      this.body = body;
      return this as Response;
    },
    on: vi.fn(),
  };
  return res as Response & { body?: unknown; headers: Record<string, string> };
}

describe('requestLogger', () => {
  it('assigns requestId and sets response header', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    requestLogger(req, res, next);

    expect(res.locals.requestId).toBeDefined();
    expect(res.headers['x-request-id']).toBeDefined();
    expect(next).toHaveBeenCalled();
  });
});

describe('createRateLimiter', () => {
  let limiter: ReturnType<typeof createRateLimiter>;
  beforeEach(() => {
    limiter = createRateLimiter({ windowMs: 50, max: 2 });
  });

  it('allows requests under the limit', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    limiter(req, res, next);
    limiter(req, res, next);

    expect(next).toHaveBeenCalledTimes(2);
  });

  it('blocks when exceeding limit', () => {
    const req = mockReq();
    const res = mockRes();
    const next = vi.fn();

    limiter(req, res, next);
    limiter(req, res, next);
    limiter(req, res, next);

    expect(res.statusCode).toBe(429);
    expect((res.body as { error?: string }).error).toContain('Too many requests');
  });
});

describe('withRequestId', () => {
  it('appends requestId to object bodies', () => {
    const res = mockRes();
    res.locals.requestId = 'req-123';
    const result = withRequestId(res, { ok: true });
    expect((result as { requestId?: string }).requestId).toBe('req-123');
  });
});

describe('error and not-found handlers', () => {
  it('returns structured 404', () => {
    const req = mockReq();
    const res = mockRes();
    notFoundHandler(req, res);
    expect(res.statusCode).toBe(404);
    expect((res.body as { error?: string }).error).toBe('Not found');
  });

  it('returns structured error', () => {
    const req = mockReq();
    const res = mockRes();
    res.locals.requestId = 'abc';
    const next = vi.fn();
    const err = Object.assign(new Error('boom'), { status: 400 });
    errorHandler(err, req, res, next);
    expect(res.statusCode).toBe(400);
    expect((res.body as { requestId?: string }).requestId).toBe('abc');
  });
});

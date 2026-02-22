import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RateLimiterOptions {
  /** Duration of the sliding window in milliseconds. */
  windowMs: number;
  /** Maximum number of requests allowed per key within the window. */
  max: number;
  /**
   * Optional custom key generator. Defaults to authorization header (if set)
   * or client IP as a fallback.
   */
  keyGenerator?: (req: Request) => string;
  /** Optional predicate to skip rate limiting for specific requests. */
  skip?: (req: Request) => boolean;
}

/** Attach a request ID and log the request lifecycle. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const headerId = req.headers['x-request-id'];
  const requestId =
    typeof headerId === 'string' && headerId.trim().length > 0
      ? headerId.trim()
      : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const durationMs = Number((process.hrtime.bigint() - startedAt) / BigInt(1_000_000));
    const client =
      (typeof req.headers['x-forwarded-for'] === 'string' &&
        req.headers['x-forwarded-for']) ||
      req.ip ||
      req.socket.remoteAddress;

    const logPayload: Record<string, unknown> = {
      level: 'info',
      msg: 'request',
      requestId,
      method: req.method,
      path: req.originalUrl ?? req.url,
      status: res.statusCode,
      durationMs,
    };
    if (client) logPayload.client = client;

    console.log(JSON.stringify(logPayload));
  });

  next();
}

/** Create an in-memory sliding-window rate limiter middleware. */
export function createRateLimiter(options: RateLimiterOptions) {
  const { windowMs, max, keyGenerator, skip } = options;
  const limitWindowMs = Number.isFinite(windowMs) && windowMs > 0 ? windowMs : 60_000;
  const limitMax = Number.isFinite(max) && max > 0 ? max : 60;
  const hits = new Map<string, { count: number; expiresAt: number }>();

  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    if (skip?.(req)) {
      next();
      return;
    }

    const key =
      keyGenerator?.(req) ??
      (typeof req.headers.authorization === 'string'
        ? `auth:${req.headers.authorization}`
        : `ip:${req.ip ?? req.socket.remoteAddress ?? 'unknown'}`);

    const now = Date.now();
    const existing = hits.get(key);

    if (!existing || existing.expiresAt <= now) {
      hits.set(key, { count: 1, expiresAt: now + limitWindowMs });
      next();
      return;
    }

    if (existing.count >= limitMax) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.expiresAt - now) / 1000));
      res.setHeader('Retry-After', retryAfterSeconds.toString());
      res
        .status(429)
        .json(withRequestId(res, { error: 'Too many requests', retryAfter: retryAfterSeconds }));
      return;
    }

    existing.count += 1;
    next();
  };
}

/** Attach requestId to JSON bodies when possible. */
export function withRequestId<T>(res: Response, body: T): T {
  if (body && typeof body === 'object') {
    return { ...(body as Record<string, unknown>), requestId: res.locals.requestId } as T;
  }
  return body;
}

/** 404 handler that returns a structured JSON response. */
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json(withRequestId(res, { error: 'Not found' }));
}

/** Central error handler that emits structured JSON responses. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express error handler signature requires all args
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const status =
    typeof err === 'object' && err !== null && 'status' in err &&
    typeof (err as { status?: unknown }).status === 'number'
      ? (err as { status: number }).status
      : 500;

  const message =
    status >= 500
      ? 'Internal server error'
      : err instanceof Error
        ? err.message
        : 'Request failed';

  const payload = withRequestId(res, { error: message });

  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'request_error',
      status,
      requestId: res.locals.requestId,
      error: err instanceof Error ? err.message : err,
      stack: err instanceof Error ? err.stack : undefined,
    }),
  );

  res.status(status).json(payload);
}

/**
 * Unit tests for attestation auth middleware.
 */
import { describe, it, expect, vi } from 'vitest';
import { createAuthMiddleware } from '../src/attestation/middleware.js';
function mockReq(options) {
    return {
        path: options.path ?? '/',
        headers: options.headers ?? {},
    };
}
function mockRes() {
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(obj) {
            this.body = obj;
            return this;
        },
    };
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
        expect(res.body).toMatchObject({
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

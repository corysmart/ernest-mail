/**
 * E2E tests for ernest-mail HTTP server.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../../src/index.js';
let server;
let baseUrl;
beforeAll(() => {
    server = app.listen(0, '127.0.0.1');
    const addr = server.address();
    if (addr && typeof addr === 'object') {
        baseUrl = `http://127.0.0.1:${addr.port}`;
    }
    else {
        baseUrl = 'http://127.0.0.1:3100';
    }
});
afterAll(() => {
    return new Promise((resolve) => {
        server?.close(() => resolve());
    });
});
describe('GET /health', () => {
    it('returns 200 with status ok', async () => {
        const res = await fetch(`${baseUrl}/health`);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ status: 'ok' });
    });
});

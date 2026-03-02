/**
 * Tests for FileTokenStore.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileTokenStore } from '../src/tokens/tokenStore.js';

describe('FileTokenStore', () => {
  let store: FileTokenStore;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ernest-token-'));
    store = new FileTokenStore(join(dir, 'tokens.json'));
  });

  it('creates a single token', async () => {
    const tokens = await store.createToken();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('creates multiple tokens', async () => {
    const tokens = await store.createToken(3);
    expect(tokens).toHaveLength(3);
    expect(new Set(tokens).size).toBe(3);
  });

  it('consumes a valid token', async () => {
    const [token] = await store.createToken();
    const ok = await store.consumeToken(token);
    expect(ok).toBe(true);
  });

  it('rejects already used token', async () => {
    const [token] = await store.createToken();
    await store.consumeToken(token);
    const ok = await store.consumeToken(token);
    expect(ok).toBe(false);
  });

  it('rejects invalid token', async () => {
    const ok = await store.consumeToken('invalid-uuid');
    expect(ok).toBe(false);
  });

  it('rejects empty token', async () => {
    expect(await store.consumeToken('')).toBe(false);
    expect(await store.consumeToken('   ')).toBe(false);
  });

  it('rejects count out of range', async () => {
    await expect(store.createToken(0)).rejects.toThrow();
    await expect(store.createToken(-1)).rejects.toThrow();
    await expect(store.createToken(101)).rejects.toThrow();
  });
});

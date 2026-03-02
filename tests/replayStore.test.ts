/**
 * Unit tests for replay store (single-use attestation tracking).
 */

import { describe, it, expect } from 'vitest';
import {
  InMemoryReplayStore,
  attestationTokenId,
} from '../src/attestation/replayStore.js';

describe('attestationTokenId', () => {
  it('returns deterministic hash for same input', () => {
    const raw = 'eyJmb3JtYXQiOiJ0cG0ifQ';
    expect(attestationTokenId(raw)).toBe(attestationTokenId(raw));
  });

  it('returns different hash for different input', () => {
    const a = attestationTokenId('abc');
    const b = attestationTokenId('xyz');
    expect(a).not.toBe(b);
  });
});

describe('InMemoryReplayStore', () => {
  it('returns false for token not yet used', () => {
    const store = new InMemoryReplayStore();
    expect(store.isUsed('token-1')).toBe(false);
  });

  it('returns true after markUsed', () => {
    const store = new InMemoryReplayStore();
    store.markUsed('token-1');
    expect(store.isUsed('token-1')).toBe(true);
  });

  it('returns false for different token', () => {
    const store = new InMemoryReplayStore();
    store.markUsed('token-1');
    expect(store.isUsed('token-2')).toBe(false);
  });
});

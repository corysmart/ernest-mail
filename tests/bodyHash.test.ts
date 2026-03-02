/**
 * Unit tests for body hash computation.
 */

import { describe, it, expect } from 'vitest';
import { computeBodyHash } from '../src/attestation/bodyHash.js';

describe('computeBodyHash', () => {
  it('returns empty string for undefined', () => {
    expect(computeBodyHash(undefined)).toBe('');
  });

  it('returns empty string for null', () => {
    expect(computeBodyHash(null)).toBe('');
  });

  it('returns deterministic hash for same object', () => {
    const obj = { a: 1, b: 2 };
    expect(computeBodyHash(obj)).toBe(computeBodyHash(obj));
  });

  it('returns same hash regardless of key order', () => {
    expect(computeBodyHash({ b: 2, a: 1 })).toBe(computeBodyHash({ a: 1, b: 2 }));
  });

  it('returns different hash for different content', () => {
    expect(computeBodyHash({ a: 1 })).not.toBe(computeBodyHash({ a: 2 }));
  });
});

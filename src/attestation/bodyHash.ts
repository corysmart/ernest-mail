/**
 * Compute SHA-256 body hash for attestation binding.
 * Uses canonical JSON (sorted keys, no whitespace) so client and server match.
 */

import { createHash } from 'node:crypto';

/** Canonical JSON stringify for deterministic hashing. */
function canonicalJson(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return '';
  }
  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (k) => JSON.stringify(k) + ':' + canonicalJson((obj as Record<string, unknown>)[k])
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Compute body hash for attestation payload.
 * Empty string when no body (GET or empty).
 */
export function computeBodyHash(body: unknown): string {
  if (body === undefined || body === null) {
    return '';
  }
  const str = canonicalJson(body);
  if (!str || str === '{}' || str === '[]') {
    return '';
  }
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

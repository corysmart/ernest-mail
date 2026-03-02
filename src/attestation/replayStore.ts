/**
 * Single-use attestation tracking for replay protection.
 * Tracks used attestation tokens with TTL; rejects repeated use.
 */

import { createHash } from 'node:crypto';

export interface ReplayStore {
  /** Return true if token was already used. */
  isUsed(tokenId: string): boolean;
  /** Mark token as used. Expires after ttlMs. */
  markUsed(tokenId: string, ttlMs: number): void;
}

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes, matches verifier replay window

/** In-memory replay store. Evicts expired entries on access. */
export class InMemoryReplayStore implements ReplayStore {
  private readonly entries = new Map<string, number>();

  isUsed(tokenId: string): boolean {
    this.evictExpired();
    return this.entries.has(tokenId);
  }

  markUsed(tokenId: string, ttlMs: number = DEFAULT_TTL_MS): void {
    this.entries.set(tokenId, Date.now() + ttlMs);
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, expiresAt] of this.entries.entries()) {
      if (expiresAt <= now) {
        this.entries.delete(id);
      }
    }
  }
}

/**
 * Compute a unique token ID from raw attestation header value.
 * Same attestation (replay) produces same ID.
 */
export function attestationTokenId(rawBase64Url: string): string {
  return createHash('sha256').update(rawBase64Url, 'utf8').digest('base64url');
}

/**
 * Unit tests for attestation module.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Attestation, TpmAttestation } from '../src/attestation/types.js';
import {
  verifyAttestation,
  type TpmRegisteredAgent,
} from '../src/attestation/verifier.js';
import type { AgentRegistry } from '../src/attestation/verifier.js';

describe('attestation types', () => {
  it('TpmAttestation has required fields', () => {
    const att: TpmAttestation = {
      format: 'tpm',
      signature: 'sig',
      publicKey: 'pubkey',
      payload: {
        timestamp: new Date().toISOString(),
        method: 'POST',
        path: '/accounts',
        bodyHash: 'abc123',
      },
    };
    expect(att.format).toBe('tpm');
    expect(att.signature).toBeDefined();
    expect(att.publicKey).toBeDefined();
    expect(att.payload.method).toBe('POST');
  });
});

describe('verifyAttestation', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new Map();
  });

  it('returns null for unknown format', async () => {
    const att = { format: 'unknown' } as unknown as Attestation;
    const result = await verifyAttestation(att, registry);
    expect(result).toBeNull();
  });

  it('returns null for TPM attestation when agent not in registry', async () => {
    const att: TpmAttestation = {
      format: 'tpm',
      signature: 'sig',
      publicKey: 'unknown-pubkey',
      payload: {
        timestamp: new Date().toISOString(),
        method: 'GET',
        path: '/health',
        bodyHash: '',
      },
    };
    const result = await verifyAttestation(att, registry);
    expect(result).toBeNull();
  });

  it('returns null for TPM attestation when timestamp is stale', async () => {
    const agent: TpmRegisteredAgent = {
      agentId: 'agent-1',
      format: 'tpm',
      publicKey: 'pubkey-1',
      createdAt: new Date().toISOString(),
    };
    registry.set('agent-1', agent);
    const att: TpmAttestation = {
      format: 'tpm',
      signature: 'sig',
      publicKey: 'pubkey-1',
      payload: {
        timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        method: 'GET',
        path: '/accounts',
        bodyHash: '',
      },
    };
    const result = await verifyAttestation(att, registry);
    expect(result).toBeNull();
  });
});

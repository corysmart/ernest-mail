/**
 * Unit tests for attestation module.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { verifyAttestation } from '../src/attestation/verifier.js';
describe('attestation types', () => {
    it('TpmAttestation has required fields', () => {
        const att = {
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
    let registry;
    beforeEach(() => {
        registry = new Map();
    });
    it('returns null for unknown format', async () => {
        const att = { format: 'unknown' };
        const result = await verifyAttestation(att, registry);
        expect(result).toBeNull();
    });
    it('returns null for TPM attestation when agent not in registry', async () => {
        const att = {
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
        registry.set('agent-1', {
            agentId: 'agent-1',
            format: 'tpm',
            publicKey: 'pubkey-1',
            createdAt: new Date().toISOString(),
        });
        const att = {
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

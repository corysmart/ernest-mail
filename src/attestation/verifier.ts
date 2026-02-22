/**
 * Attestation verifier for ernest-mail.
 * Verifies requests signed by TPM or FIDO2 hardware keys.
 */

import { createPublicKey, verify } from 'node:crypto';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { Attestation, TpmAttestation, Fido2Attestation } from './types.js';

/** TPM-registered agent. */
export interface TpmRegisteredAgent {
  agentId: string;
  format: 'tpm';
  publicKey: string;
  createdAt: string;
}

/** FIDO2-registered agent credential. */
export interface Fido2RegisteredAgent {
  agentId: string;
  format: 'fido2';
  credentialId: string;
  publicKey: Uint8Array;
  counter: number;
  transports?: Array<'ble' | 'cable' | 'hybrid' | 'internal' | 'nfc' | 'smart-card' | 'usb'>;
  createdAt: string;
}

export type RegisteredAgent = TpmRegisteredAgent | Fido2RegisteredAgent;

/** Agent registry. Use AgentRegistryService for persistent storage. */
export type AgentRegistry = Map<string, RegisteredAgent>;

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

/** Canonical serialization of payload for signing (sorted keys, no whitespace). */
function payloadToSignString(payload: {
  timestamp: string;
  method: string;
  path: string;
  bodyHash: string;
  nonce?: string;
}): string {
  const obj: Record<string, string> = {
    bodyHash: payload.bodyHash,
    method: payload.method,
    path: payload.path,
    timestamp: payload.timestamp,
  };
  if (payload.nonce) obj.nonce = payload.nonce;
  return JSON.stringify(obj, Object.keys(obj).sort());
}

/**
 * Verify an attestation. Returns agent ID if valid, null otherwise.
 */
export async function verifyAttestation(
  attestation: Attestation,
  registry: AgentRegistry
): Promise<string | null> {
  if (attestation.format === 'tpm') {
    return verifyTpmAttestation(attestation as TpmAttestation, registry);
  }
  if (attestation.format === 'fido2') {
    return verifyFido2Attestation(attestation as Fido2Attestation, registry);
  }
  return null;
}

async function verifyTpmAttestation(
  att: TpmAttestation,
  registry: AgentRegistry
): Promise<string | null> {
  const ts = new Date(att.payload.timestamp).getTime();
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    return null;
  }

  const payloadStr = payloadToSignString(att.payload);
  const signatureBuf = Buffer.from(att.signature, 'base64url');

  for (const agent of registry.values()) {
    if (agent.format !== 'tpm') continue;
    if (agent.publicKey !== att.publicKey) continue;

    try {
      const key = att.publicKey.startsWith('-----BEGIN')
        ? createPublicKey(att.publicKey)
        : createPublicKey({
            key: Buffer.from(att.publicKey, 'base64url'),
            format: 'der',
            type: 'spki',
          });
      const data = Buffer.from(payloadStr, 'utf8');
      const valid =
        verify('sha256', data, key, signatureBuf) ||
        verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, signatureBuf);
      if (valid) return agent.agentId;
    } catch {
      // Verification failed or invalid key
    }
  }
  return null;
}

async function verifyFido2Attestation(
  att: Fido2Attestation,
  registry: AgentRegistry
): Promise<string | null> {
  const rpID = process.env.RP_ID ?? 'localhost';
  const origin =
    process.env.RP_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? 3100}`;

  const credential = findFido2Credential(att.response.id, registry);
  if (!credential) return null;

  try {
    const result = await verifyAuthenticationResponse({
      response: att.response,
      expectedChallenge: att.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports,
      },
      requireUserVerification: false,
    });
    if (result.verified && result.authenticationInfo) {
      // TODO: Persist new counter: credential.counter = result.authenticationInfo.newCounter
      return credential.agentId;
    }
  } catch {
    // Verification failed
  }
  return null;
}

function findFido2Credential(
  credentialId: string,
  registry: AgentRegistry
): Fido2RegisteredAgent | null {
  for (const agent of registry.values()) {
    if (agent.format === 'fido2' && agent.credentialId === credentialId) {
      return agent;
    }
  }
  return null;
}

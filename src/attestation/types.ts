/**
 * Attestation types for agent-only request verification.
 * Supports TPM and FIDO2 hardware-backed attestation.
 */

import type { AuthenticationResponseJSON } from '@simplewebauthn/server';

export type AttestationFormat = 'tpm' | 'fido2';

/** Payload signed by the agent's hardware key (TPM or FIDO2). */
export interface SignedPayload {
  /** Request timestamp (ISO 8601) for replay protection. */
  timestamp: string;
  /** HTTP method. */
  method: string;
  /** Request path. */
  path: string;
  /** SHA-256 hash of request body (empty string for no body). */
  bodyHash: string;
  /** Nonce from server challenge (if used). */
  nonce?: string;
}

/** TPM attestation: signature over SignedPayload. */
export interface TpmAttestation {
  format: 'tpm';
  /** Base64url-encoded ECDSA signature (DER or raw R|S). */
  signature: string;
  /** Base64url-encoded public key (SPKI format) or PEM string. */
  publicKey: string;
  /** The payload that was signed (for verification). */
  payload: SignedPayload;
}

/** FIDO2 attestation: full WebAuthn authentication response. */
export interface Fido2Attestation {
  format: 'fido2';
  /** Full WebAuthn authentication response from the authenticator. */
  response: AuthenticationResponseJSON;
  /** The challenge that was signed (must match response). */
  challenge: string;
}

export type Attestation = TpmAttestation | Fido2Attestation;

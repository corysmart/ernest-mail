/**
 * Self-registration: agent proves key possession to register without admin.
 */

import { createPublicKey, verify } from 'node:crypto';

const REGISTER_ACTION = 'register';
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

function registrationPayloadToSign(payload: {
  action: string;
  agentId: string;
  timestamp: string;
}): string {
  return JSON.stringify(
    { action: payload.action, agentId: payload.agentId, timestamp: payload.timestamp },
    ['action', 'agentId', 'timestamp']
  );
}

/** Verify self-registration attestation. Returns true if signature is valid. */
export function verifySelfRegistration(input: {
  agentId: string;
  publicKey: string;
  signature: string;
  payload: { action: string; agentId: string; timestamp: string };
}): boolean {
  const { agentId, publicKey, signature, payload } = input;
  if (payload.action !== REGISTER_ACTION || payload.agentId !== agentId) {
    return false;
  }
  const ts = new Date(payload.timestamp).getTime();
  if (Number.isNaN(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    return false;
  }
  const payloadStr = registrationPayloadToSign(payload);
  const signatureBuf = Buffer.from(signature, 'base64url');
  try {
    const key = publicKey.startsWith('-----BEGIN')
      ? createPublicKey(publicKey)
      : createPublicKey({
          key: Buffer.from(publicKey, 'base64url'),
          format: 'der',
          type: 'spki',
        });
    const data = Buffer.from(payloadStr, 'utf8');
    return (
      verify('sha256', data, key, signatureBuf) ||
      verify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, signatureBuf)
    );
  } catch {
    return false;
  }
}

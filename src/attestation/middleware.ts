/**
 * Express middleware for attestation verification.
 * Admin routes: API key only. Agent routes: attestation (TPM/FIDO2) only.
 */

import type { Request, Response, NextFunction } from 'express';
import { verifyAttestation, type AgentRegistry } from './verifier.js';
import type { Attestation } from './types.js';

const API_KEY_HEADER = 'authorization';
const ATTESTATION_HEADER = 'x-attestation';

function parseApiKey(authHeader: unknown): string | null {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const [scheme, token] = authHeader.split(' ');
  if ((scheme === 'ApiKey' || scheme === 'Bearer') && token) return token;
  return null;
}

/**
 * Admin auth: API key only. Use for registration, account provisioning, etc.
 * Rejects attestation; admin flows must use API key.
 */
export function createAdminAuthMiddleware(options: {
  apiKey?: string;
  getApiKey?: () => string | undefined;
}) {
  const { apiKey, getApiKey } = options;
  return (req: Request, res: Response, next: NextFunction) => {
    const effectiveApiKey = getApiKey?.() ?? apiKey;
    if (!effectiveApiKey) {
      res.status(503).json({
        error: 'Admin auth not configured',
        hint: 'Set API_KEY for admin routes.',
      });
      return;
    }
    const token = parseApiKey(req.headers[API_KEY_HEADER]);
    if (token === effectiveApiKey) {
      return next();
    }
    res.status(401).json({
      error: 'Unauthorized',
      hint: 'Admin routes require Authorization: ApiKey <key>.',
    });
  };
}

/**
 * Agent auth: attestation (TPM/FIDO2) only. Use for sends, credits, etc.
 * Rejects API key; agent flows must use hardware attestation.
 */
export function createAgentAuthMiddleware(options: {
  agentRegistry?: AgentRegistry;
  getAgentRegistry?: () => Promise<AgentRegistry>;
}) {
  const { agentRegistry, getAgentRegistry } = options;
  return async (req: Request, res: Response, next: NextFunction) => {
    const attestationRaw = req.headers[ATTESTATION_HEADER];
    if (!attestationRaw || typeof attestationRaw !== 'string') {
      res.status(401).json({
        error: 'Unauthorized',
        hint: 'Agent routes require X-Attestation header with valid TPM or FIDO2 attestation.',
      });
      return;
    }
    try {
      const attestation = JSON.parse(
        Buffer.from(attestationRaw, 'base64url').toString('utf8')
      ) as Attestation;
      const registry =
        agentRegistry ?? (getAgentRegistry ? await getAgentRegistry() : new Map());
      const agentId = await verifyAttestation(attestation, registry);
      if (agentId) {
        (req as Request & { agentId?: string }).agentId = agentId;
        return next();
      }
    } catch {
      // Invalid attestation
    }
    res.status(401).json({
      error: 'Unauthorized',
      hint: 'Agent routes require X-Attestation header with valid TPM or FIDO2 attestation.',
    });
  };
}

/**
 * @deprecated Use createAdminAuthMiddleware or createAgentAuthMiddleware.
 * Legacy: allowed either API key or attestation. Kept for tests that expect unified auth.
 */
export function createAuthMiddleware(options: {
  apiKey?: string;
  getApiKey?: () => string | undefined;
  agentRegistry?: AgentRegistry;
  getAgentRegistry?: () => Promise<AgentRegistry>;
}) {
  const {
    apiKey,
    getApiKey,
    agentRegistry,
    getAgentRegistry,
  } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/health') {
      return next();
    }

    const attestationRaw = req.headers[ATTESTATION_HEADER];
    if (attestationRaw && typeof attestationRaw === 'string') {
      try {
        const attestation = JSON.parse(
          Buffer.from(attestationRaw, 'base64url').toString('utf8')
        ) as Attestation;
        const registry =
          agentRegistry ?? (getAgentRegistry ? await getAgentRegistry() : new Map());
        const agentId = await verifyAttestation(attestation, registry);
        if (agentId) {
          (req as Request & { agentId?: string }).agentId = agentId;
          return next();
        }
      } catch {
        // Invalid attestation
      }
    }

    const effectiveApiKey = getApiKey?.() ?? apiKey;
    if (effectiveApiKey) {
      const token = parseApiKey(req.headers[API_KEY_HEADER]);
      if (token === effectiveApiKey) {
        return next();
      }
    } else {
      return next();
    }

    res.status(401).json({
      error: 'Unauthorized',
      hint:
        'Provide Authorization: ApiKey <key> or X-Attestation header with valid attestation.',
    });
  };
}

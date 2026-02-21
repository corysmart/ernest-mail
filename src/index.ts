/**
 * ernest-mail HTTP server.
 * Agent-only API for email account creation and sending.
 */

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import express from 'express';
import { createAdminAuthMiddleware } from './attestation/middleware.js';
import { FileAgentRegistry } from './attestation/agentRegistry.js';

const app = express();
app.use(express.json());

const agentsPath =
  process.env.AGENTS_PATH ?? join(process.cwd(), 'data', 'agents.json');
const agentRegistry = new FileAgentRegistry(agentsPath);

const adminAuth = createAdminAuthMiddleware({
  getApiKey: () => process.env.API_KEY,
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

/** Get FIDO2 registration options for agent. Admin only (API key). */
app.get('/agents/register/options', adminAuth, async (req, res) => {
  const agentId = req.query.agentId ?? req.query.agent_id;
  if (typeof agentId !== 'string' || !agentId.trim()) {
    res.status(400).json({ error: 'agentId query parameter required' });
    return;
  }
  try {
    const options = await agentRegistry.getRegistrationOptions(agentId.trim());
    res.json(options);
  } catch (err) {
    res
      .status(500)
      .json({ error: err instanceof Error ? err.message : 'Registration failed' });
  }
});

/** Register agent (TPM or FIDO2). Admin only (API key). */
app.post('/agents/register', adminAuth, async (req, res) => {
  const body = req.body as {
    agentId?: string;
    agent_id?: string;
    format?: 'tpm' | 'fido2';
    publicKey?: string;
    public_key?: string;
    response?: unknown;
    expectedChallenge?: string;
    expected_challenge?: string;
  };

  const agentId = body.agentId ?? body.agent_id;
  if (typeof agentId !== 'string' || !agentId.trim()) {
    res.status(400).json({ error: 'agentId required' });
    return;
  }

  const format = body.format ?? 'tpm';
  if (format !== 'tpm' && format !== 'fido2') {
    res.status(400).json({ error: 'format must be tpm or fido2' });
    return;
  }

  try {
    await agentRegistry.load();

    if (format === 'tpm') {
      const publicKey = body.publicKey ?? body.public_key;
      if (typeof publicKey !== 'string' || !publicKey.trim()) {
        res.status(400).json({ error: 'publicKey required for TPM registration' });
        return;
      }
      const agent = await agentRegistry.registerTpm(agentId.trim(), publicKey.trim());
      res.status(201).json({ agentId: agent.agentId, format: 'tpm' });
      return;
    }

    const response = body.response;
    if (!response || typeof response !== 'object') {
      res.status(400).json({ error: 'response required for FIDO2 registration' });
      return;
    }
    const expectedChallenge = body.expectedChallenge ?? body.expected_challenge;
    const agent = await agentRegistry.registerFido2(
      agentId.trim(),
      response as Parameters<typeof agentRegistry.registerFido2>[1],
      typeof expectedChallenge === 'string' ? expectedChallenge : undefined
    );
    res.status(201).json({
      agentId: agent.agentId,
      format: 'fido2',
      credentialId: agent.credentialId,
    });
  } catch (err) {
    res
      .status(400)
      .json({ error: err instanceof Error ? err.message : 'Registration failed' });
  }
});

const port = Number(process.env.PORT ?? 3100);
const host = process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1';

/** Start server. Call from CLI or tests. */
export function startServer(): ReturnType<express.Express['listen']> {
  return app.listen(port, host, () => {
    console.log(`ernest-mail listening on ${host}:${port}`);
  });
}

const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] === __filename;
if (isMain) {
  startServer();
}

export { app };

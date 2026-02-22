/**
 * ernest-mail HTTP server.
 * Agent-only API for email account creation and sending.
 */

import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import express from 'express';
import { createAdminAuthMiddleware } from './attestation/middleware.js';
import { FileAgentRegistry } from './attestation/agentRegistry.js';
import { FileAccountRepository } from './fileAccountRepository.js';
import type { AccountProvider, CreateAccountInput } from './accounts.js';
import { getProviderAdapter } from './providers.js';
import { processSendEmail } from './handlers/sendEmail.js';
import {
  createRateLimiter,
  errorHandler,
  notFoundHandler,
  requestLogger,
  withRequestId,
} from './middleware/observability.js';

const app = express();
app.use(requestLogger);
app.use(express.json());

const rateLimiter = createRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
  max: Number(process.env.RATE_LIMIT_MAX ?? 100),
  skip: (req) => req.path === '/health',
});
app.use(rateLimiter);

const agentsPath =
  process.env.AGENTS_PATH ?? join(process.cwd(), 'data', 'agents.json');
const agentRegistry = new FileAgentRegistry(agentsPath);

const accountsPath =
  process.env.ACCOUNTS_PATH ?? join(process.cwd(), 'data', 'accounts.json');
const accountRepository = new FileAccountRepository(accountsPath);

const adminAuth = createAdminAuthMiddleware({
  getApiKey: () => process.env.API_KEY,
});

app.get('/health', (_req, res) => {
  res.json(withRequestId(res, { status: 'ok' }));
});

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

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
      .json(withRequestId(res, {
        error: err instanceof Error ? err.message : 'Registration failed',
      }));
  }
});

/** Create managed email account. API key required. */
app.post('/accounts', adminAuth, async (req, res) => {
  const body = req.body as Partial<CreateAccountInput>;
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const provider = body?.provider;

  const validProviders = ['local-dev', 'resend', 'smtp', 'ses', 'sendgrid'];
  if (
    typeof provider !== 'string' ||
    !validProviders.includes(provider)
  ) {
    res
      .status(400)
      .json({
        error: `provider required; must be one of: ${validProviders.join(', ')}`,
      });
    return;
  }

  if (!email || !isValidEmail(email)) {
    res.status(400).json(withRequestId(res, { error: 'valid email required' }));
    return;
  }

  try {
    const account = await accountRepository.create({
      email: email.toLowerCase(),
      provider: provider as AccountProvider,
      status: body.status,
    });
    res.status(201).json(withRequestId(res, account));
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) {
      res.status(409).json(withRequestId(res, { error: err.message }));
      return;
    }
    res
      .status(500)
      .json(withRequestId(res, {
        error: err instanceof Error ? err.message : 'Account creation failed',
      }));
  }
});

/** Get account by ID. API key required. */
app.get('/accounts/:id', adminAuth, async (req, res) => {
  const id = req.params.id;
  if (typeof id !== 'string') {
    res.status(400).json({ error: 'Invalid account ID' });
    return;
  }
  const account = await accountRepository.getById(id);
  if (!account) {
    res.status(404).json(withRequestId(res, { error: 'Account not found' }));
    return;
  }
  res.json(withRequestId(res, account));
});

/** Send an email using a managed account. API key required. */
app.post('/emails/send', adminAuth, async (req, res) => {
  const result = await processSendEmail(req.body, {
    accountRepository,
    getProviderAdapter,
  });
  res.status(result.status).json(withRequestId(res, result.body));
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
    res.status(400).json(withRequestId(res, { error: 'agentId required' }));
    return;
  }

  const format = body.format ?? 'tpm';
  if (format !== 'tpm' && format !== 'fido2') {
    res.status(400).json(withRequestId(res, { error: 'format must be tpm or fido2' }));
    return;
  }

  try {
    await agentRegistry.load();

    if (format === 'tpm') {
      const publicKey = body.publicKey ?? body.public_key;
      if (typeof publicKey !== 'string' || !publicKey.trim()) {
      res
        .status(400)
        .json(withRequestId(res, { error: 'publicKey required for TPM registration' }));
      return;
    }
      const agent = await agentRegistry.registerTpm(agentId.trim(), publicKey.trim());
    res.status(201).json(withRequestId(res, { agentId: agent.agentId, format: 'tpm' }));
      return;
    }

    const response = body.response;
    if (!response || typeof response !== 'object') {
      res
        .status(400)
        .json(withRequestId(res, { error: 'response required for FIDO2 registration' }));
      return;
    }
    const expectedChallenge = body.expectedChallenge ?? body.expected_challenge;
    const agent = await agentRegistry.registerFido2(
      agentId.trim(),
      response as Parameters<typeof agentRegistry.registerFido2>[1],
      typeof expectedChallenge === 'string' ? expectedChallenge : undefined
    );
    res.status(201).json(withRequestId(res, {
      agentId: agent.agentId,
      format: 'fido2',
      credentialId: agent.credentialId,
    }));
  } catch (err) {
    res
      .status(400)
      .json(
        withRequestId(res, {
          error: err instanceof Error ? err.message : 'Registration failed',
        })
      );
  }
});

app.use(notFoundHandler);
app.use(errorHandler);

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

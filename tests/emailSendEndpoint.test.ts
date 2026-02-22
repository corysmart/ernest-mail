/**
 * Tests for send-email flow without opening network sockets (sandbox blocks listen()).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FileAccountRepository } from '../src/fileAccountRepository.js';
import { processSendEmail } from '../src/handlers/sendEmail.js';
import {
  LocalDevProviderAdapter,
  getProviderAdapter,
} from '../src/providers.js';
import * as providerModule from '../src/providers.js';

let repo: FileAccountRepository;

beforeEach(() => {
  const storePath = join(mkdtempSync(join(tmpdir(), 'ernest-send-')), 'accounts.json');
  repo = new FileAccountRepository(storePath);
  vi.restoreAllMocks();
});

async function createAccount(email: string) {
  return repo.create({ email, provider: 'local-dev' });
}

describe('processSendEmail', () => {
  it('returns 404 when account does not exist', async () => {
    const result = await processSendEmail(
      {
        accountId: '00000000-0000-0000-0000-000000000000',
        to: 'to@example.com',
        subject: 'Hello',
        text: 'Hi',
      },
      { accountRepository: repo, getProviderAdapter },
    );

    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ error: 'Account not found' });
  });

  it('returns 400 when payload is invalid', async () => {
    const account = await createAccount(`invalid-${Date.now()}@example.com`);

    const result = await processSendEmail(
      {
        accountId: account.id,
        to: 'receiver@example.com',
        text: 'Missing subject',
      },
      { accountRepository: repo, getProviderAdapter },
    );

    expect(result.status).toBe(400);
    expect((result.body as { error: string }).error).toContain('subject');
  });

  it('returns 502 when provider adapter fails', async () => {
    const account = await createAccount(`fail-${Date.now()}@example.com`);

    vi.spyOn(providerModule, 'getProviderAdapter').mockReturnValue({
      provider: 'local-dev',
      provisionAccount: vi.fn(),
      sendEmail: vi.fn().mockRejectedValue(new Error('boom')),
    } as unknown as ReturnType<typeof getProviderAdapter>);

    const result = await processSendEmail(
      {
        accountId: account.id,
        to: 'receiver@example.com',
        subject: 'Hello',
        text: 'Hi',
      },
      {
        accountRepository: repo,
        getProviderAdapter: providerModule.getProviderAdapter,
      },
    );

    expect(result.status).toBe(502);
    expect((result.body as { error: string }).error).toContain('boom');
  });

  it('succeeds and returns 202 when payload is valid', async () => {
    const account = await createAccount(`success-${Date.now()}@example.com`);
    const adapter = new LocalDevProviderAdapter();

    const result = await processSendEmail(
      {
        accountId: account.id,
        to: 'receiver@example.com',
        subject: 'Hello',
        text: 'Hi there',
      },
      {
        accountRepository: repo,
        getProviderAdapter: () => adapter,
      },
    );

    expect(result.status).toBe(202);
    expect(result.body).toMatchObject({
      status: 'sent',
      provider: 'local-dev',
      to: 'receiver@example.com',
    });
    expect((result.body as { id?: string }).id).toBeDefined();
  });
});

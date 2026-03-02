/**
 * Tests for send-email flow without opening network sockets (sandbox blocks listen()).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FileAccountRepository } from '../src/fileAccountRepository.js';
import { FileWalletStore } from '../src/fileWalletStore.js';
import { processSendEmail } from '../src/handlers/sendEmail.js';
import {
  LocalDevProviderAdapter,
  getProviderAdapter,
} from '../src/providers.js';
import * as providerModule from '../src/providers.js';

let repo: FileAccountRepository;
let walletStore: FileWalletStore;
let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ernest-send-'));
  repo = new FileAccountRepository(join(tmpDir, 'accounts.json'));
  walletStore = new FileWalletStore(join(tmpDir, 'wallets.json'), {
    defaultInitialCredits: 0
  });
  vi.restoreAllMocks();
  vi.stubEnv('ADMIN_TENANT_IDS', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(tmpDir, { recursive: true, force: true });
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

  it('returns 402 when tenant has insufficient credits', async () => {
    const account = await createAccount(`credits-${Date.now()}@example.com`);
    await walletStore.add('tenant-low', 0);

    const result = await processSendEmail(
      {
        accountId: account.id,
        to: 'receiver@example.com',
        subject: 'Hello',
        text: 'Hi',
        tenantId: 'tenant-low'
      },
      {
        accountRepository: repo,
        getProviderAdapter,
        walletStore,
        creditsPerEmail: 1
      }
    );

    expect(result.status).toBe(402);
    expect(result.body).toMatchObject({
      error: 'Insufficient credits',
      balance: 0,
      required: 1
    });
  });

  it('deducts credits and succeeds when tenant has sufficient balance', async () => {
    const account = await createAccount(`deduct-${Date.now()}@example.com`);
    await walletStore.add('tenant-ok', 10);
    const adapter = new LocalDevProviderAdapter();

    const result = await processSendEmail(
      {
        accountId: account.id,
        to: 'receiver@example.com',
        subject: 'Hello',
        text: 'Hi',
        tenantId: 'tenant-ok'
      },
      {
        accountRepository: repo,
        getProviderAdapter: () => adapter,
        walletStore,
        creditsPerEmail: 1
      }
    );

    expect(result.status).toBe(202);
    expect(await walletStore.getBalance('tenant-ok')).toBe(9);
  });

  it('skips credit check for admin tenant (ADMIN_TENANT_IDS)', async () => {
    vi.stubEnv('ADMIN_TENANT_IDS', 'admin-tenant');
    const account = await createAccount(`admin-${Date.now()}@example.com`);
    const adapter = new LocalDevProviderAdapter();

    const result = await processSendEmail(
      {
        accountId: account.id,
        to: 'receiver@example.com',
        subject: 'Hello',
        text: 'Hi',
        tenantId: 'admin-tenant'
      },
      {
        accountRepository: repo,
        getProviderAdapter: () => adapter,
        walletStore,
        creditsPerEmail: 1
      }
    );

    expect(result.status).toBe(202);
    expect(await walletStore.getBalance('admin-tenant')).toBe(0);
  });

  it('allows send without tenantId when no wallet (backward compat)', async () => {
    const account = await createAccount(`no-tenant-${Date.now()}@example.com`);
    const adapter = new LocalDevProviderAdapter();

    const result = await processSendEmail(
      {
        accountId: account.id,
        to: 'receiver@example.com',
        subject: 'Hello',
        text: 'Hi'
      },
      {
        accountRepository: repo,
        getProviderAdapter: () => adapter
      }
    );

    expect(result.status).toBe(202);
  });
});

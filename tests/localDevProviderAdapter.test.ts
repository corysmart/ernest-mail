import { describe, it, expect } from 'vitest';
import { LocalDevProviderAdapter, getProviderAdapter } from '../src/providers.js';
import type { Account } from '../src/accounts.js';

const baseAccount: Account = {
  id: 'acct-1',
  email: 'user@example.com',
  provider: 'local-dev',
  status: 'pending',
  createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
  updatedAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
};

describe('LocalDevProviderAdapter', () => {
  it('activates non-disabled accounts on provision', async () => {
    const adapter = new LocalDevProviderAdapter();
    const result = await adapter.provisionAccount({ account: baseAccount });

    expect(result.account.status).toBe('active');
    expect(result.status).toBe('active');
    expect(new Date(result.account.updatedAt).getTime()).toBeGreaterThan(
      new Date(baseAccount.updatedAt).getTime()
    );
  });

  it('keeps disabled accounts disabled on provision', async () => {
    const adapter = new LocalDevProviderAdapter();
    const disabledAccount = { ...baseAccount, status: 'disabled' as const };

    const result = await adapter.provisionAccount({ account: disabledAccount });

    expect(result.account.status).toBe('disabled');
    expect(result.status).toBe('disabled');
  });

  it('echoes payload on sendEmail', async () => {
    const adapter = new LocalDevProviderAdapter();
    const result = await adapter.sendEmail({
      account: baseAccount,
      to: 'receiver@example.com',
      subject: 'Test',
      text: 'Hello',
    });

    expect(result.id.startsWith('local-dev-')).toBe(true);
    expect(result.status).toBe('sent');
    expect(result.raw).toMatchObject({
      echo: {
        to: 'receiver@example.com',
        subject: 'Test',
        text: 'Hello',
        accountId: baseAccount.id,
      },
    });
  });
});

describe('getProviderAdapter', () => {
  it('returns singleton adapter for local-dev', () => {
    const first = getProviderAdapter('local-dev');
    const second = getProviderAdapter('local-dev');
    expect(first).toBe(second);
  });

  it('throws for unsupported providers', () => {
    expect(() => getProviderAdapter('smtp')).toThrow('not implemented');
  });
});

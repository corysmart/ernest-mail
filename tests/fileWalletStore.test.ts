/**
 * Tests for FileWalletStore.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileWalletStore, isAdminTenant } from '../src/fileWalletStore.js';

describe('FileWalletStore', () => {
  let store: FileWalletStore;
  let storePath: string;

  beforeEach(() => {
    storePath = join(
      mkdtempSync(join(tmpdir(), 'wallet-')),
      'wallets.json'
    );
    store = new FileWalletStore(storePath, { defaultInitialCredits: 0 });
    vi.stubEnv('ADMIN_TENANT_IDS', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(join(storePath, '..'), { recursive: true, force: true });
  });

  it('returns default balance for new tenant', async () => {
    const balance = await store.getBalance('tenant-a');
    expect(balance).toBe(0);
  });

  it('uses defaultInitialCredits for new tenant', async () => {
    const storeWithDefault = new FileWalletStore(storePath, {
      defaultInitialCredits: 100
    });
    const balance = await storeWithDefault.getBalance('tenant-b');
    expect(balance).toBe(100);
  });

  it('deducts and returns new balance', async () => {
    await store.add('tenant-a', 10);
    const result = await store.deduct('tenant-a', 3);
    expect(result.success).toBe(true);
    expect(result.newBalance).toBe(7);
    expect(await store.getBalance('tenant-a')).toBe(7);
  });

  it('deduct returns success false when insufficient', async () => {
    await store.add('tenant-a', 5);
    const result = await store.deduct('tenant-a', 10);
    expect(result.success).toBe(false);
    expect(result.newBalance).toBe(5);
    expect(await store.getBalance('tenant-a')).toBe(5);
  });

  it('add increases balance', async () => {
    const newBalance = await store.add('tenant-a', 50);
    expect(newBalance).toBe(50);
    expect(await store.getBalance('tenant-a')).toBe(50);
  });

  it('normalizes tenant id case', async () => {
    await store.add('Tenant-A', 10);
    expect(await store.getBalance('tenant-a')).toBe(10);
  });
});

describe('isAdminTenant', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns false when ADMIN_TENANT_IDS unset', () => {
    vi.stubEnv('ADMIN_TENANT_IDS', '');
    expect(isAdminTenant('admin')).toBe(false);
  });

  it('returns true when tenant in ADMIN_TENANT_IDS', () => {
    vi.stubEnv('ADMIN_TENANT_IDS', 'admin-1,admin-2');
    expect(isAdminTenant('admin-1')).toBe(true);
    expect(isAdminTenant('admin-2')).toBe(true);
  });

  it('returns false when tenant not in ADMIN_TENANT_IDS', () => {
    vi.stubEnv('ADMIN_TENANT_IDS', 'admin-1');
    expect(isAdminTenant('other')).toBe(false);
  });

  it('is case insensitive', () => {
    vi.stubEnv('ADMIN_TENANT_IDS', 'Admin-Tenant');
    expect(isAdminTenant('admin-tenant')).toBe(true);
  });
});

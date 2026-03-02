/**
 * File-based wallet store for tenant credits.
 * Used to enforce per-tenant email send limits.
 */

import { promises as fs } from 'node:fs';
import { basename, dirname, join } from 'node:path';

interface WalletStore {
  wallets: Record<string, number>;
}

const EMPTY_STORE: WalletStore = { wallets: {} };

function getAdminTenantIds(): Set<string> {
  const raw = process.env.ADMIN_TENANT_IDS;
  if (!raw || typeof raw !== 'string') return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminTenant(tenantId: string | undefined): boolean {
  if (!tenantId || !tenantId.trim()) return false;
  return getAdminTenantIds().has(tenantId.trim().toLowerCase());
}

export interface WalletStoreInterface {
  getBalance(tenantId: string): Promise<number>;
  deduct(tenantId: string, amount: number): Promise<{ success: boolean; newBalance: number }>;
  add(tenantId: string, amount: number): Promise<number>;
}

export class FileWalletStore implements WalletStoreInterface {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly defaultInitialCredits: number;

  constructor(
    filePath: string,
    options?: { defaultInitialCredits?: number }
  ) {
    this.filePath = filePath;
    this.defaultInitialCredits = options?.defaultInitialCredits ?? 0;
  }

  async getBalance(tenantId: string): Promise<number> {
    const store = await this.readStore();
    const key = this.normalizeTenantId(tenantId);
    return store.wallets[key] ?? this.defaultInitialCredits;
  }

  async deduct(tenantId: string, amount: number): Promise<{
    success: boolean;
    newBalance: number;
  }> {
    if (amount <= 0) {
      const balance = await this.getBalance(tenantId);
      return { success: true, newBalance: balance };
    }
    return this.withWriteLock(async () => {
      const store = await this.readStore();
      const key = this.normalizeTenantId(tenantId);
      const current = store.wallets[key] ?? this.defaultInitialCredits;
      if (current < amount) {
        return { success: false, newBalance: current };
      }
      const newBalance = current - amount;
      store.wallets[key] = newBalance;
      await this.writeStore(store);
      return { success: true, newBalance };
    });
  }

  async add(tenantId: string, amount: number): Promise<number> {
    if (amount <= 0) return this.getBalance(tenantId);
    return this.withWriteLock(async () => {
      const store = await this.readStore();
      const key = this.normalizeTenantId(tenantId);
      const current = store.wallets[key] ?? this.defaultInitialCredits;
      const newBalance = current + amount;
      store.wallets[key] = newBalance;
      await this.writeStore(store);
      return newBalance;
    });
  }

  private normalizeTenantId(tenantId: string): string {
    return tenantId.trim().toLowerCase();
  }

  private async withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.writeQueue;
    let release!: () => void;
    this.writeQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async readStore(): Promise<WalletStore> {
    await this.ensureStoreFile();
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<WalletStore>;
      if (!parsed.wallets || typeof parsed.wallets !== 'object') {
        return { ...EMPTY_STORE };
      }
      return { wallets: { ...parsed.wallets } };
    } catch {
      return { ...EMPTY_STORE };
    }
  }

  private async writeStore(store: WalletStore): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = join(
      dirname(this.filePath),
      `${basename(this.filePath)}.${process.pid}.${Date.now()}.tmp`
    );
    const payload = JSON.stringify(store, null, 2) + '\n';
    await fs.writeFile(tempPath, payload, 'utf8');
    await fs.rename(tempPath, this.filePath);
  }

  private async ensureStoreFile(): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });
    try {
      await fs.access(this.filePath);
    } catch {
      await this.writeStore({ ...EMPTY_STORE });
    }
  }
}

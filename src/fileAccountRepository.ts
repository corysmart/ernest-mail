import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import type {
  Account,
  AccountRepository,
  AccountStatus,
  CreateAccountInput,
} from './accounts.js';

interface AccountStore {
  accounts: Account[];
}

const EMPTY_STORE: AccountStore = { accounts: [] };

export class FileAccountRepository implements AccountRepository {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async create(input: CreateAccountInput): Promise<Account> {
    return this.withWriteLock(async () => {
      const store = await this.readStore();
      const email = normalizeEmail(input.email);

      const existing = store.accounts.find(
        (account) => normalizeEmail(account.email) === email,
      );

      if (existing) {
        throw new Error(`Account already exists for email ${email}`);
      }

      const now = new Date().toISOString();
      const account: Account = {
        id: randomUUID(),
        email,
        provider: input.provider,
        status: input.status ?? 'pending',
        createdAt: now,
        updatedAt: now,
      };

      store.accounts.push(account);
      await this.writeStore(store);
      return account;
    });
  }

  async getById(id: string): Promise<Account | null> {
    const store = await this.readStore();
    return store.accounts.find((account) => account.id === id) ?? null;
  }

  async getByEmail(email: string): Promise<Account | null> {
    const normalized = normalizeEmail(email);
    const store = await this.readStore();
    return (
      store.accounts.find((account) => normalizeEmail(account.email) === normalized) ??
      null
    );
  }

  async list(): Promise<Account[]> {
    const store = await this.readStore();
    return [...store.accounts];
  }

  async updateStatus(id: string, status: AccountStatus): Promise<Account | null> {
    return this.withWriteLock(async () => {
      const store = await this.readStore();
      const account = store.accounts.find((item) => item.id === id);

      if (!account) {
        return null;
      }

      account.status = status;
      account.updatedAt = new Date().toISOString();

      await this.writeStore(store);
      return account;
    });
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

  private async readStore(): Promise<AccountStore> {
    await this.ensureStoreFile();

    const raw = await fs.readFile(this.filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<AccountStore>;

    if (!Array.isArray(parsed.accounts)) {
      return { ...EMPTY_STORE };
    }

    return { accounts: parsed.accounts };
  }

  private async writeStore(store: AccountStore): Promise<void> {
    await fs.mkdir(dirname(this.filePath), { recursive: true });

    const tempPath = join(
      dirname(this.filePath),
      `${basename(this.filePath)}.${process.pid}.${Date.now()}.tmp`,
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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

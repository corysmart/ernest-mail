/**
 * File-backed one-time registration token store.
 * Tokens are created by admin and consumed once at self-registration.
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { basename, dirname, join } from 'node:path';

interface TokenEntry {
  createdAt: string;
  usedAt?: string;
}

interface TokenStoreData {
  tokens: Record<string, TokenEntry>;
}

const EMPTY_STORE: TokenStoreData = { tokens: {} };

export class FileTokenStore {
  private readonly defaultPath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    this.defaultPath = filePath;
  }

  private getPath(): string {
    return process.env.REGISTRATION_TOKENS_PATH ?? this.defaultPath;
  }

  /** Create one or more tokens. Returns array of token IDs. */
  async createToken(count: number = 1): Promise<string[]> {
    if (count < 1 || count > 100) {
      throw new Error('count must be between 1 and 100');
    }
    return this.withWriteLock(async () => {
      const store = await this.readStore();
      const tokens: string[] = [];
      const now = new Date().toISOString();
      for (let i = 0; i < count; i++) {
        const tokenId = randomUUID();
        store.tokens[tokenId] = { createdAt: now };
        tokens.push(tokenId);
      }
      await this.writeStore(store);
      return tokens;
    });
  }

  /**
   * Consume a token. Returns true if valid and unused; marks as used.
   * Returns false if invalid or already used.
   */
  async consumeToken(tokenId: string): Promise<boolean> {
    if (!tokenId || typeof tokenId !== 'string' || !tokenId.trim()) {
      return false;
    }
    const trimmed = tokenId.trim();
    return this.withWriteLock(async () => {
      const store = await this.readStore();
      const entry = store.tokens[trimmed];
      if (!entry || entry.usedAt) {
        return false;
      }
      entry.usedAt = new Date().toISOString();
      await this.writeStore(store);
      return true;
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

  private async readStore(): Promise<TokenStoreData> {
    await this.ensureStoreFile(this.getPath());
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<TokenStoreData>;
      if (!parsed.tokens || typeof parsed.tokens !== 'object') {
        return { ...EMPTY_STORE };
      }
      return { tokens: parsed.tokens };
    } catch {
      return { ...EMPTY_STORE };
    }
  }

  private async writeStore(store: TokenStoreData): Promise<void> {
    const path = this.getPath();
    await fs.mkdir(dirname(path), { recursive: true });
    const tempPath = join(
      dirname(path),
      `${basename(path)}.${process.pid}.${Date.now()}.tmp`
    );
    const payload = JSON.stringify(store, null, 2) + '\n';
    await fs.writeFile(tempPath, payload, 'utf8');
    await fs.rename(tempPath, path);
  }

  private async ensureStoreFile(path: string): Promise<void> {
    await fs.mkdir(dirname(path), { recursive: true });
    try {
      await fs.access(path);
    } catch {
      await this.writeStore({ ...EMPTY_STORE });
    }
  }
}

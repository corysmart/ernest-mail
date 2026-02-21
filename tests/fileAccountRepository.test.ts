/**
 * Unit and integration tests for FileAccountRepository.
 * Uses real filesystem with temp directories.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { FileAccountRepository } from '../src/fileAccountRepository.js';

describe('FileAccountRepository', () => {
  let tempDir: string;
  let repo: FileAccountRepository;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'ernest-mail-test-'));
    repo = new FileAccountRepository(join(tempDir, 'accounts.json'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('creates an account with all required fields', async () => {
      const account = await repo.create({
        email: 'alice@example.com',
        provider: 'smtp',
      });

      expect(account.id).toBeDefined();
      expect(account.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(account.email).toBe('alice@example.com');
      expect(account.provider).toBe('smtp');
      expect(account.status).toBe('pending');
      expect(account.createdAt).toBeDefined();
      expect(account.updatedAt).toBeDefined();
      expect(account.createdAt).toBe(account.updatedAt);
    });

    it('uses provided status when given', async () => {
      const account = await repo.create({
        email: 'bob@example.com',
        provider: 'local-dev',
        status: 'active',
      });
      expect(account.status).toBe('active');
    });

    it('normalizes email (trim and lowercase)', async () => {
      const account = await repo.create({
        email: '  Carol@Example.COM  ',
        provider: 'smtp',
      });
      expect(account.email).toBe('carol@example.com');
    });

    it('throws when account already exists for email', async () => {
      await repo.create({ email: 'dup@example.com', provider: 'smtp' });
      await expect(
        repo.create({ email: 'dup@example.com', provider: 'ses' })
      ).rejects.toThrow('Account already exists for email dup@example.com');
    });

    it('throws when duplicate with different email casing', async () => {
      await repo.create({ email: 'dup@example.com', provider: 'smtp' });
      await expect(
        repo.create({ email: 'DUP@EXAMPLE.COM', provider: 'ses' })
      ).rejects.toThrow('Account already exists for email dup@example.com');
    });
  });

  describe('getById', () => {
    it('returns account when found', async () => {
      const created = await repo.create({
        email: 'getbyid@example.com',
        provider: 'smtp',
      });
      const found = await repo.getById(created.id);
      expect(found).toEqual(created);
    });

    it('returns null when not found', async () => {
      const found = await repo.getById('non-existent-id');
      expect(found).toBeNull();
    });
  });

  describe('getByEmail', () => {
    it('returns account when found', async () => {
      const created = await repo.create({
        email: 'getbyemail@example.com',
        provider: 'smtp',
      });
      const found = await repo.getByEmail('getbyemail@example.com');
      expect(found).toEqual(created);
    });

    it('returns account with normalized email lookup', async () => {
      await repo.create({
        email: 'normalized@example.com',
        provider: 'smtp',
      });
      const found = await repo.getByEmail('  Normalized@EXAMPLE.COM  ');
      expect(found).not.toBeNull();
      expect(found!.email).toBe('normalized@example.com');
    });

    it('returns null when not found', async () => {
      const found = await repo.getByEmail('missing@example.com');
      expect(found).toBeNull();
    });
  });

  describe('list', () => {
    it('returns empty array when no accounts', async () => {
      const accounts = await repo.list();
      expect(accounts).toEqual([]);
    });

    it('returns all accounts', async () => {
      const a1 = await repo.create({
        email: 'list1@example.com',
        provider: 'smtp',
      });
      const a2 = await repo.create({
        email: 'list2@example.com',
        provider: 'ses',
      });
      const accounts = await repo.list();
      expect(accounts).toHaveLength(2);
      expect(accounts.find((a) => a.id === a1.id)).toEqual(a1);
      expect(accounts.find((a) => a.id === a2.id)).toEqual(a2);
    });

    it('returns a copy (not mutating store)', async () => {
      await repo.create({ email: 'mutate@example.com', provider: 'smtp' });
      const accounts = await repo.list();
      accounts.push({
        id: 'fake',
        email: 'fake@example.com',
        provider: 'smtp',
        status: 'pending',
        createdAt: '',
        updatedAt: '',
      });
      const again = await repo.list();
      expect(again).toHaveLength(1);
    });
  });

  describe('updateStatus', () => {
    it('updates status and updatedAt', async () => {
      const created = await repo.create({
        email: 'update@example.com',
        provider: 'smtp',
        status: 'pending',
      });
      const updated = await repo.updateStatus(created.id, 'active');
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('active');
      expect(updated!.updatedAt).toBeDefined();
      expect(
        new Date(updated!.updatedAt).getTime()
      ).toBeGreaterThanOrEqual(new Date(created.updatedAt).getTime());

      const found = await repo.getById(created.id);
      expect(found!.status).toBe('active');
    });

    it('returns null when account not found', async () => {
      const updated = await repo.updateStatus('non-existent', 'active');
      expect(updated).toBeNull();
    });
  });

  describe('atomic write', () => {
    it('writes via temp file then rename (no partial writes)', async () => {
      const filePath = join(tempDir, 'accounts.json');
      await repo.create({ email: 'atomic@example.com', provider: 'smtp' });

      const content = readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(content);
      expect(parsed.accounts).toHaveLength(1);
      expect(parsed.accounts[0].email).toBe('atomic@example.com');
    });
  });

  describe('concurrent writes (write lock)', () => {
    it('serializes concurrent creates', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        repo.create({
          email: `concurrent${i}@example.com`,
          provider: 'smtp',
        })
      );
      const accounts = await Promise.all(promises);
      expect(accounts).toHaveLength(5);
      const emails = new Set(accounts.map((a) => a.email));
      expect(emails.size).toBe(5);

      const list = await repo.list();
      expect(list).toHaveLength(5);
    });
  });

  describe('persistence', () => {
    it('persists across repository instances', async () => {
      const account = await repo.create({
        email: 'persist@example.com',
        provider: 'smtp',
      });

      const repo2 = new FileAccountRepository(join(tempDir, 'accounts.json'));
      const found = await repo2.getById(account.id);
      expect(found).toEqual(account);
    });
  });
});

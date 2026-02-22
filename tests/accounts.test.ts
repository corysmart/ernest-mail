/**
 * Unit tests for account domain types and interface.
 */

import { describe, it, expect } from 'vitest';
import type {
  Account,
  AccountProvider,
  AccountStatus,
  CreateAccountInput,
} from '../src/accounts.js';

describe('accounts domain', () => {
  describe('AccountProvider', () => {
    it('allows valid provider values', () => {
      const providers: AccountProvider[] = [
        'local-dev',
        'resend',
        'smtp',
        'ses',
        'sendgrid',
      ];
      for (const p of providers) {
        expect(p).toMatch(/^(local-dev|resend|smtp|ses|sendgrid)$/);
      }
    });
  });

  describe('AccountStatus', () => {
    it('allows valid status values', () => {
      const statuses: AccountStatus[] = ['pending', 'active', 'disabled'];
      for (const s of statuses) {
        expect(s).toMatch(/^(pending|active|disabled)$/);
      }
    });
  });

  describe('Account', () => {
    it('has required fields with correct types', () => {
      const account: Account = {
        id: 'acc-123',
        email: 'test@example.com',
        provider: 'smtp',
        status: 'active',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      expect(account.id).toBe('acc-123');
      expect(account.email).toBe('test@example.com');
      expect(account.provider).toBe('smtp');
      expect(account.status).toBe('active');
      expect(typeof account.createdAt).toBe('string');
      expect(typeof account.updatedAt).toBe('string');
    });
  });

  describe('CreateAccountInput', () => {
    it('requires email and provider', () => {
      const input: CreateAccountInput = {
        email: 'new@example.com',
        provider: 'smtp',
      };
      expect(input.email).toBe('new@example.com');
      expect(input.provider).toBe('smtp');
      expect(input.status).toBeUndefined();
    });

    it('allows optional status', () => {
      const input: CreateAccountInput = {
        email: 'new@example.com',
        provider: 'smtp',
        status: 'active',
      };
      expect(input.status).toBe('active');
    });
  });
});

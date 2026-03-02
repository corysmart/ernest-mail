/**
 * Tests for Resend provider adapter.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ResendProviderAdapter, getProviderAdapter } from '../src/providers.js';
import type { Account } from '../src/accounts.js';

const baseAccount: Account = {
  id: 'acct-resend',
  email: 'sender@verified-domain.com',
  provider: 'resend',
  status: 'active',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

describe('ResendProviderAdapter', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 're_test_key');
    vi.stubEnv('RESEND_FROM', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('provisions account and sets active', async () => {
    const adapter = new ResendProviderAdapter();
    const result = await adapter.provisionAccount({ account: baseAccount });

    expect(result.account.status).toBe('active');
    expect(result.status).toBe('active');
    expect(adapter.provider).toBe('resend');
  });

  it('throws when RESEND_API_KEY unset', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const adapter = new ResendProviderAdapter();

    await expect(adapter.provisionAccount({ account: baseAccount })).rejects.toThrow(
      'RESEND_API_KEY'
    );
  });

  it('sends email via Resend API', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'resend-msg-123' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    globalThis.fetch = fetchMock;

    const adapter = new ResendProviderAdapter();
    const result = await adapter.sendEmail({
      account: baseAccount,
      to: 'recipient@example.com',
      subject: 'Hello',
      text: 'World'
    });

    expect(result.id).toBe('resend-msg-123');
    expect(result.provider).toBe('resend');
    expect(result.to).toBe('recipient@example.com');
    expect(result.status).toBe('queued');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test_key',
          'Content-Type': 'application/json'
        })
      })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.from).toBe(baseAccount.email);
    expect(body.to).toEqual(['recipient@example.com']);
    expect(body.subject).toBe('Hello');
    expect(body.text).toBe('World');
  });

  it('uses RESEND_FROM when set', async () => {
    vi.stubEnv('RESEND_FROM', 'Acme <onboarding@resend.dev>');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'x' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    globalThis.fetch = fetchMock;

    const adapter = new ResendProviderAdapter();
    await adapter.sendEmail({
      account: baseAccount,
      to: 'u@ex.com',
      subject: 'Hi',
      text: 'Hi'
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.from).toBe('Acme <onboarding@resend.dev>');
  });

  it('includes reply_to when provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'x' }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );
    globalThis.fetch = fetchMock;

    const adapter = new ResendProviderAdapter();
    await adapter.sendEmail({
      account: baseAccount,
      to: 'u@ex.com',
      subject: 'Hi',
      html: '<p>Hi</p>',
      replyTo: 'reply@example.com'
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reply_to).toBe('reply@example.com');
    expect(body.html).toBe('<p>Hi</p>');
  });

  it('throws on Resend API error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: 'Invalid API key' }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      })
    );
    globalThis.fetch = fetchMock;

    const adapter = new ResendProviderAdapter();
    await expect(
      adapter.sendEmail({
        account: baseAccount,
        to: 'u@ex.com',
        subject: 'Hi',
        text: 'Hi'
      })
    ).rejects.toThrow('Invalid API key');
  });
});

describe('getProviderAdapter resend', () => {
  beforeEach(() => {
    vi.stubEnv('RESEND_API_KEY', 're_test');
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns singleton adapter for resend', () => {
    const first = getProviderAdapter('resend');
    const second = getProviderAdapter('resend');
    expect(first).toBe(second);
    expect(first.provider).toBe('resend');
  });
});

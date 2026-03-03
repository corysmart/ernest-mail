/**
 * Unit tests for Resend Inbound API client.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { listReceivedEmails, getReceivedEmail } from '../src/resendReceiving.js';


beforeEach(() => {
  delete process.env.RESEND_API_KEY;
});

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  vi.restoreAllMocks();
});

describe('listReceivedEmails', () => {
  it('returns error when RESEND_API_KEY is unset', async () => {
    const result = await listReceivedEmails();
    expect(result.ok).toBe(false);
    expect(result.error).toContain('RESEND_API_KEY');
  });

  it('returns list when Resend API succeeds', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const mockData = {
      object: 'list',
      has_more: false,
      data: [{ id: 'e1', from: 'a@b.com', to: ['c@d.com'], subject: 'Hi', created_at: '2025-01-01T00:00:00Z' }]
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const result = await listReceivedEmails({ limit: 10 });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails/receiving?limit=10',
      expect.objectContaining({ method: 'GET', headers: { Authorization: 'Bearer re_test' } })
    );
  });
});

describe('getReceivedEmail', () => {
  it('returns error when emailId is empty', async () => {
    const result = await getReceivedEmail('');
    expect(result.ok).toBe(false);
    expect(result.error).toContain('required');
  });

  it('returns email when Resend API succeeds', async () => {
    process.env.RESEND_API_KEY = 're_test';
    const mockData = {
      id: 'e1',
      from: 'a@b.com',
      to: ['c@d.com'],
      subject: 'Hi',
      text: 'Hello',
      html: null,
      created_at: '2025-01-01T00:00:00Z'
    };
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockData), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    );

    const result = await getReceivedEmail('e1');
    expect(result.ok).toBe(true);
    expect(result.data).toEqual(mockData);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails/receiving/e1',
      expect.objectContaining({ method: 'GET' })
    );
  });
});

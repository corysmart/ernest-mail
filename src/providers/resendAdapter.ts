/**
 * Resend provider adapter. Sends email via Resend API.
 * Requires RESEND_API_KEY and RESEND_FROM (verified sender).
 */

import type {
  Account,
  AccountProvider,
  AccountStatus,
} from '../accounts.js';
import type {
  ProviderAdapter,
  ProvisionAccountInput,
  ProvisionAccountResult,
  SendEmailInput,
  SendEmailResult,
} from '../providers.js';

const RESEND_API = 'https://api.resend.com/emails';

function getApiKey(): string | undefined {
  const key = process.env.RESEND_API_KEY;
  return typeof key === 'string' && key.trim() ? key.trim() : undefined;
}

function getFromAddress(account?: Account): string {
  const envFrom = process.env.RESEND_FROM;
  if (typeof envFrom === 'string' && envFrom.trim()) {
    return envFrom.trim();
  }
  if (account?.email) {
    return account.email;
  }
  throw new Error('RESEND_FROM env or account email required for Resend sends');
}

/**
 * Resend adapter. Uses RESEND_API_KEY and RESEND_FROM.
 */
export class ResendProviderAdapter implements ProviderAdapter {
  readonly provider: AccountProvider = 'resend';

  async provisionAccount(
    input: ProvisionAccountInput
  ): Promise<ProvisionAccountResult> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is required for resend provider');
    }
    const now = new Date().toISOString();
    const updatedAccount: Account = {
      ...input.account,
      status: input.account.status === 'disabled' ? 'disabled' : 'active',
      updatedAt: now
    };
    return {
      account: updatedAccount,
      externalId: input.account.id,
      status: updatedAccount.status,
      credentials: input.credentials,
      metadata: { provider: this.provider }
    };
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is required for resend provider');
    }

    const from = getFromAddress(input.account);
    const to = input.to;
    const subject = input.subject;
    const html = input.html;
    const text = input.text;
    const replyTo = input.replyTo;

    if (!text && !html) {
      throw new Error('text or html content required');
    }

    const body: Record<string, unknown> = {
      from,
      to: Array.isArray(to) ? to : [to],
      subject
    };
    if (html) body.html = html;
    if (text) body.text = text;
    if (replyTo) body.reply_to = replyTo;

    const response = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const raw = await response.json().catch(() => ({})) as { id?: string; message?: string };

    if (!response.ok) {
      const errMsg = typeof raw?.message === 'string' ? raw.message : `Resend API error ${response.status}`;
      throw new Error(errMsg);
    }

    const id = raw?.id ?? `resend-${Date.now()}`;
    return {
      id,
      provider: this.provider,
      to: Array.isArray(to) ? to[0] ?? to : to,
      status: 'queued',
      raw
    };
  }
}

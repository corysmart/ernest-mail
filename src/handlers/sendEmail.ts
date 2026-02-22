import type { AccountRepository } from '../accounts.js';
import type { ProviderAdapter } from '../providers.js';

export interface SendEmailRequestBody {
  accountId?: string;
  account_id?: string;
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  replyTo?: string;
  reply_to?: string;
  tenantId?: string;
  tenant_id?: string;
}

export interface SendEmailDeps {
  accountRepository: AccountRepository;
  getProviderAdapter(provider: string): ProviderAdapter;
}

export interface SendEmailResult {
  status: number;
  body: unknown;
}

/** Validate payload and send email using configured provider adapter. */
export async function processSendEmail(
  body: SendEmailRequestBody,
  deps: SendEmailDeps,
): Promise<SendEmailResult> {
  const accountId = body.accountId ?? body.account_id;
  if (typeof accountId !== 'string' || !accountId.trim()) {
    return { status: 400, body: { error: 'accountId required' } };
  }

  const to = typeof body.to === 'string' ? body.to.trim() : '';
  if (!to || !isValidEmail(to)) {
    return { status: 400, body: { error: 'valid to email required' } };
  }

  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  if (!subject) {
    return { status: 400, body: { error: 'subject required' } };
  }

  const text = typeof body.text === 'string' ? body.text : undefined;
  const html = typeof body.html === 'string' ? body.html : undefined;
  if (!text && !html) {
    return { status: 400, body: { error: 'text or html content required' } };
  }

  const replyTo = body.replyTo ?? body.reply_to;
  const replyToValue =
    typeof replyTo === 'string' && replyTo.trim().length > 0
      ? replyTo.trim()
      : undefined;
  if (replyToValue && !isValidEmail(replyToValue)) {
    return { status: 400, body: { error: 'replyTo must be a valid email when provided' } };
  }

  const tenantId = body.tenantId ?? body.tenant_id;

  const account = await deps.accountRepository.getById(accountId.trim());
  if (!account) {
    return { status: 404, body: { error: 'Account not found' } };
  }

  if (account.status === 'disabled') {
    return { status: 403, body: { error: 'Account is disabled' } };
  }

  try {
    const adapter = deps.getProviderAdapter(account.provider);
    const result = await adapter.sendEmail({
      account,
      to,
      subject,
      text,
      html,
      tenantId: typeof tenantId === 'string' ? tenantId : undefined,
      replyTo: replyToValue,
    });
    return { status: 202, body: result };
  } catch (err) {
    return {
      status: 502,
      body: { error: err instanceof Error ? err.message : 'Email send failed' },
    };
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

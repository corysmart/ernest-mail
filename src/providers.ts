import type { Account, AccountProvider, AccountStatus } from './accounts.js';
import { LocalDevProviderAdapter } from './providers/localDevAdapter.js';

/**
 * Provider adapter contracts for provisioning accounts and sending email.
 *
 * Implementations (e.g., Resend, SMTP, local-dev) should satisfy this
 * interface so the HTTP layer can remain provider-agnostic.
 */

/**
 * Provider-specific secrets or connection details that may be produced during
 * provisioning (e.g., SMTP username/password, API key, verified from address).
 *
 * Keep this flexible to accommodate different providers while still offering a
 * typed shape for the most common fields.
 */
export interface ProviderAccountSecrets {
  smtp?: {
    host: string;
    port: number;
    secure?: boolean;
    user: string;
    pass: string;
    from?: string;
  };
  apiKey?: string;
  from?: string;
  [key: string]: unknown;
}

export interface ProvisionAccountInput {
  /** Account record persisted by ernest-mail. */
  account: Account;
  /** Optional preferred from-address or display identity. */
  requestedFromAddress?: string;
  /** Provider credentials supplied by caller (e.g., custom SMTP creds). */
  credentials?: ProviderAccountSecrets;
}

export interface ProvisionAccountResult {
  account: Account;
  /** Provider-specific identifier (e.g., Resend ID, SMTP username). */
  externalId?: string;
  /**
   * If provisioning updates the lifecycle state (e.g., pending -> active),
   * adapters can surface that here so callers can persist the change.
   */
  status?: AccountStatus;
  /** Provider secrets to persist securely for future sends. */
  credentials?: ProviderAccountSecrets;
  /** Any extra metadata the caller may want to log or persist. */
  metadata?: Record<string, unknown>;
}

export interface EmailContent {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

export interface SendEmailInput extends EmailContent {
  /** The account used to send. */
  account: Account;
  /** Optional tenant/agent identifier for logging and credits. */
  tenantId?: string;
  /** Optional provider credentials if not stored elsewhere. */
  credentials?: ProviderAccountSecrets;
}

export interface SendEmailResult {
  /** Provider-specific message identifier. */
  id: string;
  provider: AccountProvider;
  to: string;
  /** Delivery status as returned by the provider. */
  status: 'queued' | 'sent';
  /** Raw provider response for debugging or logging. */
  raw?: unknown;
}

export interface ProviderAdapter {
  readonly provider: AccountProvider;

  /** Provision (or validate) an account with the underlying provider. */
  provisionAccount(input: ProvisionAccountInput): Promise<ProvisionAccountResult>;

  /** Send an email using the given account. */
  sendEmail(input: SendEmailInput): Promise<SendEmailResult>;
}

export { LocalDevProviderAdapter } from './providers/localDevAdapter.js';

/**
 * Return a singleton adapter for the requested provider.
 * Currently only the local-dev adapter is implemented; other providers
 * will be added in later tasks.
 */
export function getProviderAdapter(provider: AccountProvider): ProviderAdapter {
  switch (provider) {
    case 'local-dev':
      if (!localDevAdapter) {
        localDevAdapter = new LocalDevProviderAdapter();
      }
      return localDevAdapter;
    default:
      throw new Error(`Provider adapter not implemented: ${provider}`);
  }
}

let localDevAdapter: LocalDevProviderAdapter | undefined;

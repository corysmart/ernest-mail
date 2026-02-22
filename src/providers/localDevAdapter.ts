import { randomUUID } from 'node:crypto';
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

/**
 * Lightweight local/dev provider that simulates provisioning and sending
 * without external network calls. Useful for tests and offline development.
 */
export class LocalDevProviderAdapter implements ProviderAdapter {
  readonly provider: AccountProvider = 'local-dev';

  async provisionAccount(
    input: ProvisionAccountInput
  ): Promise<ProvisionAccountResult> {
    const now = new Date().toISOString();
    const updatedAccount: Account = {
      ...input.account,
      status: this.resolveStatus(input.account.status),
      updatedAt: now,
    };

    return {
      account: updatedAccount,
      externalId: input.account.id,
      status: updatedAccount.status,
      credentials: input.credentials,
      metadata: { provider: this.provider, from: input.requestedFromAddress },
    };
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    return {
      id: `local-dev-${randomUUID()}`,
      provider: this.provider,
      to: input.to,
      status: 'sent',
      raw: {
        echo: {
          to: input.to,
          subject: input.subject,
          text: input.text,
          html: input.html,
          accountId: input.account.id,
          tenantId: input.tenantId,
        },
      },
    };
  }

  private resolveStatus(status: AccountStatus): AccountStatus {
    if (status === 'disabled') return 'disabled';
    return 'active';
  }
}

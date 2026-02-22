export type AccountProvider = 'local-dev' | 'resend' | 'smtp' | 'ses' | 'sendgrid';

export type AccountStatus = 'pending' | 'active' | 'disabled';

export interface Account {
  id: string;
  email: string;
  provider: AccountProvider;
  status: AccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountInput {
  email: string;
  provider: AccountProvider;
  status?: AccountStatus;
}

export interface AccountRepository {
  create(input: CreateAccountInput): Promise<Account>;
  getById(id: string): Promise<Account | null>;
  getByEmail(email: string): Promise<Account | null>;
  list(): Promise<Account[]>;
  updateStatus(id: string, status: AccountStatus): Promise<Account | null>;
}

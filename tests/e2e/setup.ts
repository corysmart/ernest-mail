/**
 * E2E test setup. Runs before e2e tests; sets env so app uses test storage.
 */

import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const e2eTmp = mkdtempSync(join(tmpdir(), 'ernest-e2e-'));
process.env.API_KEY = process.env.API_KEY ?? 'e2e-test-key';
process.env.ACCOUNTS_PATH =
  process.env.ACCOUNTS_PATH ?? join(e2eTmp, 'accounts.json');
process.env.WALLET_PATH =
  process.env.WALLET_PATH ?? join(e2eTmp, 'wallets.json');
process.env.AGENTS_PATH =
  process.env.AGENTS_PATH ?? join(e2eTmp, 'agents.json');

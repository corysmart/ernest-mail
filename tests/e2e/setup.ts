/**
 * E2E test setup. Runs before e2e tests; sets env so app uses test storage.
 */

import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

process.env.API_KEY = process.env.API_KEY ?? 'e2e-test-key';
process.env.ACCOUNTS_PATH =
  process.env.ACCOUNTS_PATH ??
  join(mkdtempSync(join(tmpdir(), 'ernest-e2e-')), 'accounts.json');

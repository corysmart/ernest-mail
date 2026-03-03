/**
 * Resend Inbound API client.
 * List and retrieve received emails via Resend API.
 * Requires RESEND_API_KEY.
 */

const RESEND_RECEIVING_BASE = 'https://api.resend.com/emails/receiving';

function getApiKey(): string | undefined {
  const key = process.env.RESEND_API_KEY;
  return typeof key === 'string' && key.trim() ? key.trim() : undefined;
}

export interface ReceivedEmailSummary {
  id: string;
  to: string[];
  from: string;
  created_at: string;
  subject: string;
  bcc?: string[];
  cc?: string[];
  reply_to?: string[];
  message_id?: string;
  attachments?: Array<{
    id: string;
    filename: string;
    content_type: string;
    content_id?: string | null;
    content_disposition?: string;
    size?: number;
  }>;
}

export interface ReceivedEmailListResult {
  object: 'list';
  has_more: boolean;
  data: ReceivedEmailSummary[];
}

export interface ReceivedEmailFull {
  object: 'email';
  id: string;
  to: string[];
  from: string;
  created_at: string;
  subject: string;
  html?: string | null;
  text?: string | null;
  headers?: Record<string, string>;
  bcc?: string[];
  cc?: string[];
  reply_to?: string[];
  message_id?: string | null;
  raw?: { download_url: string; expires_at: string };
  attachments?: Array<{
    id: string;
    filename: string;
    content_type: string;
    content_disposition?: string | null;
    content_id?: string | null;
  }>;
}

async function resendFetch<T>(url: string): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { ok: false, status: 0, error: 'RESEND_API_KEY is required for receiving' };
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}` }
  });

  const raw = await response.json().catch(() => ({})) as { message?: string; name?: string };
  if (!response.ok) {
    const errMsg = typeof raw?.message === 'string' ? raw.message : `Resend API error ${response.status}`;
    return { ok: false, status: response.status, error: errMsg };
  }

  return { ok: true, status: response.status, data: raw as T };
}

/**
 * List received emails from Resend Inbound.
 * Supports pagination via limit, after, before.
 */
export async function listReceivedEmails(options?: {
  limit?: number;
  after?: string;
  before?: string;
}): Promise<{ ok: boolean; status?: number; data?: ReceivedEmailListResult; error?: string }> {
  const params = new URLSearchParams();
  if (options?.limit != null) {
    const limit = Math.min(100, Math.max(1, options.limit));
    params.set('limit', String(limit));
  }
  if (options?.after) params.set('after', options.after);
  if (options?.before) params.set('before', options.before);
  const qs = params.toString();
  const url = qs ? `${RESEND_RECEIVING_BASE}?${qs}` : RESEND_RECEIVING_BASE;
  return resendFetch<ReceivedEmailListResult>(url);
}

/**
 * Retrieve a single received email by ID (full content: html, text, headers).
 */
export async function getReceivedEmail(
  emailId: string
): Promise<{ ok: boolean; status?: number; data?: ReceivedEmailFull; error?: string }> {
  if (!emailId || typeof emailId !== 'string' || !emailId.trim()) {
    return { ok: false, status: 400, error: 'emailId is required' };
  }
  const url = `${RESEND_RECEIVING_BASE}/${encodeURIComponent(emailId.trim())}`;
  return resendFetch<ReceivedEmailFull>(url);
}

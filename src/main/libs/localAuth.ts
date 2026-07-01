import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import nodemailer from 'nodemailer';

import { AuthMode, AuthSubscriptionStatus } from '../../shared/auth/constants';

export const LocalAuthStoreKey = {
  Session: 'local_auth_session',
  User: 'local_auth_user',
} as const;

export const LocalEmailCodeFailureReason = {
  Missing: 'missing',
  Expired: 'expired',
  Invalid: 'invalid',
} as const;

export type LocalEmailCodeFailureReason =
  typeof LocalEmailCodeFailureReason[keyof typeof LocalEmailCodeFailureReason];

export interface LocalAuthSmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  pass: string;
  user?: string;
  from?: string;
  rejectUnauthorized: boolean;
}

export interface LocalAuthSupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  jwtSecret?: string;
}

export interface LocalAuthConfig {
  mode: typeof AuthMode.LocalSupabase;
  smtp: LocalAuthSmtpConfig;
  supabase: LocalAuthSupabaseConfig;
}

export interface RemoteAuthConfig {
  mode: typeof AuthMode.Remote;
  missing: string[];
}

export type ResolvedAuthConfig = LocalAuthConfig | RemoteAuthConfig;

export interface LocalEmailCodeEntry {
  code: string;
  expiresAt: number;
}

export interface LocalAuthUser extends Record<string, unknown> {
  yid: string;
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  phone: null;
  email: string;
}

export interface LocalAuthSession {
  authMode: typeof AuthMode.LocalSupabase;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
  user: LocalAuthUser;
}

export interface SendLocalEmailCodeOptions {
  config: LocalAuthSmtpConfig;
  email: string;
  code: string;
  transporter?: {
    sendMail: (mail: {
      from: string;
      to: string;
      subject: string;
      text: string;
      html: string;
    }) => Promise<unknown>;
  };
}

export interface VerifyLocalEmailCodeResult {
  success: true;
}

export interface VerifyLocalEmailCodeFailureResult {
  success: false;
  reason: LocalEmailCodeFailureReason;
}

export type VerifyLocalEmailCodeOutcome =
  | VerifyLocalEmailCodeResult
  | VerifyLocalEmailCodeFailureResult;

type DotenvLike = Record<string, string | undefined>;

type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

interface SupabaseAuthUserResponse {
  id?: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}

interface SupabaseSessionResponse {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  expires_in?: number;
  user?: SupabaseAuthUserResponse;
}

interface SupabaseErrorResponse {
  error?: string;
  error_code?: string;
  msg?: string;
  message?: string;
}

const LOCAL_AUTH_CODE_TTL_MS = 10 * 60 * 1000;
const LOCAL_AUTH_CODE_LENGTH = 6;
const LOCAL_AUTH_EMAIL_SUBJECT = '登录验证码';
const LOCAL_AUTH_DEFAULT_REFRESH_BUFFER_MS = 5 * 60 * 1000;

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const readString = (value: string | undefined): string => (
  typeof value === 'string' ? value.trim() : ''
);

const readBoolean = (value: string | undefined, fallback: boolean): boolean => {
  const normalized = readString(value).toLowerCase();
  if (!normalized) return fallback;
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const readPositiveInteger = (value: string | undefined): number | null => {
  const parsed = Number.parseInt(readString(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const safeJson = async <T>(response: { json: () => Promise<unknown> }): Promise<T | null> => {
  try {
    return await response.json() as T;
  } catch {
    return null;
  }
};

const buildDotenvPath = (projectRoot: string): string => path.join(projectRoot, '.env.local');

export const parseDotenvContent = (content: string): Record<string, string> => {
  const parsed: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex < 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (!key) continue;

    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
};

export const readProjectDotenv = (projectRoot: string): Record<string, string> => {
  const envPath = buildDotenvPath(projectRoot);
  if (!fs.existsSync(envPath)) {
    return {};
  }
  return parseDotenvContent(fs.readFileSync(envPath, 'utf8'));
};

export const resolveLocalAuthConfig = (
  projectRoot: string,
  overrides: DotenvLike = process.env,
): ResolvedAuthConfig => {
  const env = {
    ...readProjectDotenv(projectRoot),
    ...overrides,
  };

  const smtpHost = readString(env.SMTP_HOST) || readString(env.SMTP_URL);
  const smtpPort = readPositiveInteger(env.SMTP_PORT);
  const smtpPass = readString(env.SMTP_PASS) || readString(env.EMAIL_CODE);
  const smtpUser = readString(env.SMTP_USER) || undefined;
  const smtpFrom = readString(env.SMTP_FROM) || smtpUser;

  const supabaseUrl = readString(env.SUPABASE_URL) || readString(env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseAnonKey = readString(env.SUPABASE_ANON_KEY) || readString(env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const supabaseServiceRoleKey = readString(env.SUPABASE_SERVICE_ROLE_KEY) || readString(env.SUPABASE_SECRET_KEY);
  const supabaseJwtSecret = readString(env.SUPABASE_JWT_SECRET) || undefined;

  const missing: string[] = [];
  if (!smtpHost) missing.push('SMTP_URL');
  if (!smtpPort) missing.push('SMTP_PORT');
  if (!smtpPass) missing.push('SMTP_PASS/EMAIL_CODE');
  if (!supabaseUrl) missing.push('SUPABASE_URL');
  if (!supabaseAnonKey) missing.push('SUPABASE_ANON_KEY');
  if (!supabaseServiceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');

  if (missing.length > 0) {
    return {
      mode: AuthMode.Remote,
      missing,
    };
  }

  return {
    mode: AuthMode.LocalSupabase,
    smtp: {
      host: smtpHost,
      port: smtpPort!,
      secure: readBoolean(env.SMTP_SECURE, smtpPort === 465),
      pass: smtpPass,
      ...(smtpUser ? { user: smtpUser } : {}),
      ...(smtpFrom ? { from: smtpFrom } : {}),
      rejectUnauthorized: readBoolean(env.SMTP_REJECT_UNAUTHORIZED, true),
    },
    supabase: {
      url: supabaseUrl,
      anonKey: supabaseAnonKey,
      serviceRoleKey: supabaseServiceRoleKey,
      ...(supabaseJwtSecret ? { jwtSecret: supabaseJwtSecret } : {}),
    },
  };
};

const createEmailCode = (): string => {
  const random = crypto.randomInt(0, 10 ** LOCAL_AUTH_CODE_LENGTH);
  return String(random).padStart(LOCAL_AUTH_CODE_LENGTH, '0');
};

export class LocalEmailCodeStore {
  private readonly entries = new Map<string, LocalEmailCodeEntry>();

  constructor(
    private readonly now: () => number = () => Date.now(),
  ) {}

  issue(email: string): LocalEmailCodeEntry {
    const normalizedEmail = normalizeEmail(email);
    const entry = {
      code: createEmailCode(),
      expiresAt: this.now() + LOCAL_AUTH_CODE_TTL_MS,
    };
    this.entries.set(normalizedEmail, entry);
    return entry;
  }

  verify(email: string, code: string): VerifyLocalEmailCodeOutcome {
    const normalizedEmail = normalizeEmail(email);
    const entry = this.entries.get(normalizedEmail);
    if (!entry) {
      return {
        success: false,
        reason: LocalEmailCodeFailureReason.Missing,
      };
    }

    if (entry.expiresAt <= this.now()) {
      this.entries.delete(normalizedEmail);
      return {
        success: false,
        reason: LocalEmailCodeFailureReason.Expired,
      };
    }

    if (entry.code !== code.trim()) {
      return {
        success: false,
        reason: LocalEmailCodeFailureReason.Invalid,
      };
    }

    this.entries.delete(normalizedEmail);
    return { success: true };
  }

  clear(email?: string): void {
    if (email) {
      this.entries.delete(normalizeEmail(email));
      return;
    }
    this.entries.clear();
  }
}

export const resolveSmtpEnvelope = (
  config: LocalAuthSmtpConfig,
  email: string,
): { user: string; from: string } => {
  const normalizedEmail = normalizeEmail(email);
  const user = config.user || normalizedEmail;
  const from = config.from || user;
  return { user, from };
};

export const sendLocalEmailCode = async ({
  config,
  email,
  code,
  transporter,
}: SendLocalEmailCodeOptions): Promise<void> => {
  const { user, from } = resolveSmtpEnvelope(config, email);
  const activeTransporter = transporter ?? nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user,
      pass: config.pass,
    },
    tls: {
      rejectUnauthorized: config.rejectUnauthorized,
    },
  });

  const safeCode = code.trim();
  await activeTransporter.sendMail({
    from,
    to: normalizeEmail(email),
    subject: LOCAL_AUTH_EMAIL_SUBJECT,
    text: `您的登录验证码是 ${safeCode}，10 分钟内有效。`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.6; color: #1f2937;">
        <h2 style="margin: 0 0 16px;">登录验证码</h2>
        <p style="margin: 0 0 12px;">您的登录验证码是：</p>
        <div style="font-size: 28px; font-weight: 700; letter-spacing: 8px; margin: 0 0 16px;">${safeCode}</div>
        <p style="margin: 0; color: #6b7280;">验证码 10 分钟内有效，请勿泄露给他人。</p>
      </div>
    `,
  });
};

export const deriveLocalSupabasePassword = (
  email: string,
  secret: string,
): string => {
  const digest = crypto
    .createHmac('sha256', secret)
    .update(normalizeEmail(email))
    .digest('hex');
  return `SuixinAI_Local_${digest}`;
};

const buildSupabaseHeaders = (apiKey: string): Record<string, string> => ({
  apikey: apiKey,
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
});

const readSupabaseErrorMessage = (body: SupabaseErrorResponse | null): string => (
  body?.message
  || body?.msg
  || body?.error
  || 'Supabase authentication failed'
);

const isSupabaseAlreadyRegisteredError = (body: SupabaseErrorResponse | null): boolean => {
  const message = readSupabaseErrorMessage(body).toLowerCase();
  return message.includes('already')
    || message.includes('exists')
    || body?.error_code === 'email_exists';
};

const createLocalAuthUser = (
  email: string,
  user: SupabaseAuthUserResponse,
): LocalAuthUser => {
  const normalizedEmail = normalizeEmail(email);
  const metadata = typeof user.user_metadata === 'object' && user.user_metadata
    ? user.user_metadata
    : {};
  const nickname = typeof metadata.nickname === 'string' && metadata.nickname.trim()
    ? metadata.nickname.trim()
    : typeof metadata.name === 'string' && metadata.name.trim()
      ? metadata.name.trim()
      : normalizedEmail.split('@')[0] || normalizedEmail;

  return {
    yid: user.id || normalizedEmail,
    userId: user.id || normalizedEmail,
    nickname,
    avatarUrl: typeof metadata.avatar_url === 'string' && metadata.avatar_url.trim()
      ? metadata.avatar_url.trim()
      : null,
    phone: null,
    email: normalizedEmail,
  };
};

const createLocalSessionFromSupabase = (
  email: string,
  session: SupabaseSessionResponse,
): LocalAuthSession => {
  const expiresAt = typeof session.expires_at === 'number'
    ? session.expires_at * 1000
    : Date.now() + Math.max(60, session.expires_in ?? 3600) * 1000;

  return {
    authMode: AuthMode.LocalSupabase,
    accessToken: session.access_token!,
    refreshToken: session.refresh_token!,
    expiresAt,
    email: normalizeEmail(email),
    user: createLocalAuthUser(email, session.user || {}),
  };
};

const signInWithPassword = async (
  config: LocalAuthSupabaseConfig,
  email: string,
  password: string,
  fetchImpl: FetchLike,
): Promise<LocalAuthSession | null> => {
  const response = await fetchImpl(
    `${config.url.replace(/\/$/, '')}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: buildSupabaseHeaders(config.anonKey),
      body: JSON.stringify({
        email: normalizeEmail(email),
        password,
      }),
    },
  );

  if (!response.ok) {
    return null;
  }

  const body = await safeJson<SupabaseSessionResponse>(response);
  if (!body?.access_token || !body.refresh_token || !body.user) {
    return null;
  }

  return createLocalSessionFromSupabase(email, body);
};

const createSupabaseUser = async (
  config: LocalAuthSupabaseConfig,
  email: string,
  password: string,
  fetchImpl: FetchLike,
): Promise<void> => {
  const normalizedEmail = normalizeEmail(email);
  const response = await fetchImpl(
    `${config.url.replace(/\/$/, '')}/auth/v1/admin/users`,
    {
      method: 'POST',
      headers: buildSupabaseHeaders(config.serviceRoleKey),
      body: JSON.stringify({
        email: normalizedEmail,
        password,
        email_confirm: true,
        user_metadata: {
          nickname: normalizedEmail.split('@')[0] || normalizedEmail,
          source: AuthMode.LocalSupabase,
        },
      }),
    },
  );

  if (response.ok) {
    return;
  }

  const body = await safeJson<SupabaseErrorResponse>(response);
  if (isSupabaseAlreadyRegisteredError(body)) {
    return;
  }

  throw new Error(readSupabaseErrorMessage(body));
};

export const ensureLocalSupabaseSession = async (
  config: LocalAuthSupabaseConfig,
  email: string,
  fetchImpl: FetchLike,
): Promise<LocalAuthSession> => {
  const passwordSeed = config.jwtSecret || config.serviceRoleKey;
  const password = deriveLocalSupabasePassword(email, passwordSeed);

  const existingSession = await signInWithPassword(config, email, password, fetchImpl);
  if (existingSession) {
    return existingSession;
  }

  await createSupabaseUser(config, email, password, fetchImpl);
  const session = await signInWithPassword(config, email, password, fetchImpl);
  if (session) {
    return session;
  }

  throw new Error('Supabase 登录失败');
};

export const refreshLocalSupabaseSession = async (
  config: LocalAuthSupabaseConfig,
  session: LocalAuthSession,
  fetchImpl: FetchLike,
): Promise<LocalAuthSession> => {
  const response = await fetchImpl(
    `${config.url.replace(/\/$/, '')}/auth/v1/token?grant_type=refresh_token`,
    {
      method: 'POST',
      headers: buildSupabaseHeaders(config.anonKey),
      body: JSON.stringify({
        refresh_token: session.refreshToken,
      }),
    },
  );

  if (!response.ok) {
    const body = await safeJson<SupabaseErrorResponse>(response);
    throw new Error(readSupabaseErrorMessage(body));
  }

  const body = await safeJson<SupabaseSessionResponse>(response);
  if (!body?.access_token || !body.refresh_token || !body.user) {
    throw new Error('Supabase refresh payload is invalid');
  }

  return createLocalSessionFromSupabase(session.email, body);
};

export const isLocalSessionExpiringSoon = (
  session: LocalAuthSession,
  now = Date.now(),
): boolean => session.expiresAt <= now + LOCAL_AUTH_DEFAULT_REFRESH_BUFFER_MS;

export const createLocalDevQuota = (planName = '免费'): Record<string, unknown> => ({
  planName,
  subscriptionStatus: AuthSubscriptionStatus.Free,
  creditsLimit: 0,
  creditsUsed: 0,
  creditsRemaining: 0,
  hasPaidCredits: false,
});

export const createLocalDevProfileSummary = (
  user: LocalAuthUser,
): Record<string, unknown> => ({
  id: 0,
  nickname: user.nickname,
  avatarUrl: user.avatarUrl,
  totalCreditsRemaining: 0,
  creditItems: [],
});

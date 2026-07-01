import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, expect, test, vi } from 'vitest';

import { AuthMode } from '../../shared/auth/constants';
import {
  LocalEmailCodeFailureReason,
  LocalEmailCodeStore,
  resolveLocalAuthConfig,
  resolveSmtpEnvelope,
  sendLocalEmailCode,
} from './localAuth';

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

const createProjectRoot = (envContent: string): string => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'suixinai-local-auth-'));
  tempRoots.push(root);
  fs.writeFileSync(path.join(root, '.env.local'), envContent, 'utf8');
  return root;
};

test('resolveLocalAuthConfig enables local_supabase mode when SMTP and Supabase config are complete', () => {
  const projectRoot = createProjectRoot([
    'SUPABASE_URL=https://example.supabase.co',
    'SUPABASE_ANON_KEY=anon-key',
    'SUPABASE_SERVICE_ROLE_KEY=service-role-key',
    'SMTP_URL=smtp.qq.com',
    'SMTP_PORT=465',
    'EMAIL_CODE=mail-pass',
    '',
  ].join('\n'));

  const config = resolveLocalAuthConfig(projectRoot, {});

  expect(config.mode).toBe(AuthMode.LocalSupabase);
  if (config.mode !== AuthMode.LocalSupabase) {
    throw new Error('Expected local_supabase mode');
  }
  expect(config.smtp.host).toBe('smtp.qq.com');
  expect(config.smtp.pass).toBe('mail-pass');
  expect(config.supabase.url).toBe('https://example.supabase.co');
});

test('resolveLocalAuthConfig falls back to remote mode when required local config is missing', () => {
  const projectRoot = createProjectRoot([
    'SUPABASE_URL=https://example.supabase.co',
    'SMTP_URL=smtp.qq.com',
    '',
  ].join('\n'));

  const config = resolveLocalAuthConfig(projectRoot, {});

  expect(config.mode).toBe(AuthMode.Remote);
  if (config.mode !== AuthMode.Remote) {
    throw new Error('Expected remote mode');
  }
  expect(config.missing).toContain('SUPABASE_ANON_KEY');
  expect(config.missing).toContain('SUPABASE_SERVICE_ROLE_KEY');
  expect(config.missing).toContain('SMTP_PORT');
});

test('LocalEmailCodeStore replaces previous codes and rejects expired entries', () => {
  let now = 1_000;
  const store = new LocalEmailCodeStore(() => now);

  const first = store.issue('Dev@Example.com');
  const second = store.issue('dev@example.com');

  expect(first.code).not.toBe(second.code);
  expect(store.verify('DEV@example.com', first.code)).toEqual({
    success: false,
    reason: LocalEmailCodeFailureReason.Invalid,
  });
  expect(store.verify('dev@example.com', second.code)).toEqual({ success: true });

  const expired = store.issue('expired@example.com');
  now = expired.expiresAt + 1;
  expect(store.verify('expired@example.com', expired.code)).toEqual({
    success: false,
    reason: LocalEmailCodeFailureReason.Expired,
  });
});

test('sendLocalEmailCode uses the login email as SMTP identity when SMTP_USER is absent', async () => {
  const sendMail = vi.fn(async () => undefined);

  expect(resolveSmtpEnvelope({
    host: 'smtp.qq.com',
    port: 465,
    secure: true,
    pass: 'secret',
    rejectUnauthorized: true,
  }, 'dev@qq.com')).toEqual({
    user: 'dev@qq.com',
    from: 'dev@qq.com',
  });

  await sendLocalEmailCode({
    config: {
      host: 'smtp.qq.com',
      port: 465,
      secure: true,
      pass: 'secret',
      rejectUnauthorized: true,
    },
    email: 'Dev@qq.com',
    code: '123456',
    transporter: { sendMail },
  });

  expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
    from: 'dev@qq.com',
    to: 'dev@qq.com',
    subject: '登录验证码',
  }));
});

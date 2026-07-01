import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

vi.mock('../common/Modal', () => ({
  default: ({ children }: { children: React.ReactNode }) => React.createElement('div', null, children),
}));

import EmailLoginModal from './EmailLoginModal';

test('renders the email verification login flow without the password login branch', () => {
  const html = renderToStaticMarkup(React.createElement(EmailLoginModal, {
    isOpen: true,
    onClose: vi.fn(),
    authServiceInstance: {
      requestEmailCode: vi.fn(),
      verifyEmailCode: vi.fn(),
    } as any,
  }));

  expect(html).toContain('登录');
  expect(html).toContain('邮箱地址');
  expect(html).toContain('发送验证码');
  expect(html).not.toContain('密码登录');
});

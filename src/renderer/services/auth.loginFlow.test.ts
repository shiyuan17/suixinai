import { afterEach, expect, test, vi } from 'vitest';

const { dispatch, getState } = vi.hoisted(() => ({
  dispatch: vi.fn(),
  getState: vi.fn(() => ({
    auth: {
      isLoggedIn: false,
      user: null,
      quota: null,
    },
  })),
}));

vi.mock('../store', () => ({
  store: {
    dispatch,
    getState,
  },
}));

import {
  AuthLoginErrorMessage,
  AuthService,
} from './auth';

afterEach(() => {
  dispatch.mockReset();
  getState.mockClear();
  delete (globalThis as { window?: unknown }).window;
});

test('login opens a single shared email login dialog and closing it rejects the pending promise', async () => {
  (globalThis as unknown as {
    window: {
      electron: {
        auth: Record<string, unknown>;
        window: Record<string, unknown>;
      };
    };
  }).window = {
    electron: {
      auth: {
        onCallback: () => () => {},
        onQuotaChanged: () => () => {},
        getPendingCallback: vi.fn(),
        requestEmailCode: vi.fn(),
        verifyEmailCode: vi.fn(),
        getModels: vi.fn(),
        getProfileSummary: vi.fn(),
        getQuota: vi.fn(),
      },
      window: {
        onStateChanged: () => () => {},
      },
    },
  };

  const service = new AuthService();
  const states: boolean[] = [];
  const unsubscribe = service.subscribeEmailLoginDialog((state) => {
    states.push(state.isOpen);
  });

  const loginPromise = service.login();
  const duplicateLoginPromise = service.login();
  expect(loginPromise).toBe(duplicateLoginPromise);

  service.closeEmailLoginDialog();

  await expect(loginPromise).rejects.toThrow(AuthLoginErrorMessage.Cancelled);
  expect(states).toEqual([false, true, true, false]);

  unsubscribe();
});

test('verifying the email code resolves the pending login and refreshes the auth state', async () => {
  const verifyEmailCode = vi.fn(async () => ({
    success: true,
    user: { yid: '42', nickname: 'Lobster' },
    quota: {
      planName: '标准',
      subscriptionStatus: 'active',
      creditsLimit: 100,
      creditsUsed: 10,
      creditsRemaining: 90,
      hasPaidCredits: true,
    },
  }));
  const getModels = vi.fn(async () => ({ success: true, models: [] }));
  const getProfileSummary = vi.fn(async () => ({ success: false }));
  const getQuota = vi.fn(async () => ({ success: false }));

  (globalThis as unknown as {
    window: {
      electron: {
        auth: Record<string, unknown>;
        window: Record<string, unknown>;
      };
    };
  }).window = {
    electron: {
      auth: {
        onCallback: () => () => {},
        onQuotaChanged: () => () => {},
        getPendingCallback: vi.fn(),
        requestEmailCode: vi.fn(),
        verifyEmailCode,
        getModels,
        getProfileSummary,
        getQuota,
      },
      window: {
        onStateChanged: () => () => {},
      },
    },
  };

  const service = new AuthService();
  const states: boolean[] = [];
  service.subscribeEmailLoginDialog((state) => {
    states.push(state.isOpen);
  });

  const loginPromise = service.login();
  const verifyResult = await service.verifyEmailCode({
    email: 'user@example.com',
    code: '123456',
  });

  await expect(loginPromise).resolves.toBeUndefined();
  expect(verifyResult).toEqual({ success: true });
  expect(verifyEmailCode).toHaveBeenCalledWith({
    email: 'user@example.com',
    code: '123456',
  });
  expect(getModels).toHaveBeenCalledTimes(1);
  expect(states).toEqual([false, true, false]);
  expect(dispatch).toHaveBeenCalled();
});

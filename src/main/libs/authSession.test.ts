import { expect, test, vi } from 'vitest';

import { completeAuthSession } from './authSession';

test('completes an auth session and reuses the shared quota sync path', () => {
  const saveAuthTokens = vi.fn();
  const saveAuthUser = vi.fn();
  const getPreviousQuotaGateState = vi.fn(() => ({
    subscriptionStatus: 'free',
    mediaGenerationEntitled: false,
  }));
  const normalizeQuota = vi.fn((quota: Record<string, unknown>) => ({
    ...quota,
    planName: '免费',
    subscriptionStatus: 'active',
    creditsLimit: 100,
    creditsUsed: 10,
    creditsRemaining: 90,
    hasPaidCredits: true,
  }));
  const syncOpenClawConfigIfAuthQuotaGateChanged = vi.fn();

  const result = completeAuthSession({
    body: {
      code: 0,
      data: {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        user: { yid: '123' },
        quota: { subscriptionStatus: 'active' },
      },
    },
    getPreviousQuotaGateState,
    normalizeQuota,
    saveAuthTokens,
    saveAuthUser,
    syncOpenClawConfigIfAuthQuotaGateChanged,
  });

  expect(result).toEqual({
    success: true,
    user: { yid: '123' },
    quota: {
      subscriptionStatus: 'active',
      planName: '免费',
      creditsLimit: 100,
      creditsUsed: 10,
      creditsRemaining: 90,
      hasPaidCredits: true,
    },
  });
  expect(saveAuthTokens).toHaveBeenCalledWith('access-token', 'refresh-token');
  expect(saveAuthUser).toHaveBeenCalledWith({ yid: '123' });
  expect(getPreviousQuotaGateState).toHaveBeenCalledTimes(1);
  expect(normalizeQuota).toHaveBeenCalledWith({ subscriptionStatus: 'active' });
  expect(syncOpenClawConfigIfAuthQuotaGateChanged).toHaveBeenCalledWith({
    subscriptionStatus: 'free',
    mediaGenerationEntitled: false,
  });
});

test('returns a validation error when the auth payload is incomplete', () => {
  const result = completeAuthSession({
    body: {
      code: 0,
      message: 'bad payload',
      data: {
        accessToken: 'access-token',
        user: { yid: '123' },
      },
    },
    getPreviousQuotaGateState: () => ({
      subscriptionStatus: 'free',
      mediaGenerationEntitled: false,
    }),
    normalizeQuota: quota => ({
      ...quota,
      planName: '免费',
      subscriptionStatus: 'free',
      creditsLimit: 0,
      creditsUsed: 0,
      creditsRemaining: 0,
      hasPaidCredits: false,
    }),
    saveAuthTokens: vi.fn(),
    saveAuthUser: vi.fn(),
    syncOpenClawConfigIfAuthQuotaGateChanged: vi.fn(),
  });

  expect(result).toEqual({
    success: false,
    error: 'bad payload',
  });
});

import type { AuthQuotaGateState, NormalizedAuthQuota } from '../authQuota';

export interface AuthSessionPayload {
  accessToken: string;
  refreshToken: string;
  user: Record<string, unknown>;
  quota: Record<string, unknown>;
}

export interface AuthSessionResponseBody {
  code: number;
  message?: string;
  data?: Partial<AuthSessionPayload>;
}

export interface CompleteAuthSessionOptions {
  body: AuthSessionResponseBody;
  getPreviousQuotaGateState: () => AuthQuotaGateState;
  normalizeQuota: (raw: Record<string, unknown>) => NormalizedAuthQuota;
  saveAuthTokens: (accessToken: string, refreshToken: string) => void;
  saveAuthUser: (user: Record<string, unknown>) => void;
  syncOpenClawConfigIfAuthQuotaGateChanged: (previous: AuthQuotaGateState) => void;
}

export interface CompleteAuthSessionSuccessResult {
  success: true;
  user: Record<string, unknown>;
  quota: NormalizedAuthQuota;
}

export interface CompleteAuthSessionFailureResult {
  success: false;
  error: string;
}

export type CompleteAuthSessionResult =
  | CompleteAuthSessionSuccessResult
  | CompleteAuthSessionFailureResult;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null
);

export const completeAuthSession = ({
  body,
  getPreviousQuotaGateState,
  normalizeQuota,
  saveAuthTokens,
  saveAuthUser,
  syncOpenClawConfigIfAuthQuotaGateChanged,
}: CompleteAuthSessionOptions): CompleteAuthSessionResult => {
  if (body.code !== 0 || !body.data) {
    return { success: false, error: body.message || 'Authentication failed' };
  }

  const { accessToken, refreshToken, user, quota } = body.data;
  if (
    typeof accessToken !== 'string'
    || typeof refreshToken !== 'string'
    || !isRecord(user)
    || !isRecord(quota)
  ) {
    return { success: false, error: body.message || 'Authentication payload is invalid' };
  }

  saveAuthTokens(accessToken, refreshToken);
  saveAuthUser(user);

  const previousQuotaGateState = getPreviousQuotaGateState();
  const normalizedQuota = normalizeQuota(quota);
  syncOpenClawConfigIfAuthQuotaGateChanged(previousQuotaGateState);

  return {
    success: true,
    user,
    quota: normalizedQuota,
  };
};

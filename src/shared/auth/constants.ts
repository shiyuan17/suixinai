export const AuthIpcChannel = {
  Login: 'auth:login',
  Exchange: 'auth:exchange',
  GetUser: 'auth:getUser',
  GetQuota: 'auth:getQuota',
  GetProfileSummary: 'auth:getProfileSummary',
  Logout: 'auth:logout',
  RefreshToken: 'auth:refreshToken',
  GetAccessToken: 'auth:getAccessToken',
  GetModels: 'auth:getModels',
  Callback: 'auth:callback',
  GetPricingCatalog: 'auth:getPricingCatalog',
  GetPendingCallback: 'auth:getPendingCallback',
  RequestEmailCode: 'auth:requestEmailCode',
  VerifyEmailCode: 'auth:verifyEmailCode',
} as const;

export type AuthIpcChannel = typeof AuthIpcChannel[keyof typeof AuthIpcChannel];

export const AuthMode = {
  LocalSupabase: 'local_supabase',
  Remote: 'remote',
} as const;

export type AuthMode = typeof AuthMode[keyof typeof AuthMode];

export const AuthSubscriptionStatus = {
  Active: 'active',
  Free: 'free',
} as const;

export type AuthSubscriptionStatus = typeof AuthSubscriptionStatus[keyof typeof AuthSubscriptionStatus];

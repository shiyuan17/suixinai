import { AuthSubscriptionStatus } from '@shared/auth/constants';
import { ProviderName } from '@shared/providers';

import { APP_DISPLAY_NAME } from '../constants/app';
import { store } from '../store';
import {
  setAuthLoading,
  setLoggedIn,
  setLoggedOut,
  setProfileSummary,
  updateQuota,
  type UserProfile,
  type UserQuota,
} from '../store/slices/authSlice';
import type { Model } from '../store/slices/modelSlice';
import {
  clearServerModels,
  setServerModels,
} from '../store/slices/modelSlice';

interface AuthStateRefreshResult {
  isLoggedIn: boolean;
  user: UserProfile | null;
  quota: UserQuota | null;
}

export interface EmailLoginDialogState {
  isOpen: boolean;
}

export interface VerifyEmailCodePayload {
  email: string;
  code: string;
}

export interface AuthLoginResult {
  success: boolean;
  error?: string;
}

type EmailLoginDialogListener = (state: EmailLoginDialogState) => void;

const defaultEmailLoginDialogState: EmailLoginDialogState = {
  isOpen: false,
};

export const AuthLoginErrorMessage = {
  Cancelled: 'Login cancelled',
} as const;

export const isAuthLoginCancelledError = (value: unknown): boolean => (
  value instanceof Error && value.message === AuthLoginErrorMessage.Cancelled
);

export interface PricingCatalogTextModel {
  modelId?: string;
  modelName?: string;
  provider?: string;
  providerLabel?: string;
  description?: string;
  supportsImage?: boolean;
  supportsThinking?: boolean;
  contextWindow?: number | null;
  costMultiplier?: number;
}

export interface PricingCatalogResponse {
  textModels?: PricingCatalogTextModel[];
  imageModels?: unknown[];
  videoModels?: unknown[];
}

const readString = (value: unknown): string => (
  typeof value === 'string' ? value.trim() : ''
);

const readPositiveNumber = (value: unknown): number | undefined => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
);

const normalizeBrandDisplay = (value: string): string => (
  value.replace(/LobsterAI/g, APP_DISPLAY_NAME)
);

export function mapPricingCatalogTextModelsToServerModels(
  textModels: PricingCatalogTextModel[],
): Model[] {
  return textModels.flatMap((model): Model[] => {
    const modelId = readString(model.modelId);
    if (!modelId) return [];

    const modelName = readString(model.modelName) || modelId;
    const provider = normalizeBrandDisplay(
      readString(model.providerLabel)
      || readString(model.provider)
      || APP_DISPLAY_NAME,
    );
    const contextWindow = readPositiveNumber(model.contextWindow);
    const costMultiplier = readPositiveNumber(model.costMultiplier);

    return [{
      id: modelId,
      name: modelName,
      provider,
      providerKey: ProviderName.LobsteraiServer,
      isServerModel: true,
      supportsImage: model.supportsImage === true,
      supportsThinking: model.supportsThinking === true,
      description: readString(model.description) || undefined,
      costMultiplier,
      contextWindow,
      accessible: false,
    }];
  });
}

export function mapPricingCatalogToPublicServerModels(
  catalog: PricingCatalogResponse,
): Model[] {
  return mapPricingCatalogTextModelsToServerModels(
    Array.isArray(catalog.textModels) ? catalog.textModels : [],
  );
}

export class AuthService {
  private unsubCallback: (() => void) | null = null;
  private unsubQuotaChanged: (() => void) | null = null;
  private unsubWindowState: (() => void) | null = null;
  private lastRefreshTime = 0;
  private emailLoginDialogState = defaultEmailLoginDialogState;
  private emailLoginDialogListeners = new Set<EmailLoginDialogListener>();
  private pendingLoginPromise: Promise<void> | null = null;
  private resolvePendingLogin: (() => void) | null = null;
  private rejectPendingLogin: ((error: Error) => void) | null = null;

  /**
   * Initialize: try to restore login state from persisted token.
   */
  async init() {
    // Clean up any existing listeners to prevent stacking on repeated init()
    this.destroy();

    store.dispatch(setAuthLoading(true));

    // Listen for OAuth callback from protocol handler
    this.unsubCallback = window.electron.auth.onCallback(async ({ code }) => {
      await this.handleCallback(code);
    });

    try {
      const pendingCode = await window.electron.auth.getPendingCallback();
      let handledPendingCode = false;
      if (pendingCode) {
        handledPendingCode = await this.handleCallback(pendingCode);
      }
      if (!handledPendingCode) {
        await this.refreshAuthState({ clearOnFailure: true });
      }
    } catch {
      store.dispatch(setLoggedOut());
      store.dispatch(clearServerModels());
      await this.loadPublicPricingCatalogModels();
    }

    // Listen for quota changes (e.g. after cowork session using server model)
    this.unsubQuotaChanged = window.electron.auth.onQuotaChanged(() => {
      this.refreshQuota();
      void this.fetchProfileSummary();
      this.loadServerModels();
    });

    // Refresh quota and models when Electron window gains focus — user may have purchased on portal
    this.unsubWindowState = window.electron.window.onStateChanged((state) => {
      if (state.isFocused && store.getState().auth.isLoggedIn) {
        const now = Date.now();
        if (now - this.lastRefreshTime > 30_000) {
          this.lastRefreshTime = now;
          this.refreshQuota();
          void this.fetchProfileSummary();
          this.loadServerModels();
        }
      }
    });
  }

  getEmailLoginDialogState(): EmailLoginDialogState {
    return this.emailLoginDialogState;
  }

  subscribeEmailLoginDialog(listener: EmailLoginDialogListener): () => void {
    this.emailLoginDialogListeners.add(listener);
    listener(this.emailLoginDialogState);
    return () => {
      this.emailLoginDialogListeners.delete(listener);
    };
  }

  /**
   * Initiate login through the in-app email verification modal.
   */
  login(): Promise<void> {
    if (store.getState().auth.isLoggedIn) {
      return Promise.resolve();
    }

    if (!this.pendingLoginPromise) {
      this.pendingLoginPromise = new Promise<void>((resolve, reject) => {
        this.resolvePendingLogin = resolve;
        this.rejectPendingLogin = reject;
      });
    }

    this.setEmailLoginDialogState({ isOpen: true });
    return this.pendingLoginPromise;
  }

  closeEmailLoginDialog() {
    this.setEmailLoginDialogState({ isOpen: false });
    this.rejectLogin(new Error(AuthLoginErrorMessage.Cancelled));
  }

  async requestEmailCode(email: string): Promise<AuthLoginResult> {
    try {
      const result = await window.electron.auth.requestEmailCode(email);
      return result.success
        ? { success: true }
        : { success: false, error: result.error || 'Failed to request email code' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to request email code',
      };
    }
  }

  async verifyEmailCode(payload: VerifyEmailCodePayload): Promise<AuthLoginResult> {
    try {
      const result = await window.electron.auth.verifyEmailCode(payload);
      if (!result.success || !result.user || !result.quota) {
        return {
          success: false,
          error: result.error || 'Failed to verify email code',
        };
      }

      await this.applyAuthSuccess(result.user, result.quota);
      this.setEmailLoginDialogState({ isOpen: false });
      this.resolveLogin();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to verify email code',
      };
    }
  }

  /**
   * Handle OAuth callback with auth code.
   */
  async handleCallback(code: string): Promise<boolean> {
    try {
      const result = await window.electron.auth.exchange(code);
      if (result.success && result.user && result.quota) {
        await this.applyAuthSuccess(result.user, result.quota);
        return true;
      }
    } catch (e) {
      console.error('Auth callback failed:', e);
    }
    return false;
  }

  /**
   * Refresh the full auth snapshot from persisted tokens.
   */
  async refreshAuthState(
    options: { clearOnFailure?: boolean } = {},
  ): Promise<AuthStateRefreshResult> {
    try {
      const result = await window.electron.auth.getUser();
      if (result.success && result.user) {
        await this.applyAuthSuccess(result.user, result.quota ?? null);
        return { isLoggedIn: true, user: result.user, quota: result.quota ?? null };
      }
    } catch {
      // handled below
    }

    if (options.clearOnFailure) {
      store.dispatch(setLoggedOut());
      store.dispatch(clearServerModels());
      await this.loadPublicPricingCatalogModels();
    }

    const current = store.getState().auth;
    return {
      isLoggedIn: current.isLoggedIn,
      user: current.user,
      quota: current.quota,
    };
  }

  /**
   * Logout.
   */
  async logout() {
    await window.electron.auth.logout();
    store.dispatch(setLoggedOut());
    store.dispatch(clearServerModels());
    await this.loadPublicPricingCatalogModels();
  }

  /**
   * Refresh quota information.
   */
  async refreshQuota() {
    try {
      const result = await window.electron.auth.getQuota();
      if (result.success) {
        store.dispatch(updateQuota(result.quota));
      }
    } catch {
      // ignore
    }
  }

  /**
   * Fetch profile summary (credits breakdown).
   */
  async fetchProfileSummary() {
    try {
      const result = await window.electron.auth.getProfileSummary();
      if (result.success && result.data) {
        store.dispatch(setProfileSummary(result.data));
      }
    } catch {
      // ignore
    }
  }

  /**
   * Get current access token (for proxy API calls).
   */
  async getAccessToken(): Promise<string | null> {
    try {
      return await window.electron.auth.getAccessToken();
    } catch {
      return null;
    }
  }

  destroy() {
    this.unsubCallback?.();
    this.unsubCallback = null;
    this.unsubQuotaChanged?.();
    this.unsubQuotaChanged = null;
    this.unsubWindowState?.();
    this.unsubWindowState = null;
  }

  private setEmailLoginDialogState(state: EmailLoginDialogState) {
    this.emailLoginDialogState = state;
    this.emailLoginDialogListeners.forEach(listener => listener(state));
  }

  private resolveLogin() {
    this.resolvePendingLogin?.();
    this.clearPendingLogin();
  }

  private rejectLogin(error: Error) {
    this.rejectPendingLogin?.(error);
    this.clearPendingLogin();
  }

  private clearPendingLogin() {
    this.pendingLoginPromise = null;
    this.resolvePendingLogin = null;
    this.rejectPendingLogin = null;
  }

  private async applyAuthSuccess(user: UserProfile, quota: UserQuota | null) {
    store.dispatch(setLoggedIn({ user, quota: quota ?? {
      planName: '',
      subscriptionStatus: AuthSubscriptionStatus.Free,
      creditsLimit: 0,
      creditsUsed: 0,
      creditsRemaining: 0,
    } }));
    await this.loadServerModels();
    void this.fetchProfileSummary();
    this.refreshQuota();
  }

  /**
   * Load available models from server and dispatch to store.
   */
  private async loadServerModels() {
    try {
      const modelsResult = await window.electron.auth.getModels();
      if (modelsResult.success && modelsResult.models) {
        const serverModels: Model[] = modelsResult.models.map((m: { modelId: string; modelName: string; provider: string; apiFormat: string; supportsImage?: boolean; supportsThinking?: boolean; contextWindow?: number; explicitContextCache?: boolean; costMultiplier?: number; description?: string; accessible?: boolean; restrictionHint?: string }) => ({
          id: m.modelId,
          name: m.modelName,
          provider: m.provider,
          providerKey: 'lobsterai-server',
          isServerModel: true,
          serverApiFormat: m.apiFormat,
          supportsImage: m.supportsImage ?? false,
          supportsThinking: m.supportsThinking ?? false,
          contextWindow: m.contextWindow,
          explicitContextCache: m.explicitContextCache ?? false,
          description: m.description,
          costMultiplier: m.costMultiplier,
          accessible: m.accessible ?? true,
          restrictionHint: m.restrictionHint ?? undefined,
        }));
        store.dispatch(setServerModels(serverModels));
        console.debug(`[Auth] loaded ${serverModels.length} server model(s) into renderer state`);
      } else {
        console.debug('[Auth] server model load returned no models');
      }
    } catch (error) {
      console.warn('[Auth] failed to load server models:', error);
    }
  }

  /**
   * Load public pricing catalog models for unauthenticated read-only display.
   */
  private async loadPublicPricingCatalogModels() {
    try {
      const catalogResult = await window.electron.auth.getPricingCatalog();
      if (!catalogResult.success || !catalogResult.textModels) {
        return;
      }
      const serverModels = mapPricingCatalogToPublicServerModels({
        textModels: catalogResult.textModels,
      });
      store.dispatch(setServerModels(serverModels));
    } catch {
      // ignore — public catalog is optional
    }
  }
}

export const authService = new AuthService();

import { ArtifactBrowserPartition } from '@shared/artifactPreview/constants';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { APP_DISPLAY_NAME } from '../../constants/app';
import { i18nService } from '../../services/i18n';
import {
  BrowserPageUrl,
  type BrowserWebviewElement,
  getBrowserTitleFallback,
  normalizeBrowserUrl,
} from '../../utils/browserUtils';
import ChevronRightIcon from '../icons/ChevronRightIcon';
import ClockIcon from '../icons/ClockIcon';
import EllipsisHorizontalIcon from '../icons/EllipsisHorizontalIcon';
import GlobeAltIcon from '../icons/GlobeAltIcon';
import MagicIcon from '../icons/MagicIcon';
import PlusCircleIcon from '../icons/PlusCircleIcon';
import SearchIcon from '../icons/SearchIcon';
import SidebarAutomationIcon from '../icons/SidebarAutomationIcon';
import TrashIcon from '../icons/TrashIcon';
import XMarkIcon from '../icons/XMarkIcon';

interface AiBrowserTab {
  id: string;
  title: string;
  url: string;
  address: string;
}

interface AiBrowserBookmark {
  id: string;
  title: string;
  url: string;
}

interface AiBrowserPersistedState {
  tabs: AiBrowserTab[];
  activeTabId: string;
  bookmarks: AiBrowserBookmark[];
}

const AI_BROWSER_STORE_KEY = 'aiBrowser.state';
const TAB_TITLE_MAX_LENGTH = 48;
const ASK_AI_EVENT_NAME = 'app:ask-ai';

const t = (key: string) => i18nService.t(key);

const createId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeTitle = (title: string, fallback: string): string => {
  const trimmed = title.trim() || fallback;
  return trimmed.length > TAB_TITLE_MAX_LENGTH
    ? `${trimmed.slice(0, TAB_TITLE_MAX_LENGTH - 1)}...`
    : trimmed;
};

const createBrowserTab = (url = ''): AiBrowserTab => ({
  id: createId('tab'),
  title: url
    ? normalizeTitle(getBrowserTitleFallback(url), t('aiBrowserNewTab'))
    : t('aiBrowserNewTab'),
  url,
  address: url,
});

const createBlankTab = (): AiBrowserTab => createBrowserTab();

const sanitizeTabs = (tabs: unknown): AiBrowserTab[] => {
  if (!Array.isArray(tabs)) return [];
  return tabs
    .filter((tab): tab is Partial<AiBrowserTab> => Boolean(tab) && typeof tab === 'object')
    .map(tab => ({
      id: typeof tab.id === 'string' && tab.id ? tab.id : createId('tab'),
      title: typeof tab.title === 'string' && tab.title ? tab.title : t('aiBrowserNewTab'),
      url: typeof tab.url === 'string' ? tab.url : '',
      address: typeof tab.address === 'string' ? tab.address : typeof tab.url === 'string' ? tab.url : '',
    }));
};

const sanitizeBookmarks = (bookmarks: unknown): AiBrowserBookmark[] => {
  if (!Array.isArray(bookmarks)) return [];
  return bookmarks
    .filter((bookmark): bookmark is Partial<AiBrowserBookmark> =>
      Boolean(bookmark) && typeof bookmark === 'object' && typeof bookmark.url === 'string' && Boolean(bookmark.url),
    )
    .map(bookmark => ({
      id: typeof bookmark.id === 'string' && bookmark.id ? bookmark.id : createId('bookmark'),
      title:
        typeof bookmark.title === 'string' && bookmark.title
          ? bookmark.title
          : getBrowserTitleFallback(bookmark.url ?? ''),
      url: bookmark.url ?? '',
    }));
};

const AiBrowserView: React.FC = () => {
  const [tabs, setTabs] = useState<AiBrowserTab[]>(() => [createBlankTab()]);
  const [activeTabId, setActiveTabId] = useState<string>(() => '');
  const [bookmarks, setBookmarks] = useState<AiBrowserBookmark[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [webviewNode, setWebviewNode] = useState<BrowserWebviewElement | null>(null);
  const [isWebviewReady, setIsWebviewReady] = useState(false);
  const [isAskAiDrawerOpen, setIsAskAiDrawerOpen] = useState(false);
  const hasLoadedPersistedStateRef = useRef(false);
  const lastRequestedUrlRef = useRef('');
  const lastRequestedWebviewRef = useRef<BrowserWebviewElement | null>(null);
  const webviewNodeRef = useRef<BrowserWebviewElement | null>(null);

  const activeTab = useMemo(
    () => tabs.find(tab => tab.id === activeTabId) ?? tabs[0],
    [activeTabId, tabs],
  );
  const activeUrl = activeTab?.url ?? '';
  const activeAddress = activeTab?.address ?? '';

  useEffect(() => {
    let isCurrent = true;

    const loadState = async () => {
      try {
        const persisted = await window.electron.store.get(AI_BROWSER_STORE_KEY);
        if (!isCurrent) return;
        const nextTabs = sanitizeTabs((persisted as AiBrowserPersistedState | null)?.tabs);
        const fallbackTabs = nextTabs.length > 0 ? nextTabs : [createBlankTab()];
        const persistedActiveTabId =
          typeof (persisted as AiBrowserPersistedState | null)?.activeTabId === 'string'
            ? (persisted as AiBrowserPersistedState).activeTabId
            : '';
        setTabs(fallbackTabs);
        setActiveTabId(
          fallbackTabs.some(tab => tab.id === persistedActiveTabId)
            ? persistedActiveTabId
            : fallbackTabs[0].id,
        );
        setBookmarks(sanitizeBookmarks((persisted as AiBrowserPersistedState | null)?.bookmarks));
      } catch (error) {
        console.warn('[AiBrowser] failed to load browser state:', error);
        const blankTab = createBlankTab();
        setTabs([blankTab]);
        setActiveTabId(blankTab.id);
      } finally {
        hasLoadedPersistedStateRef.current = true;
      }
    };

    void loadState();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (!activeTabId && tabs[0]) {
      setActiveTabId(tabs[0].id);
    }
  }, [activeTabId, tabs]);

  useEffect(() => {
    if (!hasLoadedPersistedStateRef.current || !activeTabId) return;
    void window.electron.store
      .set(AI_BROWSER_STORE_KEY, { tabs, activeTabId, bookmarks })
      .catch(error => {
        console.warn('[AiBrowser] failed to save browser state:', error);
      });
  }, [activeTabId, bookmarks, tabs]);

  const updateActiveTab = useCallback((changes: Partial<AiBrowserTab>) => {
    setTabs(currentTabs =>
      currentTabs.map(tab => (tab.id === activeTabId ? { ...tab, ...changes } : tab)),
    );
  }, [activeTabId]);

  const resetWebviewRequestState = useCallback(() => {
    lastRequestedUrlRef.current = '';
    lastRequestedWebviewRef.current = null;
  }, []);

  const openTab = useCallback((url = '') => {
    const nextTab = createBrowserTab(url);
    setTabs(currentTabs => [...currentTabs, nextTab]);
    setActiveTabId(nextTab.id);
    resetWebviewRequestState();
  }, [resetWebviewRequestState]);

  const handleWebviewRef = useCallback((node: BrowserWebviewElement | null) => {
    if (webviewNodeRef.current === node) return;
    webviewNodeRef.current = node;
    lastRequestedUrlRef.current = '';
    lastRequestedWebviewRef.current = null;
    setIsWebviewReady(false);
    setWebviewNode(node);
  }, []);

  const syncNavigationState = useCallback((node: BrowserWebviewElement | null) => {
    if (!node) return;
    setCanGoBack(node.canGoBack?.() ?? false);
    setCanGoForward(node.canGoForward?.() ?? false);
    const nextUrl = node.getURL?.() ?? '';
    if (nextUrl && nextUrl !== BrowserPageUrl.Blank) {
      const title = normalizeTitle(
        node.getTitle?.() ?? '',
        getBrowserTitleFallback(nextUrl) || t('aiBrowserNewTab'),
      );
      updateActiveTab({ url: nextUrl, address: nextUrl, title });
    }
  }, [updateActiveTab]);

  useLayoutEffect(() => {
    if (!webviewNode) return;

    const handleStartLoading = () => setIsLoading(true);
    const handleStopLoading = () => {
      setIsLoading(false);
      syncNavigationState(webviewNode);
    };
    const handleNavigate = (event: Event) => {
      const nextUrl = (event as Event & { url?: string }).url;
      if (nextUrl && nextUrl !== BrowserPageUrl.Blank) {
        updateActiveTab({
          url: nextUrl,
          address: nextUrl,
          title: normalizeTitle(getBrowserTitleFallback(nextUrl), t('aiBrowserNewTab')),
        });
      }
      syncNavigationState(webviewNode);
    };
    const handleFailLoad = (event: Event) => {
      const detail = event as Event & { errorCode?: number };
      setIsLoading(false);
      if (detail.errorCode === -3) return;
      syncNavigationState(webviewNode);
    };
    const handleDomReady = () => {
      setIsWebviewReady(true);
      webviewNode.setZoomFactor?.(1);
      handleStopLoading();
    };
    const handleTitleUpdated = (event: Event) => {
      const title = (event as Event & { title?: string }).title;
      if (!title) return;
      updateActiveTab({
        title: normalizeTitle(title, getBrowserTitleFallback(webviewNode.getURL?.() ?? '') || t('aiBrowserNewTab')),
      });
    };
    const handleNewWindow = (event: Event) => {
      event.preventDefault();
      const nextUrl = (event as Event & { url?: string }).url;
      if (!nextUrl || nextUrl === BrowserPageUrl.Blank) return;
      openTab(nextUrl);
    };

    webviewNode.addEventListener('did-start-loading', handleStartLoading);
    webviewNode.addEventListener('did-stop-loading', handleStopLoading);
    webviewNode.addEventListener('did-fail-load', handleFailLoad);
    webviewNode.addEventListener('did-navigate', handleNavigate);
    webviewNode.addEventListener('did-navigate-in-page', handleNavigate);
    webviewNode.addEventListener('dom-ready', handleDomReady);
    webviewNode.addEventListener('page-title-updated', handleTitleUpdated);
    webviewNode.addEventListener('new-window', handleNewWindow);
    return () => {
      webviewNode.removeEventListener('did-start-loading', handleStartLoading);
      webviewNode.removeEventListener('did-stop-loading', handleStopLoading);
      webviewNode.removeEventListener('did-fail-load', handleFailLoad);
      webviewNode.removeEventListener('did-navigate', handleNavigate);
      webviewNode.removeEventListener('did-navigate-in-page', handleNavigate);
      webviewNode.removeEventListener('dom-ready', handleDomReady);
      webviewNode.removeEventListener('page-title-updated', handleTitleUpdated);
      webviewNode.removeEventListener('new-window', handleNewWindow);
    };
  }, [openTab, syncNavigationState, updateActiveTab, webviewNode]);

  useEffect(() => {
    if (!isWebviewReady || !webviewNode?.loadURL) return;
    const targetUrl = activeUrl || BrowserPageUrl.Blank;
    const loadedUrl = webviewNode.getURL?.() || '';
    const isSamePendingRequest =
      lastRequestedWebviewRef.current === webviewNode && lastRequestedUrlRef.current === targetUrl;
    if (loadedUrl === targetUrl || isSamePendingRequest) return;

    lastRequestedUrlRef.current = targetUrl;
    lastRequestedWebviewRef.current = webviewNode;
    setIsLoading(targetUrl !== BrowserPageUrl.Blank);
    webviewNode.loadURL(targetUrl).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('ERR_ABORTED') || message.includes('(-3)')) return;
      resetWebviewRequestState();
      setIsLoading(false);
    });
  }, [activeUrl, isWebviewReady, resetWebviewRequestState, webviewNode]);

  const handleAddressChange = useCallback((value: string) => {
    updateActiveTab({ address: value });
  }, [updateActiveTab]);

  const handleNavigate = useCallback(() => {
    if (!activeTab) return;
    const nextUrl = normalizeBrowserUrl(activeTab.address);
    if (!nextUrl) return;
    resetWebviewRequestState();
    updateActiveTab({
      url: nextUrl,
      address: nextUrl,
      title: normalizeTitle(getBrowserTitleFallback(nextUrl), t('aiBrowserNewTab')),
    });
  }, [activeTab, resetWebviewRequestState, updateActiveTab]);

  const handleAddressKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') {
        handleNavigate();
      }
    },
    [handleNavigate],
  );

  const handleNewTab = useCallback(() => {
    openTab();
  }, [openTab]);

  const handleCloseTab = useCallback((tabId: string) => {
    setTabs(currentTabs => {
      if (currentTabs.length <= 1) {
        const blankTab = createBlankTab();
        setActiveTabId(blankTab.id);
        return [blankTab];
      }
      const closingIndex = currentTabs.findIndex(tab => tab.id === tabId);
      const nextTabs = currentTabs.filter(tab => tab.id !== tabId);
      if (tabId === activeTabId) {
        const nextActiveTab = nextTabs[Math.max(0, closingIndex - 1)] ?? nextTabs[0];
        setActiveTabId(nextActiveTab.id);
      }
      return nextTabs;
    });
    resetWebviewRequestState();
  }, [activeTabId, resetWebviewRequestState]);

  const handleOpenBookmark = useCallback((bookmark: AiBrowserBookmark) => {
    if (!activeTab) return;
    resetWebviewRequestState();
    updateActiveTab({
      url: bookmark.url,
      address: bookmark.url,
      title: normalizeTitle(bookmark.title, getBrowserTitleFallback(bookmark.url)),
    });
  }, [activeTab, resetWebviewRequestState, updateActiveTab]);

  const handleDeleteBookmark = useCallback((bookmarkId: string) => {
    setBookmarks(currentBookmarks => currentBookmarks.filter(bookmark => bookmark.id !== bookmarkId));
  }, []);

  const getActivePageTitle = useCallback(() => {
    return normalizeTitle(activeTab?.title ?? '', getBrowserTitleFallback(activeUrl) || t('aiBrowserNewTab'));
  }, [activeTab?.title, activeUrl]);

  const handleToggleAskAiDrawer = useCallback(() => {
    if (!activeUrl) return;
    setIsAskAiDrawerOpen(isOpen => !isOpen);
  }, [activeUrl]);

  const handleCloseAskAiDrawer = useCallback(() => {
    setIsAskAiDrawerOpen(false);
  }, []);

  const handleAskAiAction = useCallback((action: 'summarize' | 'automate') => {
    if (!activeUrl) return;
    const title = getActivePageTitle();
    const prompt =
      action === 'summarize'
        ? t('aiBrowserAskAiSummarizePrompt')
            .replace('{title}', title)
            .replace('{url}', activeUrl)
        : t('aiBrowserAskAiAutomationPrompt')
            .replace('{title}', title)
            .replace('{url}', activeUrl);
    setIsAskAiDrawerOpen(false);
    window.dispatchEvent(new CustomEvent(ASK_AI_EVENT_NAME, { detail: prompt }));
  }, [activeUrl, getActivePageTitle]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="draggable flex h-11 shrink-0 items-end gap-1 border-b border-border bg-surface-raised px-2 pt-2">
        <div className="non-draggable flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
          {tabs.map(tab => {
            const isActive = tab.id === activeTab?.id;
            return (
              <div
                key={tab.id}
                role="tab"
                tabIndex={0}
                aria-selected={isActive}
                onClick={() => {
                  setActiveTabId(tab.id);
                  resetWebviewRequestState();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setActiveTabId(tab.id);
                    resetWebviewRequestState();
                  }
                }}
                className={`group flex h-8 min-w-[120px] max-w-[220px] items-center gap-2 rounded-t-lg border px-2 text-left text-xs transition-colors ${
                  isActive
                    ? 'border-border border-b-background bg-background text-foreground'
                    : 'border-transparent bg-transparent text-secondary hover:bg-background/70 hover:text-foreground'
                }`}
                title={tab.title || t('aiBrowserNewTab')}
              >
                <GlobeAltIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{tab.title || t('aiBrowserNewTab')}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleCloseTab(tab.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      handleCloseTab(tab.id);
                    }
                  }}
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted opacity-0 transition-opacity hover:bg-black/[0.06] hover:text-foreground group-hover:opacity-100 dark:hover:bg-white/[0.08]"
                  aria-label={t('aiBrowserCloseTab')}
                  title={t('aiBrowserCloseTab')}
                >
                  <XMarkIcon className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={handleNewTab}
          className="non-draggable mb-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-secondary transition-colors hover:bg-background hover:text-foreground"
          aria-label={t('aiBrowserNewTab')}
          title={t('aiBrowserNewTab')}
        >
          <PlusCircleIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border bg-background px-3">
        <button
          type="button"
          onClick={() => webviewNode?.goBack?.()}
          disabled={!canGoBack}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
          title={t('aiBrowserBack')}
        >
          <ChevronRightIcon className="h-4 w-4 rotate-180" />
        </button>
        <button
          type="button"
          onClick={() => webviewNode?.goForward?.()}
          disabled={!canGoForward}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
          title={t('aiBrowserForward')}
        >
          <ChevronRightIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => (isLoading ? webviewNode?.stop?.() : webviewNode?.reload?.())}
          disabled={!activeUrl}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-secondary transition-colors hover:bg-surface hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
          title={isLoading ? t('aiBrowserStop') : t('aiBrowserReload')}
        >
          {isLoading ? <XMarkIcon className="h-4 w-4" /> : <ClockIcon className="h-4 w-4" />}
        </button>
        <div className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-2 focus-within:border-primary">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input
            type="text"
            value={activeAddress}
            onChange={event => handleAddressChange(event.target.value)}
            onKeyDown={handleAddressKeyDown}
            placeholder={t('aiBrowserAddressPlaceholder')}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
          />
        </div>
        <button
          type="button"
          onClick={handleNavigate}
          disabled={!activeAddress.trim()}
          className="inline-flex h-8 shrink-0 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45"
        >
          {t('aiBrowserGo')}
        </button>
        <button
          type="button"
          onClick={handleToggleAskAiDrawer}
          disabled={!activeUrl}
          className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
            isAskAiDrawerOpen
              ? 'border-primary/40 bg-primary/10 text-primary'
              : 'border-border bg-surface text-foreground hover:bg-surface-raised'
          }`}
          title={activeUrl ? t('aiBrowserAskAi') : t('aiBrowserAskAiUnavailable')}
          aria-label={activeUrl ? t('aiBrowserAskAi') : t('aiBrowserAskAiUnavailable')}
        >
          <MagicIcon className="h-4 w-4" />
          <span className="whitespace-nowrap">{t('aiBrowserAskAi')}</span>
        </button>
      </div>

      <div className="flex h-9 shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-surface-raised px-3">
        <span className="shrink-0 text-xs text-muted">{t('aiBrowserBookmarks')}</span>
        {bookmarks.length === 0 ? (
          <span className="text-xs text-muted">{t('aiBrowserBookmarksEmpty')}</span>
        ) : (
          bookmarks.map(bookmark => (
            <div
              key={bookmark.id}
              className="group flex h-6 max-w-[220px] shrink-0 items-center gap-1 rounded-md border border-border/70 bg-background px-2 text-xs text-secondary transition-colors hover:border-primary/30 hover:text-foreground"
            >
              <button
                type="button"
                onClick={() => handleOpenBookmark(bookmark)}
                className="min-w-0 truncate"
                title={bookmark.url}
              >
                {bookmark.title}
              </button>
              <button
                type="button"
                onClick={() => handleDeleteBookmark(bookmark.id)}
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted opacity-0 transition-opacity hover:bg-black/[0.06] hover:text-foreground group-hover:opacity-100 dark:hover:bg-white/[0.08]"
                title={t('aiBrowserDeleteBookmark')}
                aria-label={t('aiBrowserDeleteBookmark')}
              >
                <TrashIcon className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {activeUrl ? (
          <div className="h-full min-h-0 bg-white">
            {React.createElement('webview', {
              ref: handleWebviewRef,
              src: BrowserPageUrl.Blank,
              partition: ArtifactBrowserPartition.Default,
              className: 'h-full w-full bg-white',
              allowpopups: true,
            })}
          </div>
        ) : (
          <div className="flex h-full min-h-0 items-center justify-center bg-background px-6 py-16 dark:bg-[#1f1f1f]">
            <div className="flex w-full max-w-[760px] -translate-y-12 flex-col items-center">
              <img
                src="logo.png"
                alt={APP_DISPLAY_NAME}
                className="mb-14 h-20 w-20 rounded-[22px] object-contain shadow-sm"
                draggable={false}
              />
              <div className="flex h-16 w-full items-center gap-4 rounded-full border border-border bg-surface px-5 shadow-[0_18px_44px_rgba(0,0,0,0.10)] transition-colors focus-within:border-primary dark:border-white/10 dark:bg-[#282828] dark:shadow-[0_22px_50px_rgba(0,0,0,0.28)]">
                <SearchIcon className="h-6 w-6 shrink-0 text-muted" />
                <input
                  type="text"
                  value={activeAddress}
                  onChange={event => handleAddressChange(event.target.value)}
                  onKeyDown={handleAddressKeyDown}
                  placeholder={t('aiBrowserAddressPlaceholder')}
                  className="min-w-0 flex-1 bg-transparent text-lg text-foreground outline-none placeholder:text-muted"
                />
                <button
                  type="button"
                  onClick={handleNavigate}
                  disabled={!activeAddress.trim()}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-black/[0.04] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/[0.07]"
                  aria-label={t('aiBrowserGo')}
                  title={t('aiBrowserGo')}
                >
                  <SearchIcon className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}
        <aside
          className={`absolute inset-y-0 right-0 z-30 flex w-full max-w-[390px] flex-col border-l border-white/10 bg-[#2f2f2f] text-white shadow-2xl transition-transform duration-200 ease-out ${
            isAskAiDrawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
          aria-hidden={!isAskAiDrawerOpen}
        >
          <div className="flex h-16 shrink-0 items-center justify-between px-5">
            <div
              className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white"
              title={t('aiBrowserAskAi')}
            >
              <MagicIcon className="h-5 w-5" />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={t('aiBrowserAskAiMore')}
                title={t('aiBrowserAskAiMore')}
              >
                <EllipsisHorizontalIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={handleCloseAskAiDrawer}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                aria-label={t('aiBrowserCloseAskAiPanel')}
                title={t('aiBrowserCloseAskAiPanel')}
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className="rounded-3xl border border-white/[0.12] bg-white/[0.03] p-5">
              <div className="mb-5 flex items-center gap-3">
                <MagicIcon className="h-5 w-5 text-white/80" />
                <h2 className="min-w-0 text-lg font-semibold leading-snug text-white">
                  {t('aiBrowserAskAiPanelTitle')}
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => handleAskAiAction('summarize')}
                  className="flex min-h-[116px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-transparent p-4 text-center text-white/90 transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  <MagicIcon className="h-7 w-7 text-primary" />
                  <span className="text-sm font-medium">{t('aiBrowserAskAiSummarize')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAskAiAction('automate')}
                  className="flex min-h-[116px] flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-transparent p-4 text-center text-white/90 transition-colors hover:bg-white/[0.08] hover:text-white"
                >
                  <SidebarAutomationIcon className="h-7 w-7 text-primary" />
                  <span className="text-sm font-medium">{t('aiBrowserAskAiAutomation')}</span>
                </button>
              </div>
            </div>
          </div>
        </aside>
        {isAskAiDrawerOpen && (
          <button
            type="button"
            className="absolute inset-0 z-20 cursor-default bg-black/10"
            onClick={handleCloseAskAiDrawer}
            aria-label={t('aiBrowserCloseAskAiPanel')}
          />
        )}
      </div>
    </div>
  );
};

export default AiBrowserView;

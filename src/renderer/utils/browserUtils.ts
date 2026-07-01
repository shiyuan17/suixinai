export type BrowserWebviewElement = HTMLElement & {
  canGoBack?: () => boolean;
  canGoForward?: () => boolean;
  loadURL?: (url: string) => Promise<void>;
  goBack?: () => void;
  goForward?: () => void;
  reload?: () => void;
  stop?: () => void;
  getTitle?: () => string;
  getURL?: () => string;
  setZoomFactor?: (factor: number) => void;
};

export const BrowserPageUrl = {
  Blank: 'about:blank',
} as const;

const BrowserSearch = {
  Bing: 'https://www.bing.com/search?q=',
} as const;

export function normalizeBrowserUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(https?|file):\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1)(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  if (/^[\w.-]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return `${BrowserSearch.Bing}${encodeURIComponent(trimmed)}`;
}

export function getBrowserTitleFallback(url: string): string {
  if (!url || url === BrowserPageUrl.Blank) return '';
  try {
    const parsed = new URL(url);
    return parsed.hostname || url;
  } catch {
    return url;
  }
}

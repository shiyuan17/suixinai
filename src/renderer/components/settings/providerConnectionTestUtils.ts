type ConnectionTestResponse = {
  status: number;
  statusText: string;
  error?: string;
  data?: unknown;
};

type ConnectionTestStrings = {
  connectionFailed: string;
  saveProxySettingsBeforeTest: string;
  dnsErrorDirectMode: string;
  dnsErrorProxyMode: string;
};

const readNestedString = (value: unknown, key: string): string | undefined => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const nested = (value as Record<string, unknown>)[key];
  return typeof nested === 'string' && nested.trim()
    ? nested.trim()
    : undefined;
};

const extractServerErrorMessage = (data: unknown): string | undefined => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return undefined;
  }

  const errorObj = (data as Record<string, unknown>).error;
  const nestedErrorMessage = readNestedString(errorObj, 'message');
  if (nestedErrorMessage) {
    return nestedErrorMessage;
  }

  return readNestedString(data, 'message');
};

const extractNetworkErrorDetail = (response: ConnectionTestResponse): string | undefined => {
  if (typeof response.error === 'string' && response.error.trim()) {
    return response.error.trim();
  }
  if (typeof response.statusText === 'string' && response.statusText.trim()) {
    return response.statusText.trim();
  }
  return undefined;
};

const isDnsResolutionError = (message: string): boolean => (
  message.toLowerCase().includes('err_name_not_resolved')
);

export const hasPendingSystemProxyChange = (
  savedUseSystemProxy: boolean,
  currentUseSystemProxy: boolean,
): boolean => savedUseSystemProxy !== currentUseSystemProxy;

export const buildPendingProxySettingsMessage = (
  strings: Pick<ConnectionTestStrings, 'saveProxySettingsBeforeTest'>,
): string => strings.saveProxySettingsBeforeTest;

export const resolveConnectionTestErrorMessage = (
  response: ConnectionTestResponse,
  useSystemProxy: boolean,
  strings: Omit<ConnectionTestStrings, 'saveProxySettingsBeforeTest'>,
): string => {
  const serverErrorMessage = extractServerErrorMessage(response.data);
  if (serverErrorMessage) {
    return serverErrorMessage;
  }

  const networkErrorDetail = extractNetworkErrorDetail(response);
  if (response.status === 0) {
    if (networkErrorDetail && isDnsResolutionError(networkErrorDetail)) {
      const hint = useSystemProxy
        ? strings.dnsErrorProxyMode
        : strings.dnsErrorDirectMode;
      return `${networkErrorDetail} ${hint}`;
    }
    if (networkErrorDetail) {
      return networkErrorDetail;
    }
  }

  return `${strings.connectionFailed}: ${response.status}`;
};

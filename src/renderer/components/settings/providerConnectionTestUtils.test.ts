import { expect, test } from 'vitest';

import {
  buildPendingProxySettingsMessage,
  hasPendingSystemProxyChange,
  resolveConnectionTestErrorMessage,
} from './providerConnectionTestUtils';

const strings = {
  connectionFailed: 'Connection failed',
  saveProxySettingsBeforeTest: 'Save settings before testing again.',
  dnsErrorDirectMode: 'Enable and save the system proxy, then try again.',
  dnsErrorProxyMode: 'Check the proxy app or DNS, then try again.',
};

test('resolveConnectionTestErrorMessage prefers transport error details for status 0', () => {
  expect(resolveConnectionTestErrorMessage({
    status: 0,
    statusText: 'Network error',
    error: 'net::ERR_CONNECTION_REFUSED',
    data: null,
  }, false, strings)).toBe('net::ERR_CONNECTION_REFUSED');
});

test('resolveConnectionTestErrorMessage adds direct-mode hint for DNS resolution errors', () => {
  expect(resolveConnectionTestErrorMessage({
    status: 0,
    statusText: 'net::ERR_NAME_NOT_RESOLVED',
    error: 'net::ERR_NAME_NOT_RESOLVED',
    data: null,
  }, false, strings)).toBe(
    'net::ERR_NAME_NOT_RESOLVED Enable and save the system proxy, then try again.',
  );
});

test('resolveConnectionTestErrorMessage keeps upstream HTTP error messages', () => {
  expect(resolveConnectionTestErrorMessage({
    status: 401,
    statusText: 'Unauthorized',
    data: {
      error: {
        message: 'Invalid API key.',
      },
    },
  }, true, strings)).toBe('Invalid API key.');
});

test('hasPendingSystemProxyChange detects unsaved proxy changes', () => {
  expect(hasPendingSystemProxyChange(false, true)).toBe(true);
  expect(hasPendingSystemProxyChange(true, true)).toBe(false);
});

test('buildPendingProxySettingsMessage returns the translated save reminder', () => {
  expect(buildPendingProxySettingsMessage(strings)).toBe('Save settings before testing again.');
});

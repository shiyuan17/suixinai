import { expect, test } from 'vitest';

import {
  clearEmailLoginCodeDigit,
  EMAIL_LOGIN_CODE_LENGTH,
  isValidEmailLoginAddress,
  pasteEmailLoginCodeDigits,
  setEmailLoginCodeDigit,
} from './emailLoginUtils';

test('validates email addresses before requesting a verification code', () => {
  expect(isValidEmailLoginAddress('not-an-email')).toBe(false);
  expect(isValidEmailLoginAddress('user@example.com')).toBe(true);
});

test('auto-advances when entering a verification code digit', () => {
  expect(setEmailLoginCodeDigit('', 0, '5')).toEqual({
    code: '5',
    focusIndex: 1,
  });
});

test('moves backward when clearing an empty verification code slot', () => {
  expect(clearEmailLoginCodeDigit('12', 2)).toEqual({
    code: '1',
    focusIndex: 1,
  });
});

test('fills all six verification slots from paste and clamps focus', () => {
  expect(pasteEmailLoginCodeDigits('', 0, '12a34567')).toEqual({
    code: '123456',
    focusIndex: EMAIL_LOGIN_CODE_LENGTH - 1,
  });
});

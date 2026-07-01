export const EMAIL_LOGIN_CODE_LENGTH = 6;
export const EMAIL_LOGIN_RESEND_SECONDS = 60;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const isValidEmailLoginAddress = (email: string): boolean => (
  EMAIL_PATTERN.test(email.trim())
);

const fillCodeSlot = (chars: string[], startIndex: number, digits: string): string[] => {
  const next = [...chars];
  let targetIndex = startIndex;
  for (const digit of digits) {
    if (targetIndex >= EMAIL_LOGIN_CODE_LENGTH) break;
    next[targetIndex] = digit;
    targetIndex += 1;
  }
  return next;
};

const sanitizeDigits = (value: string): string => value.replace(/\D/g, '');

export const setEmailLoginCodeDigit = (
  currentCode: string,
  index: number,
  rawValue: string,
): { code: string; focusIndex: number } => {
  const digits = sanitizeDigits(rawValue);
  if (!digits) {
    return { code: currentCode, focusIndex: index };
  }

  const chars = currentCode.padEnd(EMAIL_LOGIN_CODE_LENGTH, ' ').split('');
  const nextChars = fillCodeSlot(chars, index, digits);
  const nextCode = nextChars.join('').replace(/\s+$/g, '');
  const consumedCount = Math.min(digits.length, EMAIL_LOGIN_CODE_LENGTH - index);
  const nextFocusIndex = Math.min(index + consumedCount, EMAIL_LOGIN_CODE_LENGTH - 1);

  return {
    code: nextCode,
    focusIndex: nextFocusIndex,
  };
};

export const clearEmailLoginCodeDigit = (
  currentCode: string,
  index: number,
): { code: string; focusIndex: number } => {
  const chars = currentCode.padEnd(EMAIL_LOGIN_CODE_LENGTH, ' ').split('');
  const targetIndex = chars[index]?.trim() ? index : Math.max(0, index - 1);
  chars[targetIndex] = ' ';
  return {
    code: chars.join('').replace(/\s+$/g, ''),
    focusIndex: targetIndex,
  };
};

export const pasteEmailLoginCodeDigits = (
  currentCode: string,
  index: number,
  pastedValue: string,
): { code: string; focusIndex: number } => {
  return setEmailLoginCodeDigit(currentCode, index, pastedValue);
};

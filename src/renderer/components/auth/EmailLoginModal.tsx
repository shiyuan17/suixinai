import { XMarkIcon } from '@heroicons/react/24/outline';
import React, { useEffect, useRef, useState } from 'react';

import Modal from '../common/Modal';
import {
  authService,
  type AuthService,
} from '../../services/auth';
import { i18nService } from '../../services/i18n';
import {
  clearEmailLoginCodeDigit,
  EMAIL_LOGIN_CODE_LENGTH,
  EMAIL_LOGIN_RESEND_SECONDS,
  isValidEmailLoginAddress,
  pasteEmailLoginCodeDigits,
  setEmailLoginCodeDigit,
} from './emailLoginUtils';

const EmailLoginStep = {
  Email: 'email',
  Code: 'code',
} as const;

type EmailLoginStep = typeof EmailLoginStep[keyof typeof EmailLoginStep];

interface EmailLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  authServiceInstance?: AuthService;
}

const EmailLoginModal: React.FC<EmailLoginModalProps> = ({
  isOpen,
  onClose,
  authServiceInstance = authService,
}) => {
  const [step, setStep] = useState<EmailLoginStep>(EmailLoginStep.Email);
  const [email, setEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [lastSubmittedCode, setLastSubmittedCode] = useState('');
  const emailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!isOpen) return;
    setStep(EmailLoginStep.Email);
    setEmail('');
    setVerificationCode('');
    setRequestError(null);
    setVerifyError(null);
    setIsRequestingCode(false);
    setIsVerifyingCode(false);
    setResendAvailableAt(null);
    setLastSubmittedCode('');
    setNow(Date.now());
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (step === EmailLoginStep.Email) {
      emailInputRef.current?.focus();
      return;
    }

    const firstEmptyIndex = Array.from({ length: EMAIL_LOGIN_CODE_LENGTH }, (_, index) => index)
      .find(index => !verificationCode[index]);
    const targetIndex = firstEmptyIndex ?? EMAIL_LOGIN_CODE_LENGTH - 1;
    codeInputRefs.current[targetIndex]?.focus();
  }, [isOpen, step, verificationCode]);

  useEffect(() => {
    if (!resendAvailableAt) return;
    if (resendAvailableAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [resendAvailableAt]);

  useEffect(() => {
    if (step !== EmailLoginStep.Code) return;
    if (verificationCode.length !== EMAIL_LOGIN_CODE_LENGTH) return;
    if (isVerifyingCode || lastSubmittedCode === verificationCode) return;

    setLastSubmittedCode(verificationCode);
    void (async () => {
      setVerifyError(null);
      setIsVerifyingCode(true);
      const result = await authServiceInstance.verifyEmailCode({
        email,
        code: verificationCode,
      });
      if (!result.success) {
        setVerifyError(result.error || i18nService.t('authEmailLoginVerifyFailed'));
        setIsVerifyingCode(false);
      }
    })();
  }, [
    authServiceInstance,
    email,
    isVerifyingCode,
    lastSubmittedCode,
    step,
    verificationCode,
  ]);

  const emailIsValid = isValidEmailLoginAddress(email);
  const secondsRemaining = resendAvailableAt
    ? Math.max(0, Math.ceil((resendAvailableAt - now) / 1000))
    : 0;
  const codeChars = verificationCode.padEnd(EMAIL_LOGIN_CODE_LENGTH, ' ').split('');

  const handleSendCode = async () => {
    if (!emailIsValid || isRequestingCode) {
      if (!emailIsValid) {
        setRequestError(i18nService.t('authEmailLoginInvalidEmail'));
      }
      return;
    }

    setRequestError(null);
    setVerifyError(null);
    setIsRequestingCode(true);
    const result = await authServiceInstance.requestEmailCode(email.trim());
    setIsRequestingCode(false);
    if (!result.success) {
      setRequestError(result.error || i18nService.t('authEmailLoginRequestCodeFailed'));
      return;
    }

    setStep(EmailLoginStep.Code);
    setVerificationCode('');
    setLastSubmittedCode('');
    setNow(Date.now());
    setResendAvailableAt(Date.now() + EMAIL_LOGIN_RESEND_SECONDS * 1000);
  };

  const handleCodeChange = (index: number, value: string) => {
    const next = setEmailLoginCodeDigit(verificationCode, index, value);
    setVerificationCode(next.code);
    setVerifyError(null);
    if (next.code.length < EMAIL_LOGIN_CODE_LENGTH) {
      setIsVerifyingCode(false);
      setLastSubmittedCode('');
    }
    codeInputRefs.current[next.focusIndex]?.focus();
  };

  const handleCodeKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      const next = clearEmailLoginCodeDigit(verificationCode, index);
      setVerificationCode(next.code);
      setVerifyError(null);
      setIsVerifyingCode(false);
      setLastSubmittedCode('');
      codeInputRefs.current[next.focusIndex]?.focus();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      codeInputRefs.current[Math.max(0, index - 1)]?.focus();
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      codeInputRefs.current[Math.min(EMAIL_LOGIN_CODE_LENGTH - 1, index + 1)]?.focus();
    }
  };

  const handleCodePaste = (index: number, event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const next = pasteEmailLoginCodeDigits(
      verificationCode,
      index,
      event.clipboardData.getData('text'),
    );
    setVerificationCode(next.code);
    setVerifyError(null);
    if (next.code.length < EMAIL_LOGIN_CODE_LENGTH) {
      setIsVerifyingCode(false);
      setLastSubmittedCode('');
    }
    codeInputRefs.current[next.focusIndex]?.focus();
  };

  const handleBack = () => {
    setStep(EmailLoginStep.Email);
    setVerificationCode('');
    setVerifyError(null);
    setIsVerifyingCode(false);
    setLastSubmittedCode('');
  };

  const resendText = i18nService
    .t('authEmailLoginResendIn')
    .replace('{seconds}', String(secondsRemaining));
  const codeSentText = i18nService
    .t('authEmailLoginCodeSentTo')
    .replace('{email}', email);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[10060] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm"
      className="w-full max-w-[560px] rounded-[28px] border border-border bg-surface p-6 shadow-modal sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="w-full">
          <h2 className="text-center text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {i18nService.t('authEmailLoginTitle')}
          </h2>
          <p className="mt-4 text-center text-base leading-7 text-secondary sm:text-lg">
            {i18nService.t('authEmailLoginSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mt-1 rounded-full p-2 text-secondary transition-colors hover:bg-surface-raised hover:text-foreground"
          aria-label={i18nService.t('close')}
        >
          <XMarkIcon className="h-6 w-6" />
        </button>
      </div>

      {step === EmailLoginStep.Email ? (
        <div className="mt-8">
          <label className="block text-sm font-medium text-foreground">
            {i18nService.t('authEmailLoginEmailLabel')}
          </label>
          <input
            ref={emailInputRef}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setRequestError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void handleSendCode();
              }
            }}
            placeholder={i18nService.t('emailAddressPlaceholder')}
            className="mt-3 h-14 w-full rounded-2xl border border-border bg-background px-4 text-base text-foreground outline-none transition-colors placeholder:text-secondary/70 focus:border-primary"
          />
          {requestError && (
            <p className="mt-3 text-sm text-red-500">{requestError}</p>
          )}
          <button
            type="button"
            onClick={() => { void handleSendCode(); }}
            disabled={!emailIsValid || isRequestingCode}
            className="mt-6 h-14 w-full rounded-2xl bg-primary px-4 text-lg font-medium text-white transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isRequestingCode
              ? i18nService.t('authEmailLoginSendingCode')
              : i18nService.t('authEmailLoginSendCode')}
          </button>
        </div>
      ) : (
        <div className="mt-8">
          <p className="text-center text-base text-secondary sm:text-lg">
            {codeSentText}
          </p>
          <p className="mt-3 text-center text-sm text-secondary">
            {i18nService.t('authEmailLoginCodeHint')}
          </p>

          <div className="mt-8 flex items-center justify-center gap-2 sm:gap-3">
            {codeChars.map((char, index) => (
              <input
                key={index}
                ref={(node) => {
                  codeInputRefs.current[index] = node;
                }}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? 'one-time-code' : 'off'}
                maxLength={EMAIL_LOGIN_CODE_LENGTH}
                value={char.trim()}
                onChange={(event) => handleCodeChange(index, event.target.value)}
                onKeyDown={(event) => handleCodeKeyDown(index, event)}
                onPaste={(event) => handleCodePaste(index, event)}
                className="h-14 w-11 rounded-2xl border border-border bg-background text-center text-2xl font-semibold text-foreground outline-none transition-colors focus:border-primary sm:h-16 sm:w-14"
              />
            ))}
          </div>

          {verifyError && (
            <p className="mt-4 text-center text-sm text-red-500">{verifyError}</p>
          )}

          <div className="mt-6 text-center text-sm text-secondary">
            {secondsRemaining > 0 ? (
              resendText
            ) : (
              <button
                type="button"
                onClick={() => { void handleSendCode(); }}
                disabled={isRequestingCode}
                className="text-primary transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {i18nService.t('authEmailLoginResend')}
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleBack}
            className="mt-8 h-14 w-full rounded-2xl border border-border bg-background px-4 text-lg font-medium text-foreground transition-colors hover:bg-surface-raised"
          >
            {i18nService.t('authEmailLoginBack')}
          </button>
        </div>
      )}

      <p className="mt-8 text-center text-xs leading-6 text-secondary">
        {i18nService.t('authEmailLoginAgreement')}
      </p>
    </Modal>
  );
};

export default EmailLoginModal;

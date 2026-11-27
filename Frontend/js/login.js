/**
 * Login page: two-step phone + SMS code flow.
 *
 * The markup lives in login.html; this module validates input, talks to the
 * auth API, stores the JWT, and navigates to the groups page. Errors stay
 * inline in the form.
 */

import {
  ApiError,
  requestLoginCode,
  verifyLoginCode,
} from './api.js';
import {
  normalizeOtpCode,
  normalizePhone,
  storeAuthToken,
} from './auth.js';
import { initShell } from './shell.js';

const FA_NUMBER = new Intl.NumberFormat('fa-IR');
const RESEND_COOLDOWN_SECONDS = 60;

const MESSAGES = {
  phoneRequired: 'شمارهٔ موبایل را وارد کنید.',
  phoneInvalid:
    'شمارهٔ موبایل معتبر نیست. آن را با کد کشور وارد کنید؛ نمونه: +989121234567.',
  codeRequired: 'کد ۶ رقمی پیامک‌شده را وارد کنید.',
  codeInvalid: 'کد واردشده نادرست یا منقضی شده است.',
  tooMany: 'تلاش‌های بیش از حد؛ کمی بعد دوباره امتحان کنید.',
  unavailable:
    'سرویس ورود موقتاً در دسترس نیست؛ کمی بعد دوباره امتحان کنید.',
  codeSent: 'کد تأیید ارسال شد. پیامک را بررسی کنید.',
  codeResent: 'کد تازه ارسال شد.',
  generic: 'ورود ممکن نشد. دوباره تلاش کنید.',
};

initShell();
initLogin();

function initLogin() {
  const phoneForm = document.querySelector('[data-phone-form]');
  const codeForm = document.querySelector('[data-code-form]');
  const phoneInput = document.querySelector('#login-phone');
  const codeInput = document.querySelector('#login-code');
  const phoneError = document.querySelector('[data-phone-error]');
  const codeError = document.querySelector('[data-code-error]');
  const phoneStatus = document.querySelector('[data-phone-status]');
  const codeStatus = document.querySelector('[data-code-status]');
  const phoneSubmit = document.querySelector('[data-phone-submit]');
  const codeSubmit = document.querySelector('[data-code-submit]');
  const resendButton = document.querySelector('[data-resend]');
  const changePhoneButton = document.querySelector('[data-change-phone]');
  const phoneDisplay = document.querySelector('[data-phone-display]');
  const phoneIndicator = document.querySelector('[data-step-indicator="phone"]');
  const codeIndicator = document.querySelector('[data-step-indicator="code"]');

  if (
    !phoneForm ||
    !codeForm ||
    !phoneInput ||
    !codeInput ||
    !phoneError ||
    !codeError ||
    !phoneStatus ||
    !codeStatus ||
    !phoneSubmit ||
    !codeSubmit ||
    !resendButton
  ) {
    return;
  }

  let verifiedPhone = '';
  let cooldownTimer = null;
  let cooldownRemaining = 0;
  let phoneBusy = false;
  let verifyBusy = false;
  let resendBusy = false;

  function setFieldError(input, target, message) {
    target.textContent = message;
    if (message) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
  }

  function setStatus(target, message, state = '') {
    target.textContent = message;
    if (state) {
      target.dataset.state = state;
    } else {
      delete target.dataset.state;
    }
  }

  function setBusy(button, busy, busyLabel, idleLabel) {
    button.disabled = busy;
    button.textContent = busy ? busyLabel : idleLabel;
  }

  function stopCooldown() {
    if (cooldownTimer !== null) {
      clearInterval(cooldownTimer);
      cooldownTimer = null;
    }
    cooldownRemaining = 0;
    resendButton.disabled = false;
    resendButton.textContent = 'ارسال دوبارهٔ کد';
  }

  function updateCooldownLabel() {
    resendButton.disabled = true;
    resendButton.textContent = `ارسال دوباره تا ${FA_NUMBER.format(
      cooldownRemaining,
    )} ثانیه`;
  }

  function startCooldown(seconds = RESEND_COOLDOWN_SECONDS) {
    if (cooldownTimer !== null) clearInterval(cooldownTimer);
    cooldownRemaining = seconds;
    updateCooldownLabel();
    cooldownTimer = setInterval(() => {
      cooldownRemaining -= 1;
      if (cooldownRemaining <= 0) {
        stopCooldown();
        return;
      }
      updateCooldownLabel();
    }, 1000);
  }

  function setStep(step) {
    if (step === 'code') {
      phoneForm.hidden = true;
      codeForm.hidden = false;
      phoneIndicator?.removeAttribute('aria-current');
      if (phoneIndicator) phoneIndicator.dataset.complete = 'true';
      codeIndicator?.setAttribute('aria-current', 'step');
      delete codeIndicator?.dataset.complete;
    } else {
      codeForm.hidden = true;
      phoneForm.hidden = false;
      codeIndicator?.removeAttribute('aria-current');
      delete codeIndicator?.dataset.complete;
      phoneIndicator?.setAttribute('aria-current', 'step');
      delete phoneIndicator?.dataset.complete;
    }
  }

  function showPhoneStep() {
    stopCooldown();
    setStep('phone');
    setStatus(codeStatus, '');
    setFieldError(codeInput, codeError, '');
    phoneInput.value = verifiedPhone;
    phoneInput.focus();
  }

  phoneInput.addEventListener('input', () => {
    if (phoneInput.getAttribute('aria-invalid') === 'true') {
      setFieldError(phoneInput, phoneError, '');
    }
  });

  codeInput.addEventListener('input', () => {
    if (codeInput.getAttribute('aria-invalid') === 'true') {
      setFieldError(codeInput, codeError, '');
    }
  });

  phoneForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (phoneBusy) return;

    const raw = phoneInput.value;
    if (!String(raw ?? '').trim()) {
      setFieldError(phoneInput, phoneError, MESSAGES.phoneRequired);
      phoneInput.focus();
      return;
    }

    const phone = normalizePhone(raw);
    if (!phone) {
      setFieldError(phoneInput, phoneError, MESSAGES.phoneInvalid);
      phoneInput.focus();
      return;
    }

    setFieldError(phoneInput, phoneError, '');
    setStatus(phoneStatus, '');
    phoneBusy = true;
    setBusy(phoneSubmit, true, 'در حال ارسال…', 'ارسال کد');

    try {
      await requestLoginCode(phone);
      verifiedPhone = phone;
      if (phoneDisplay) phoneDisplay.textContent = phone;
      setStep('code');
      codeInput.value = '';
      setFieldError(codeInput, codeError, '');
      setStatus(codeStatus, MESSAGES.codeSent, 'success');
      startCooldown();
      codeInput.focus();
    } catch (error) {
      const message = loginErrorMessage(error, MESSAGES.generic);
      if (error instanceof ApiError && error.status === 400) {
        setFieldError(phoneInput, phoneError, message);
      } else {
        setStatus(phoneStatus, message, 'error');
      }
    } finally {
      phoneBusy = false;
      setBusy(phoneSubmit, false, 'در حال ارسال…', 'ارسال کد');
    }
  });

  codeForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (verifyBusy) return;

    const code = normalizeOtpCode(codeInput.value);
    if (!code) {
      setFieldError(codeInput, codeError, MESSAGES.codeRequired);
      codeInput.focus();
      return;
    }

    setFieldError(codeInput, codeError, '');
    setStatus(codeStatus, '');
    verifyBusy = true;
    setBusy(codeSubmit, true, 'در حال بررسی…', 'تأیید و ورود');

    try {
      const result = await verifyLoginCode(verifiedPhone, code);
      storeAuthToken(result?.token);
      window.location.assign(safeNextPage() || 'groups.html');
    } catch (error) {
      const message = loginErrorMessage(error, MESSAGES.generic);
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 400)
      ) {
        setFieldError(codeInput, codeError, message);
      } else {
        setStatus(codeStatus, message, 'error');
      }
    } finally {
      verifyBusy = false;
      setBusy(codeSubmit, false, 'در حال بررسی…', 'تأیید و ورود');
    }
  });

  resendButton.addEventListener('click', async () => {
    if (resendBusy || resendButton.disabled) return;

    resendBusy = true;
    resendButton.disabled = true;
    resendButton.textContent = 'در حال ارسال…';
    setStatus(codeStatus, '');

    try {
      await requestLoginCode(verifiedPhone);
      startCooldown();
      setStatus(codeStatus, MESSAGES.codeResent, 'success');
    } catch (error) {
      setStatus(codeStatus, loginErrorMessage(error, MESSAGES.generic), 'error');
    } finally {
      resendBusy = false;
      if (cooldownTimer === null) {
        resendButton.disabled = false;
        resendButton.textContent = 'ارسال دوبارهٔ کد';
      }
    }
  });

  changePhoneButton?.addEventListener('click', showPhoneStep);
}

/** Map auth failures to Persian inline messages. */
function loginErrorMessage(error, fallback) {
  if (error instanceof ApiError) {
    if (error.status === 429) return MESSAGES.tooMany;
    if (error.status >= 500) return MESSAGES.unavailable;
    if (error.status === 401) return MESSAGES.codeInvalid;
    if (error.status === 400) return MESSAGES.phoneInvalid;
    if (error.status === 0 && error.message) return error.message;
  }

  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/** Only accept a same-origin groups/group URL supplied by the auth guard. */
function safeNextPage() {
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next) return '';

  try {
    const url = new URL(next, window.location.href);
    if (url.origin !== window.location.origin) return '';
    const file = url.pathname.split('/').pop();
    if (file !== 'groups.html' && file !== 'group.html') return '';
    return `${file}${url.search}`;
  } catch {
    return '';
  }
}

/**
 * Authentication state and phone/code helpers.
 *
 * The PWA is passwordless: the API returns a signed JWT after a successful SMS
 * code verification. Only that token is persisted (never the phone number, the
 * OTP, or the token in logs). Storage access is wrapped because browsers can
 * throw in private mode; the in-memory copy keeps the session usable while the
 * tab stays open even when `localStorage` is unavailable.
 */

export const AUTH_TOKEN_STORAGE_KEY = 'dongi.auth.token';

let memoryToken = null;

function readStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Return the persisted bearer token, or `null` when signed out. */
export function getAuthToken() {
  const storage = readStorage();
  if (storage) {
    try {
      const stored = storage.getItem(AUTH_TOKEN_STORAGE_KEY);
      if (typeof stored === 'string' && stored.trim()) {
        memoryToken = stored.trim();
      } else if (stored === null) {
        // The token was removed in another tab; mirror that here.
        memoryToken = null;
      }
    } catch {
      /* Fall back to the in-memory token. */
    }
  }

  return memoryToken;
}

/**
 * Persist the JWT. Throws on an empty token so a malformed API response cannot
 * silently sign the user in.
 */
export function storeAuthToken(token) {
  const normalized = typeof token === 'string' ? token.trim() : '';
  if (!normalized) {
    throw new Error('پاسخ سرور توکن معتبری نداشت.');
  }

  memoryToken = normalized;
  const storage = readStorage();
  if (storage) {
    try {
      storage.setItem(AUTH_TOKEN_STORAGE_KEY, normalized);
    } catch {
      /* Storage may be full or blocked; the in-memory token still works. */
    }
  }

  return normalized;
}

/** Forget the session token in memory and in `localStorage`. */
export function clearAuthToken() {
  memoryToken = null;
  const storage = readStorage();
  if (!storage) return;

  try {
    storage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    /* Storage may be blocked; there is nothing else to clear. */
  }
}

/** True when a bearer token is available. */
export function isAuthenticated() {
  return Boolean(getAuthToken());
}

/**
 * Read the signed-in user's id from the JWT `sub` claim.
 *
 * This is only used for presentation (marking "you" in a member list or as an
 * expense payer); the API still authorizes every request. Returns `null` when
 * there is no token or it cannot be decoded.
 */
export function getAuthUserId() {
  const token = getAuthToken();
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  const subject = payload?.sub;
  return typeof subject === 'string' && subject.trim() ? subject.trim() : null;
}

function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;

    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );

    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** Convert Persian and Arabic-Indic digits to ASCII so the API accepts them. */
function toAsciiDigits(value) {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(digit);
    if (persianIndex >= 0) return String(persianIndex);
    return String(ARABIC_DIGITS.indexOf(digit));
  });
}

/**
 * Normalize a phone number to the strict E.164 form the API expects
 * (`+` followed by 8-15 digits). Formatting characters are ignored and a
 * leading `00` is treated as `+`. Returns an empty string when the input is not
 * a valid international number, so callers can show a field error without
 * calling the API.
 */
export function normalizePhone(raw) {
  const trimmed = toAsciiDigits(String(raw ?? '')).trim();
  if (!trimmed) return '';

  const candidate = trimmed.startsWith('00')
    ? `+${trimmed.slice(2)}`
    : trimmed;

  let cleaned = '';
  for (const character of candidate) {
    if (character >= '0' && character <= '9') {
      cleaned += character;
    } else if (character === '+' && cleaned.length === 0) {
      cleaned += character;
    } else if (
      character === ' ' ||
      character === '-' ||
      character === '(' ||
      character === ')' ||
      character === '.'
    ) {
      /* Formatting characters are ignored. */
    } else {
      return '';
    }
  }

  return /^\+[1-9]\d{7,14}$/.test(cleaned) ? cleaned : '';
}

/** Normalize a six-digit SMS code, converting Persian/Arabic digits. */
export function normalizeOtpCode(raw) {
  const digits = toAsciiDigits(String(raw ?? ''))
    .replace(/[\s-]/g, '')
    .trim();
  return /^\d{6}$/.test(digits) ? digits : '';
}

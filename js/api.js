/**
 * Thin `fetch` wrapper for the Dongi API.
 *
 * The base URL and timeout are read from `window.DONGI_CONFIG` (see
 * `config.js`) at call time, so a deployment can change them without touching
 * application code. All non-2xx responses become `ApiError` instances with the
 * HTTP status and parsed payload attached. Messages are Persian (fa), matching
 * the rest of the UI.
 */

const DEFAULT_API_BASE_URL = 'http://localhost:5080';
const DEFAULT_TIMEOUT_MS = 8000;
const FA_NUMBER = new Intl.NumberFormat('fa-IR');

/** Error thrown for network failures, timeouts, and non-2xx API responses. */
export class ApiError extends Error {
  constructor(message, { status = 0, payload = null, url = '', cause } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.url = url;
  }
}

/** Resolved API settings, with defaults applied. */
export function getApiConfig() {
  const provided =
    (typeof window !== 'undefined' && window.DONGI_CONFIG) || {};
  const rawBase =
    typeof provided.apiBaseUrl === 'string' ? provided.apiBaseUrl.trim() : '';
  const timeout = Number(provided.requestTimeoutMs);

  return {
    apiBaseUrl: (rawBase || DEFAULT_API_BASE_URL).replace(/\/+$/, ''),
    requestTimeoutMs:
      Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_TIMEOUT_MS,
  };
}

/**
 * Build an absolute request URL for an API path.
 * @param {string} path e.g. `/health`
 * @param {Record<string, unknown>} [query]
 */
export function buildUrl(path, query) {
  const { apiBaseUrl } = getApiConfig();
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${apiBaseUrl}${suffix}`);

  if (query && typeof query === 'object') {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url;
}

/**
 * Perform an API request and resolve with the parsed response body.
 *
 * @param {string} path
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {HeadersInit} [options.headers]
 * @param {unknown} [options.body] Plain objects are JSON encoded.
 * @param {Record<string, unknown>} [options.query]
 * @param {AbortSignal} [options.signal]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<any>}
 */
export async function request(path, options = {}) {
  const {
    method = 'GET',
    headers,
    body,
    query,
    signal,
    timeoutMs,
  } = options;

  const config = getApiConfig();
  const url = buildUrl(path, query);
  const controller = new AbortController();
  const effectiveTimeout =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : config.requestTimeoutMs;

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, effectiveTimeout);

  const requestHeaders = new Headers({ Accept: 'application/json' });
  if (headers) {
    new Headers(headers).forEach((value, key) => {
      requestHeaders.set(key, value);
    });
  }

  let payload = body;
  const isRawBody =
    body === undefined ||
    body === null ||
    typeof body === 'string' ||
    (typeof FormData !== 'undefined' && body instanceof FormData) ||
    (typeof Blob !== 'undefined' && body instanceof Blob);
  if (!isRawBody) {
    payload = JSON.stringify(body);
    if (!requestHeaders.has('Content-Type')) {
      requestHeaders.set('Content-Type', 'application/json');
    }
  }

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: payload,
      signal: combineSignals(signal, controller.signal),
      credentials: 'omit',
      cache: 'no-store',
    });

    const data = await parseResponse(response);

    if (!response.ok) {
      throw new ApiError(errorMessage(response, data), {
        status: response.status,
        payload: data,
        url: url.toString(),
      });
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    if (timedOut) {
      throw new ApiError(
        `API دنگی در ${FA_NUMBER.format(
          Math.round(effectiveTimeout / 1000),
        )} ثانیه پاسخ نداد.`,
        { url: url.toString(), cause: error },
      );
    }

    if (error && error.name === 'AbortError') {
      throw new ApiError('درخواست لغو شد.', {
        url: url.toString(),
        cause: error,
      });
    }

    throw new ApiError(
      `دسترسی به API دنگی در ${config.apiBaseUrl} ممکن نشد. آیا بک‌اند در حال اجراست؟`,
      { url: url.toString(), cause: error },
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Liveness probe exposed by the backend scaffold (issue #1).
 * @param {object} [options]
 */
export function getHealth(options = {}) {
  return request('/health', { ...options, method: 'GET' });
}

async function parseResponse(response) {
  if (response.status === 204 || response.status === 205) return null;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  const text = await response.text();
  return text || null;
}

function errorMessage(response, data) {
  if (data && typeof data === 'object') {
    const candidate = data.detail || data.title || data.message || data.error;
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  if (typeof data === 'string' && data.trim()) return data.trim();
  return `درخواست به API دنگی با وضعیت ${FA_NUMBER.format(response.status)} شکست خورد.`;
}

function combineSignals(external, internal) {
  if (!external) return internal;

  if (
    typeof AbortSignal !== 'undefined' &&
    typeof AbortSignal.any === 'function'
  ) {
    return AbortSignal.any([external, internal]);
  }

  if (external.aborted) {
    internal.abort(external.reason);
    return internal;
  }

  external.addEventListener('abort', () => internal.abort(external.reason), {
    once: true,
  });
  return internal;
}

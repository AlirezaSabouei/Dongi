/**
 * Reusable expense rendering.
 *
 * The group page renders the lean expense list returned by
 * `GET /groups/{id}/expenses`; the future expense-detail view (issue #11) can
 * reuse `renderExpenseList`/`createExpenseItem` to keep amounts, dates, and
 * payer labels consistent. Everything is built with DOM APIs and `textContent`,
 * so API data is never interpreted as HTML.
 */

const FA_NUMBER = new Intl.NumberFormat('fa-IR');
const DEFAULT_TITLE = 'هزینهٔ بدون عنوان';

/**
 * Replace a container's children with expense rows.
 *
 * @param {Element | null} container
 * @param {unknown} expenses API payload (array, or `{ expenses|items: [] }`).
 * @param {object} [options] Passed through to `createExpenseItem`.
 * @returns {number} Number of rendered rows.
 */
export function renderExpenseList(container, expenses, options = {}) {
  if (!container) return 0;

  const items = toExpenseArray(expenses);
  container.replaceChildren(
    ...items.map((expense) => createExpenseItem(expense, options)),
  );

  return items.length;
}

/**
 * Build one `<li class="expense-item">` for an expense.
 *
 * @param {object} expense
 * @param {object} [options]
 * @param {(expense: object) => string} [options.payerLabel] Resolve a payer
 *   display label (for example the member's name or "شما").
 * @param {(expense: object) => string} [options.dateLabel] Override the date.
 */
export function createExpenseItem(expense, options = {}) {
  const item = document.createElement('li');
  item.className = 'expense-item';

  const id = expense?.id;
  if (id !== undefined && id !== null && String(id)) {
    item.dataset.expenseId = String(id);
  }

  const titleText = textOr(expense?.title, DEFAULT_TITLE);
  const amount = toAmount(expense?.amount);

  const avatar = document.createElement('span');
  avatar.className = 'avatar avatar-sm';
  avatar.setAttribute('aria-hidden', 'true');
  avatar.textContent = initialsFor(titleText) || 'خ';

  const text = document.createElement('span');
  text.className = 'expense-text';

  const title = document.createElement('span');
  title.className = 'expense-title';
  title.textContent = titleText;

  const payer = resolvePayerLabel(expense, options);
  const date = resolveDateLabel(expense, options);
  const metaParts = [];
  if (payer) metaParts.push(`پرداخت‌کننده: ${payer}`);
  if (date) metaParts.push(date);

  const meta = document.createElement('span');
  meta.className = 'expense-meta';
  meta.textContent = metaParts.join(' · ');
  meta.hidden = metaParts.length === 0;

  text.append(title, meta);

  const amountElement = document.createElement('span');
  amountElement.className = 'expense-amount';

  if (amount === null) {
    amountElement.textContent = '—';
  } else {
    amountElement.append(
      document.createTextNode(FA_NUMBER.format(amount)),
      document.createTextNode(' '),
    );

    const unit = document.createElement('small');
    unit.textContent = 'ریال';
    amountElement.append(unit);
  }

  item.append(avatar, text, amountElement);
  return item;
}

/**
 * Format an amount for a summary, e.g. `۱۲٬۰۰۰ ریال`.
 * @param {unknown} value
 */
export function formatExpenseAmount(value) {
  const amount = toAmount(value);
  return amount === null ? '—' : `${FA_NUMBER.format(amount)} ریال`;
}

/**
 * Sum valid positive integer amounts. Invalid entries are ignored.
 * @param {unknown} expenses
 * @returns {number | null} `null` when there are no readable amounts.
 */
export function sumExpenseAmounts(expenses) {
  const items = toExpenseArray(expenses);
  let total = 0;
  let found = false;

  for (const item of items) {
    const amount = toAmount(item?.amount);
    if (amount === null) continue;
    total += amount;
    found = true;
  }

  return found ? total : null;
}

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const THOUSANDS_SEPARATORS = /[\s,٬،]/g;

/**
 * Parse a Rial amount typed by the user.
 *
 * The API stores amounts as integer Rials, so only whole positive numbers are
 * accepted. Persian/Arabic-Indic digits are converted and common thousands
 * separators are ignored, which lets people type `۳٬۰۰۰` or `3,000`.
 *
 * @param {unknown} raw
 * @returns {number | null} `null` for empty, zero, negative, fractional, or
 *   out-of-range input.
 */
export function parseRialAmount(raw) {
  if (typeof raw === 'number') {
    return Number.isSafeInteger(raw) && raw > 0 ? raw : null;
  }

  const ascii = String(raw ?? '').replace(/[۰-۹٠-٩]/g, (digit) => {
    const persianIndex = PERSIAN_DIGITS.indexOf(digit);
    if (persianIndex >= 0) return String(persianIndex);
    return String(ARABIC_DIGITS.indexOf(digit));
  });

  const cleaned = ascii.replace(THOUSANDS_SEPARATORS, '');
  if (!/^\d+$/.test(cleaned)) return null;

  const amount = Number(cleaned);
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

/**
 * De-duplicate, trim, and sort member ids for a split.
 *
 * Sorting makes the request order — and therefore the remainder allocation —
 * stable regardless of the order members were rendered in.
 *
 * @param {unknown} memberIds
 * @returns {string[]}
 */
export function normalizeMemberIds(memberIds) {
  if (!Array.isArray(memberIds)) return [];

  const ids = new Set();
  for (const entry of memberIds) {
    const id =
      typeof entry === 'string' ? entry.trim() : String(entry ?? '').trim();
    if (id) ids.add(id);
  }

  return Array.from(ids).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Split an integer Rial amount equally across the given members.
 *
 * This mirrors the backend's equal-split remainder rule exactly:
 *
 *   1. `base = Math.floor(amount / memberCount)`
 *   2. `remainder = amount - base * memberCount` (`0 <= remainder < count`)
 *   3. the `remainder` extra Rials are handed out one at a time, in order, to
 *      the first `remainder` entries of the normalized `memberIds` list.
 *
 * The form sends member ids in the same normalized (sorted) order, so the
 * preview and the server assign the extra Rial to the same people, and the
 * shares always add back up to `amount` — the 1-Rial rounding difference is
 * never dropped.
 *
 * @param {unknown} amount
 * @param {unknown} memberIds
 * @returns {Array<{ memberId: string, share: number }> | null} `null` when the
 *   amount or member list is unusable.
 */
export function calculateEqualSplit(amount, memberIds) {
  const total = parseRialAmount(amount);
  const ids = normalizeMemberIds(memberIds);
  if (total === null || ids.length === 0) return null;

  const base = Math.floor(total / ids.length);
  const remainder = total - base * ids.length;

  return ids.map((memberId, index) => ({
    memberId,
    share: base + (index < remainder ? 1 : 0),
  }));
}

/**
 * Normalize an expense-list payload to an array.
 * @param {unknown} data
 * @returns {object[]}
 */
export function toExpenseArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.expenses)) return data.expenses;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

function resolvePayerLabel(expense, options) {
  if (typeof options?.payerLabel === 'function') {
    try {
      const label = options.payerLabel(expense);
      if (typeof label === 'string' && label.trim()) return label.trim();
    } catch {
      /* Fall back to the raw id. */
    }
  }

  const payerId = expense?.payerId;
  return typeof payerId === 'string' && payerId.trim()
    ? shortId(payerId.trim())
    : '';
}

function resolveDateLabel(expense, options) {
  if (typeof options?.dateLabel === 'function') {
    try {
      const label = options.dateLabel(expense);
      if (typeof label === 'string') return label.trim();
    } catch {
      /* Fall back to createdAt. */
    }
  }

  return formatExpenseDate(expense?.createdAt);
}

/** Format an ISO timestamp as a Persian medium date; empty when invalid. */
export function formatExpenseDate(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  try {
    return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'medium' }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function toAmount(value) {
  if (value === null || value === undefined || value === '') return null;

  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;

  return Math.round(amount);
}

function textOr(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function initialsFor(text) {
  return Array.from(String(text ?? '').trim()).slice(0, 2).join('').toUpperCase();
}

function shortId(value) {
  return value.length <= 6 ? value.toUpperCase() : value.slice(-6).toUpperCase();
}

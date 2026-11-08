/**
 * Placeholder views for the Epic 0 frontend scaffold.
 *
 * All user-facing copy is Persian (fa) and the layout runs right-to-left.
 * These render static markup only; real data (auth, groups, expenses) arrives
 * in later epics. `#/groups/:id` already demonstrates router params and deep
 * links.
 */

import { getHealth } from './api.js';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) => HTML_ESCAPES[character],
  );
}

const PLACEHOLDER_GROUPS = [
  {
    id: 'household',
    name: 'خانه',
    emoji: '🏠',
    meta: '۴ عضو · امروز به‌روز شد',
  },
  {
    id: 'trip-yazd',
    name: 'سفر یزد',
    emoji: '🧭',
    meta: '۶ عضو · تسویه‌شده',
  },
  {
    id: 'book-club',
    name: 'باشگاه کتاب',
    emoji: '📚',
    meta: '۳ عضو · ۲ هزینه',
  },
];

const HEALTH_LABELS = {
  healthy: 'سالم',
  degraded: 'ناپایدار',
  unhealthy: 'ناسالم',
};

/** Translate the API health status, falling back to the raw value. */
function healthLabel(status) {
  const key = String(status ?? '').trim().toLowerCase();
  return HEALTH_LABELS[key] ?? String(status ?? '');
}

function formatTime(date) {
  try {
    return date.toLocaleTimeString('fa-IR');
  } catch {
    return date.toLocaleTimeString();
  }
}

export function renderLogin() {
  return `
    <section class="view view-login" aria-labelledby="login-title">
      <div class="hero-copy">
        <p class="eyebrow">خرج‌های مشترک، بدون جدول اکسل</p>
        <h1 id="login-title">به دنگی خوش آمدید</h1>
        <p class="lede">
          اجاره، خرید خانه و سفرها را با کسانی که در آن‌ها شریک هستید تقسیم کنید.
          این نسخهٔ اسکلت <strong>اپیک ۰</strong> است؛ ورود با شمارهٔ موبایل تا
          رسیدن مرحلهٔ احراز هویت، جای‌نگهدار است.
        </p>
      </div>

      <div class="panel-grid">
        <form class="card auth-card" data-login-form novalidate>
          <h2>ورود با شمارهٔ موبایل</h2>
          <label class="field">
            <span>شمارهٔ موبایل</span>
            <input
              type="tel"
              name="phone"
              dir="ltr"
              inputmode="tel"
              autocomplete="tel"
              placeholder="+۹۸ ۹۱۲ ۰۰۰ ۰۰۰۰"
              aria-describedby="phone-hint"
            />
          </label>
          <p id="phone-hint" class="field-hint">
            یک کد یک‌بارمصرف برایتان پیامک می‌کنیم. در این اسکلت هنوز چیزی ارسال
            نمی‌شود.
          </p>
          <button type="submit" class="button button-primary">ارسال کد</button>
          <p class="form-status" data-login-status role="status" aria-live="polite"></p>
        </form>

        <aside class="card preview-card" aria-labelledby="preview-title">
          <h2 id="preview-title">مسیرهای نمونه را امتحان کنید</h2>
          <p>مسیریابی بر پایهٔ هش است، بنابراین هر پیوند مستقیم بعد از بازخوانی هم کار می‌کند.</p>
          <ul class="route-list">
            <li><a href="#/groups"><code>#/groups</code> — فهرست گروه‌ها</a></li>
            <li><a href="#/groups/123"><code>#/groups/123</code> — جزئیات گروه</a></li>
            <li><a href="#/nope"><code>#/nope</code> — نمای پیدا نشد</a></li>
          </ul>
        </aside>
      </div>
    </section>`;
}

export function mountLogin({ outlet }) {
  const form = outlet.querySelector('[data-login-form]');
  const status = outlet.querySelector('[data-login-status]');
  if (!form || !status) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const phone = form.elements.phone?.value?.trim();
    status.dataset.state = 'info';
    status.textContent = phone
      ? `ورود با شمارهٔ ${phone} هنوز وصل نشده است — در مرحلهٔ بعدی اضافه می‌شود.`
      : 'برای ادامه یک شمارهٔ موبایل وارد کنید (فقط جای‌نگهدار).';
  });
}

export function renderGroups() {
  const groupCards = PLACEHOLDER_GROUPS.map(
    (group) => `
      <li>
        <a class="group-card" href="#/groups/${encodeURIComponent(group.id)}">
          <span class="avatar" aria-hidden="true">${group.emoji}</span>
          <span class="group-card-text">
            <span class="group-card-name">${escapeHtml(group.name)}</span>
            <span class="group-card-meta">${escapeHtml(group.meta)}</span>
          </span>
          <span class="chevron" aria-hidden="true">‹</span>
        </a>
      </li>`,
  ).join('');

  return `
    <section class="view" aria-labelledby="groups-title">
      <header class="view-header">
        <div>
          <p class="eyebrow">فضاهای شما</p>
          <h1 id="groups-title">گروه‌ها</h1>
          <p class="lede">
            هر خرج مشترک درون یک گروه ثبت می‌شود. این کارت‌ها دادهٔ نمونه‌اند تا
            API گروه‌ها آماده شود.
          </p>
        </div>
        <button type="button" class="button button-primary" disabled title="ساخت گروه هنوز پیاده‌سازی نشده است">
          گروه جدید
        </button>
      </header>

      <ul class="group-list" aria-label="گروه‌های نمونه">
        ${groupCards}
      </ul>

      <section class="card api-card" aria-labelledby="api-check-title">
        <div>
          <h2 id="api-check-title">اتصال به بک‌اند</h2>
          <p class="muted">
            این بررسی سلامت از <code>js/api.js</code> و نشانی پایهٔ
            <code>js/config.js</code> استفاده می‌کند.
          </p>
        </div>
        <div class="api-card-actions">
          <button type="button" class="button button-secondary" data-check-api>
            بررسی API
          </button>
          <p class="api-result" data-api-result role="status" aria-live="polite">
            هنوز بررسی نشده است.
          </p>
        </div>
      </section>
    </section>`;
}

export function mountGroups({ outlet }) {
  const button = outlet.querySelector('[data-check-api]');
  const result = outlet.querySelector('[data-api-result]');
  if (!button || !result) return;

  button.addEventListener('click', async () => {
    button.disabled = true;
    result.dataset.state = 'pending';
    result.textContent = 'در حال بررسی…';

    try {
      const health = await getHealth();
      const status = healthLabel(health?.status || 'Healthy');
      const timestamp = health?.timestampUtc
        ? new Date(health.timestampUtc)
        : null;
      const time =
        timestamp && !Number.isNaN(timestamp.getTime())
          ? ` · ${formatTime(timestamp)}`
          : '';

      result.dataset.state = 'ok';
      result.textContent = `API ${status}${time}`;
    } catch (error) {
      result.dataset.state = 'error';
      result.textContent =
        error instanceof Error ? error.message : 'ارتباط با API ممکن نشد.';
    } finally {
      button.disabled = false;
    }
  });
}

export function renderGroup({ params }) {
  const id = params.id ?? '';
  const initials = id.trim().slice(0, 2).toUpperCase() || 'گ';

  return `
    <section class="view" aria-labelledby="group-title">
      <a class="back-link" href="#/groups">→ همهٔ گروه‌ها</a>

      <header class="view-header group-header">
        <span class="avatar avatar-lg" aria-hidden="true">${escapeHtml(initials)}</span>
        <div>
          <p class="eyebrow">گروه</p>
          <h1 id="group-title">گروه <span class="mono">${escapeHtml(id)}</span></h1>
          <p class="lede">
            نمای جای‌نگهدار برای <code>#/groups/${escapeHtml(id)}</code>.
            اعضا، هزینه‌ها و مانده‌ها پس از آماده شدن API گروه‌ها اینجا بارگذاری
            می‌شوند.
          </p>
        </div>
      </header>

      <div class="stat-grid">
        <div class="stat-card">
          <span class="stat-label">اعضا</span>
          <span class="stat-value">—</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">هزینه‌ها</span>
          <span class="stat-value">—</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">ماندهٔ شما</span>
          <span class="stat-value">—</span>
        </div>
      </div>

      <section class="card" aria-labelledby="expenses-title">
        <h2 id="expenses-title">هزینه‌ها</h2>
        <p class="muted">
          هنوز هزینه‌ای ثبت نشده است. افزودن هزینه در مرحلهٔ گروه‌ها اضافه می‌شود.
        </p>
        <div class="skeleton-rows" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </section>
    </section>`;
}

export function renderNotFound({ path }) {
  return `
    <section class="view" aria-labelledby="not-found-title">
      <div class="card error-card">
        <p class="eyebrow">۴۰۴</p>
        <h1 id="not-found-title">صفحه پیدا نشد</h1>
        <p class="lede">
          چیزی به <code>#${escapeHtml(path)}</code> در این اسکلت نگاشته نشده است.
        </p>
        <div class="button-row">
          <a class="button button-primary" href="#/groups">رفتن به گروه‌ها</a>
          <a class="button button-secondary" href="#/login">ورود</a>
        </div>
      </div>
    </section>`;
}

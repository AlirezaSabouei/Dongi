/**
 * Groups page: static sample groups plus the backend health check.
 */

import { getHealth } from './api.js';
import { initShell } from './shell.js';

const HEALTH_LABELS = {
  healthy: 'سالم',
  degraded: 'ناپایدار',
  unhealthy: 'ناسالم',
};

initShell();
initHealthCheck();

function initHealthCheck() {
  const button = document.querySelector('[data-check-api]');
  const result = document.querySelector('[data-api-result]');
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

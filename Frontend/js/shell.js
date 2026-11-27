/**
 * Shared page chrome for the multi-page frontend.
 *
 * Every page duplicates its header and footer markup, and calls `initShell()`
 * once to wire the common behaviour: connection status, skip link, API base
 * label, logout button, cross-tab auth changes, and service-worker
 * registration.
 */

import { getApiConfig } from './api.js';
import {
  AUTH_TOKEN_STORAGE_KEY,
  clearAuthToken,
  isAuthenticated,
} from './auth.js';
import { registerServiceWorker } from './pwa.js';

export function initShell() {
  initConnectionStatus();
  initSkipLink();
  initLogout();
  initAuthSync();
  renderApiBase();
  registerServiceWorker();
}

function initConnectionStatus() {
  const status = document.querySelector('#connection-status');
  if (!status) return;

  const sync = () => {
    const online = navigator.onLine;
    status.dataset.state = online ? 'online' : 'offline';
    status.textContent = online ? 'آنلاین' : 'آفلاین';
  };

  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  sync();
}

function initSkipLink() {
  const skipLink = document.querySelector('.skip-link');
  const outlet = document.querySelector('#app');
  if (!skipLink || !outlet) return;

  skipLink.addEventListener('click', (event) => {
    event.preventDefault();
    outlet.focus({ preventScroll: true });
    outlet.scrollIntoView({ block: 'start' });
  });
}

function initLogout() {
  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.hidden = !isAuthenticated();
    button.addEventListener('click', () => {
      clearAuthToken();
      window.location.assign('login.html');
    });
  });
}

function initAuthSync() {
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== AUTH_TOKEN_STORAGE_KEY) return;

    const authMode = document.body.dataset.auth;
    if (authMode === 'required' && !isAuthenticated()) {
      window.location.replace('login.html');
      return;
    }
    if (authMode === 'guest' && isAuthenticated()) {
      window.location.replace('groups.html');
      return;
    }

    initLogoutVisibility();
  });
}

function initLogoutVisibility() {
  document.querySelectorAll('[data-logout]').forEach((button) => {
    button.hidden = !isAuthenticated();
  });
}

function renderApiBase() {
  const label = document.querySelector('#api-base-label');
  if (label) label.textContent = getApiConfig().apiBaseUrl;
}

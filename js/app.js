/**
 * Application entry point: wires the hash router, PWA registration, and the
 * small pieces of shell chrome (connection status, API base label, skip link).
 */

import { getApiConfig } from './api.js';
import { createRouter } from './router.js';
import { registerServiceWorker } from './pwa.js';
import {
  mountGroups,
  mountLogin,
  renderGroup,
  renderGroups,
  renderLogin,
  renderNotFound,
} from './views.js';

const outlet = document.querySelector('#app');

const routes = [
  {
    path: '/login',
    view: renderLogin,
    mount: mountLogin,
    title: 'ورود · دنگی',
    nav: 'login',
  },
  {
    path: '/groups',
    view: renderGroups,
    mount: mountGroups,
    title: 'گروه‌ها · دنگی',
    nav: 'groups',
  },
  {
    path: '/groups/:id',
    view: renderGroup,
    title: ({ params }) => `گروه ${params.id} · دنگی`,
    nav: 'groups',
  },
];

const notFound = {
  view: renderNotFound,
  title: 'صفحه پیدا نشد · دنگی',
};

if (!outlet) {
  throw new Error('دنگی: خروجی #app در index.html پیدا نشد.');
}

const router = createRouter({ routes, outlet, notFound });
router.start();

registerServiceWorker();
initConnectionStatus();
initSkipLink();
renderApiBase();

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
  skipLink?.addEventListener('click', (event) => {
    event.preventDefault();
    outlet.focus({ preventScroll: true });
    outlet.scrollIntoView({ block: 'start' });
  });
}

function renderApiBase() {
  const label = document.querySelector('#api-base-label');
  if (label) label.textContent = getApiConfig().apiBaseUrl;
}

/**
 * Service worker registration and update UX.
 *
 * Registration is skipped outside a secure context (HTTPS or localhost), where
 * browsers refuse to install service workers. When an updated worker is waiting,
 * a toast offers a reload; the old worker keeps serving the cached shell until
 * the user accepts, which avoids breaking open tabs mid-session.
 */

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  if (!isSecureContextForServiceWorker()) {
    console.info(
      'Dongi: service worker registration skipped (requires HTTPS or localhost).',
    );
    return;
  }

  const toast = document.querySelector('#update-toast');
  const reloadButton = toast?.querySelector('[data-update-reload]');
  const dismissButton = toast?.querySelector('[data-update-dismiss]');
  let reloadRequested = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadRequested) return;
    window.location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(
        new URL('../service-worker.js', import.meta.url),
      );

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;

        worker.addEventListener('statechange', () => {
          if (
            worker.state === 'installed' &&
            navigator.serviceWorker.controller
          ) {
            showUpdateToast(registration.waiting || worker);
          }
        });
      });

      function showUpdateToast(waitingWorker) {
        if (!toast || !waitingWorker) return;
        toast.hidden = false;

        reloadButton?.addEventListener(
          'click',
          () => {
            reloadRequested = true;
            waitingWorker.postMessage({ type: 'SKIP_WAITING' });
          },
          { once: true },
        );

        dismissButton?.addEventListener('click', () => {
          toast.hidden = true;
        }, { once: true });
      }
    } catch (error) {
      console.warn('Dongi: service worker registration failed.', error);
    }
  });
}

function isSecureContextForServiceWorker() {
  if (window.location.protocol === 'https:') return true;
  const hostname = window.location.hostname;
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

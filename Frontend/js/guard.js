/**
 * Blocking auth guard for the multi-page app.
 *
 * Loaded as a classic script in <head> so a protected page never flashes before
 * a signed-out visitor is redirected.
 *
 * Usage:
 *   <script src="js/guard.js" data-auth="required"></script>  protected page
 *   <script src="js/guard.js" data-auth="guest"></script>     login page
 *   <script src="js/guard.js" data-auth="gate"></script>      index.html gate
 *
 * `required` sends signed-out visitors to login.html; `guest` sends signed-in
 * visitors to groups.html (or a safe `next` page); `gate` chooses a start page.
 * This is a UX guard only — the API remains responsible for authorizing
 * requests.
 */

(function guard() {
  const script = document.currentScript;
  const mode = script?.dataset.auth;
  if (!mode || mode === 'public') return;

  const token = readToken();

  if (mode === 'gate') {
    window.location.replace(legacyHashTarget() || (token ? 'groups.html' : 'login.html'));
    return;
  }

  if (mode === 'required' && !token) {
    const next = `${window.location.pathname.split('/').pop()}${window.location.search}${window.location.hash}`;
    window.location.replace(`login.html?next=${encodeURIComponent(next)}`);
    return;
  }

  if (mode === 'guest' && token) {
    window.location.replace(safeNextPage() || 'groups.html');
  }

  function readToken() {
    try {
      const value = window.localStorage.getItem('dongi.auth.token');
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  }

  function safeNextPage() {
    const next = new URLSearchParams(window.location.search).get('next');
    if (!next) return '';

    try {
      const url = new URL(next, window.location.href);
      if (url.origin !== window.location.origin) return '';
      const file = url.pathname.split('/').pop();
      if (file !== 'groups.html' && file !== 'group.html') return '';

      if (url.hash && !/^#\/(groups|join)(\/|$)/.test(url.hash)) return '';
      return `${file}${url.search}${url.hash}`;
    } catch {
      return '';
    }
  }

  /**
   * Translate the original hash-route links to the multi-page app. Groups and
   * join links now live inside groups.html so #/groups/{id} and #/join/{code}
   * survive a refresh and can be shared.
   */
  function legacyHashTarget() {
    const hash = window.location.hash;

    if (/^#\/groups\/[^/]+/.test(hash)) {
      return `groups.html${hash}`;
    }
    if (/^#\/join\/[^/]+/.test(hash)) {
      return `groups.html${hash}`;
    }
    if (hash === '#/groups') return 'groups.html#/groups';
    if (hash === '#/login') return 'login.html';
    return '';
  }
})();

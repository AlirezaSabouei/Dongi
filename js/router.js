/**
 * Minimal hash-based SPA router.
 *
 * Routes are declared as `{ path, view, mount?, title?, nav? }`. `path` supports
 * static segments and `:param` placeholders (for example `/groups/:id`). Views
 * return an HTML string; an optional `mount({ outlet, params, path })` hook runs
 * after the markup is attached. Every navigation updates the document title,
 * the active nav item (`data-nav`), scroll position, and keyboard focus.
 */

export function createRouter({ routes, outlet, notFound, onRendered }) {
  let renderToken = 0;

  function readHashPath() {
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) return '/';
    return raw.startsWith('/') ? raw : `/${raw}`;
  }

  function normalize(pathname) {
    const trimmed = pathname.replace(/\/+$/, '');
    return trimmed || '/';
  }

  function decodeParam(segment) {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }

  function matchRoute(pathname) {
    const segments = pathname.split('/').filter(Boolean);

    for (const route of routes) {
      const parts = route.path.split('/').filter(Boolean);
      if (parts.length !== segments.length) continue;

      const params = {};
      let matched = true;

      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        if (part.startsWith(':')) {
          const name = part.slice(1);
          if (!name) {
            matched = false;
            break;
          }
          params[name] = decodeParam(segments[index]);
        } else if (part !== segments[index]) {
          matched = false;
          break;
        }
      }

      if (matched) return { route, params };
    }

    return null;
  }

  function updateNav(activeKey) {
    document.querySelectorAll('[data-nav]').forEach((link) => {
      if (activeKey && link.dataset.nav === activeKey) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }

  function focusView() {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    const heading = outlet.querySelector('h1');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    } else {
      outlet.focus({ preventScroll: true });
    }
  }

  function renderError() {
    outlet.innerHTML = `
      <section class="view" aria-labelledby="error-title">
        <div class="card error-card">
          <p class="eyebrow">خطایی رخ داد</p>
          <h1 id="error-title">این نما نمایش داده نشد</h1>
          <p class="lede">برای تلاش دوباره برنامه را بازخوانی کنید. اگر مشکل ادامه داشت، کنسول مرورگر را برای جزئیات بررسی کنید.</p>
          <button type="button" class="button button-primary" data-retry-render>بازخوانی</button>
        </div>
      </section>`;
    outlet.querySelector('[data-retry-render]')?.addEventListener('click', () => {
      window.location.reload();
    });
    focusView();
  }

  async function render() {
    const token = renderToken + 1;
    renderToken = token;

    if (!window.location.hash || window.location.hash === '#') {
      window.history.replaceState(null, '', '#/login');
    }

    let pathname = normalize(readHashPath());
    if (pathname === '/') {
      window.history.replaceState(null, '', '#/login');
      pathname = '/login';
    }

    const matched = matchRoute(pathname);
    const activeRoute = matched?.route ?? notFound;
    const context = {
      path: pathname,
      params: matched?.params ?? {},
    };

    try {
      const html =
        typeof activeRoute.view === 'function'
          ? activeRoute.view(context)
          : '';
      if (token !== renderToken) return;

      outlet.innerHTML = html;
      document.title =
        typeof activeRoute.title === 'function'
          ? activeRoute.title(context)
          : activeRoute.title || 'دنگی';
      updateNav(activeRoute.nav);

      if (typeof activeRoute.mount === 'function') {
        activeRoute.mount({ outlet, ...context });
      }
      if (typeof onRendered === 'function') {
        onRendered({ ...context, route: activeRoute });
      }

      focusView();
    } catch (error) {
      console.error('Dongi router failed to render', pathname, error);
      if (token === renderToken) renderError();
    }
  }

  function start() {
    window.addEventListener('hashchange', render);
    render();
  }

  return { start, render, navigate: (path) => {
    window.location.hash = path.startsWith('/') ? path : `/${path}`;
  } };
}

# Dongi — Frontend PWA scaffold

Vanilla HTML/CSS/JS frontend for Dongi, built as an installable progressive web
app. No framework, no build step: the files in this folder are served as-is.

This is **Epic 0** from
[issue #2](https://github.com/AlirezaSabouei/Dongi/issues/2). It provides the app
shell, hash router, API wrapper, placeholder views, and offline support. Phone
sign-in and real group data arrive in later milestones. The ASP.NET Core API
scaffold from issue #1 lives in [`Backend/`](Backend/README.md).

## Language and direction

The interface is Persian (fa) and right-to-left:

- `index.html` sets `<html lang="fa" dir="rtl">` and Persian title/description.
- `manifest.webmanifest` declares `"lang": "fa"` and `"dir": "rtl"`; shortcut
  names are Persian too.
- Layout CSS mirrors through logical properties (`inset-inline-start`,
  `margin-inline-start`), and Persian-capable fonts (Vazirmatn, Segoe UI,
  Tahoma) lead the type stack. Letter-spacing is disabled so Persian letters
  keep their joins.
- User-facing strings live in `js/views.js`, `js/app.js`, `js/router.js`,
  `js/api.js`, and the offline fallback in `service-worker.js`.
- Numbers and times are formatted with the `fa-IR` locale, so they render with
  Persian digits.

## What's included

| Piece | Purpose |
| --- | --- |
| `index.html` | App shell, links the manifest and icons, loads `js/app.js` |
| `css/styles.css` | Responsive light/dark theme, no framework |
| `js/app.js` | Entry point: routes, nav state, connection badge, skip link |
| `js/router.js` | Hash router with `:param` support and deep-link rendering |
| `js/views.js` | Placeholder login, group list, group detail, and 404 views |
| `js/api.js` | `fetch` wrapper with configurable base URL, JSON handling, timeouts, `ApiError` |
| `js/config.js` | Runtime API base URL and timeout |
| `js/pwa.js` | Service-worker registration and "new version" toast |
| `manifest.webmanifest` | Installability metadata, icons, shortcuts |
| `service-worker.js` | App-shell precache, offline navigation fallback |
| `icons/` | 192/512 PNG, maskable, Apple touch, favicon, SVG source |

## Run it

Requires Node.js (for `npx serve`) or any static file server. The app must be
served over **HTTPS or localhost** for service workers and installability.

```bash
# from the repository root
npx serve . -l 5173
```

Open <http://localhost:5173>. Port `5173` is the backend's default allowed CORS
origin. Any port works for the UI itself; if you use a different one, add that
origin to the API's `Cors:AllowedOrigins` before using the "Check API" button.

Equivalent alternatives:

```bash
# Python 3
python -m http.server 5173

# Any other static server that serves the folder root at /
```

Do **not** open `index.html` via `file://` — modules and service workers require
an HTTP origin.

### API (optional)

The health check button on `#/groups` calls the backend scaffold from issue #1:

```bash
cd Backend
dotnet run          # http://localhost:5080/health
```

`js/config.js` points at `http://localhost:5080` by default. Edit it to change
the API base URL or timeout, or override `window.DONGI_CONFIG` before
`js/config.js` loads:

```js
window.DONGI_CONFIG = {
  apiBaseUrl: 'https://api.dongi.example',
  requestTimeoutMs: 10000,
};
```

Only the health endpoint is wired up in this frontend scaffold. The backend now
also implements auth and group endpoints (see
[`Backend/README.md`](Backend/README.md)), but the views still use placeholder
content until the frontend auth and groups stories land.

## Routes

| Route | View |
| --- | --- |
| `#/login` | Phone sign-in placeholder (default route) |
| `#/groups` | Sample group list + backend health check |
| `#/groups/:id` | Group detail placeholder; any id renders, e.g. `#/groups/123` |
| anything else | Not-found view |

Navigation is hash based, so a direct reload of any route serves `index.html`
from the server and the router renders the same view. There is no server-side
rewrite requirement.

## PWA behaviour

- The manifest is linked from `index.html` and includes 192px and 512px icons,
  including maskable variants, plus app shortcuts.
- `service-worker.js` precaches the app shell on install. Navigations are
  network-first with a cache fallback, so the app opens offline after the first
  visit; cached shell assets are refreshed in the background.
- Cross-origin API requests are never cached, so health checks always hit the
  network.
- When a new service worker is waiting, a toast offers a reload instead of
  swapping the app underneath an open tab.

### Updating cached assets

Bump `CACHE_VERSION` in `service-worker.js` whenever you change a precached
file. The old cache is deleted on activation. (During local development, use
DevTools → Application → Service Workers → **Update on reload** to avoid stale
files.)

## Verify the acceptance criteria

1. **Manifest is valid and linked**
   - Open DevTools → Application → Manifest. Name, short name, start URL,
     display mode, and both icon sizes should be detected without errors.
   - Check that `index.html` contains `<link rel="manifest" href="manifest.webmanifest">`.
2. **Service worker registers and caches the shell**
   - DevTools → Application → Service Workers: `service-worker.js` is
     **activated and running**.
   - DevTools → Application → Cache Storage: `dongi-shell-v1` contains the
     document, CSS, JS modules, manifest, and icons.
3. **Offline app shell**
   - With the page loaded once, switch DevTools → Network → **Offline**, then
     reload. The shell and router still render, and the header badge shows
     "Offline".
4. **Hash routing without full reloads**
   - Navigate between `#/login`, `#/groups`, and `#/groups/123`; the page does
     not reload and the active nav item updates.
   - Reload while at `#/groups/123`; the group placeholder renders again.
5. **Installability / Lighthouse**
   - Run Lighthouse (Chrome DevTools → Lighthouse) against
     `http://localhost:5173` and check the installability audit, or:
     ```bash
     npx lighthouse http://localhost:5173 --view
     ```
   - The app is installable in Chrome/Edge via the address-bar install button.

## Project layout

```text
.
├── index.html
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── api.js
│   ├── config.js
│   ├── pwa.js
│   ├── router.js
│   └── views.js
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-192.png
│   ├── icon-maskable-512.png
│   ├── apple-touch-icon.png
│   └── favicon-32.png
├── manifest.webmanifest
├── service-worker.js
└── Backend/            # ASP.NET Core API (issue #1)
```

## Browser support

Evergreen Chrome, Edge, Firefox, and Safari. The app uses ES modules, CSS custom
properties, and `fetch`; the service worker is skipped on insecure origins.

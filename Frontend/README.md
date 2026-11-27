# Dongi — Frontend (multi-page PWA)

Vanilla HTML/CSS/JS frontend for Dongi, built as an installable progressive web
app. No framework, no build step: the files in this folder are served as-is.

This is **Epic 1** from
[issue #5](https://github.com/AlirezaSabouei/Dongi/issues/5) on top of the
Epic 0 shell from [issue #2](https://github.com/AlirezaSabouei/Dongi/issues/2).
It provides the shared shell, a multi-page auth flow, the API wrapper, phone +
SMS code login, placeholder group pages, and offline support. Real group data
arrives in later milestones. The ASP.NET Core API lives in
[`Backend/`](../Backend/README.md).

## Language and direction

The interface is Persian (fa) and right-to-left:

- Every page declares `<html lang="fa" dir="rtl">` with a Persian title and
  description.
- `manifest.webmanifest` declares `"lang": "fa"` and `"dir": "rtl"`; shortcut
  names are Persian too.
- Layout CSS mirrors through logical properties (`inset-inline-start`,
  `margin-inline-start`), and Persian-capable fonts (Vazirmatn, Segoe UI,
  Tahoma) lead the type stack. Letter-spacing is disabled so Persian letters
  keep their joins.
- User-facing strings live in the HTML pages, the page modules under `js/`,
  `js/api.js`, and the offline fallback in `service-worker.js`.
- Numbers and times are formatted with the `fa-IR` locale, so they render with
  Persian digits.

## What's included

| Piece | Purpose |
| --- | --- |
| `index.html` | Small start-page gate: sends visitors to login or groups using the stored token |
| `login.html` | Phone + SMS code form; starts the login flow |
| `groups.html` | Sample group list + backend health check |
| `group.html` | Group detail placeholder; reads `?id=` from the URL |
| `404.html` | Standalone not-found page |
| `css/styles.css` | Responsive light/dark theme, no framework |
| `js/guard.js` | Blocking auth guard loaded in each page's `<head>` |
| `js/shell.js` | Shared chrome: connection badge, skip link, logout, API label, service worker |
| `js/login.js` | Login validation, API calls, resend cooldown, token storage |
| `js/groups.js` | Group list health check |
| `js/group.js` | Fills the group id and title from `?id=` |
| `js/not-found.js` | Chrome for the 404 page |
| `js/api.js` | `fetch` wrapper with configurable base URL, JSON handling, timeouts, `ApiError` |
| `js/auth.js` | JWT storage in `localStorage` and phone/code normalization |
| `js/config.js` | Runtime API base URL and timeout |
| `js/pwa.js` | Service-worker registration and "new version" toast |
| `manifest.webmanifest` | Installability metadata, icons, shortcuts |
| `service-worker.js` | Page precache, offline navigation fallback |
| `icons/` | 192/512 PNG, maskable, Apple touch, favicon, SVG source |

## Run it

Requires Node.js (for `npx serve`) or any static file server. The app must be
served over **HTTPS or localhost** for service workers and installability.

```bash
# from the repository root
npx serve Frontend -l 5173
```

Open <http://localhost:5173/>; `index.html` sends you to `login.html` or
`groups.html` depending on whether a token is stored. Every page is a regular
HTML file, so you can also open
<http://localhost:5173/login.html> directly. The server root must be the
`Frontend/` folder, because the pages, manifest, and service worker are all
resolved relative to it. Port `5173` is the backend's default allowed CORS
origin. Any port works for the UI itself; if you use a different one, add that
origin to the API's `Cors:AllowedOrigins` before using the login form or the
"Check API" button.

Equivalent alternatives:

```bash
# Python 3, from the repository root
python -m http.server 5173 --directory Frontend

# Any other static server that serves Frontend/ at /
```

Do **not** open the HTML files via `file://` — modules and service workers
require an HTTP origin.

### API

The frontend is currently configured for the temporary development backend:

| Item | Address |
| --- | --- |
| Base URL | <http://192.168.1.8:8082> |
| Health | <http://192.168.1.8:8082/health> |
| Swagger | <http://192.168.1.8:8082/swagger> |

The browser machine must be able to reach that host, and the backend must allow
the frontend origin through `Cors:AllowedOrigins`. With the command above the
origin is `http://localhost:5173`, which the temporary backend currently allows;
`http://127.0.0.1:5173` is not allowed, so use the `localhost` URL. The temporary
API is plain HTTP, so serve the frontend over HTTP as well; an HTTPS-hosted
frontend would be blocked as mixed content.

`js/config.js` holds the base URL and timeout. Edit it to switch back to a local
API, or override `window.DONGI_CONFIG` before `js/config.js` loads:

```js
window.DONGI_CONFIG = {
  apiBaseUrl: 'https://api.dongi.example',
  requestTimeoutMs: 10000,
};
```

To run the API locally instead:

```bash
# from the repository root
cd Backend
dotnet run          # http://localhost:5080/health
```

In development the backend logs outgoing SMS codes with its console SMS sender,
so no real SMS provider is needed to test the login flow.

## Authentication flow

`login.html` has two steps in one page:

1. **Phone.** The input expects an international number with a country code,
   e.g. `+989121234567` (spaces, dashes, parentheses, `00` instead of `+`, and
   Persian/Arabic digits are normalized). The number is validated locally; an
   empty or malformed number shows a field error and does **not** call the API.
   A valid number is posted to `POST /auth/request-code`.
2. **Code.** A six-digit input calls `POST /auth/verify-code`. On success the
   JWT from the response is stored under `dongi.auth.token` in `localStorage`
   and the browser navigates to `groups.html`. The resend button stays disabled
   for 60 seconds after each successful request and then becomes available
   again.

Errors stay inline in the form: invalid phone, wrong/expired code (HTTP 401),
too many attempts (429), and service unavailable (503). Network failures use the
API wrapper's Persian message. The JWT is never written to the console or to
the DOM.

The guard in `js/guard.js` runs before a page renders. It protects
`groups.html` and `group.html`; without a token the visitor is redirected to
`login.html`. A signed-in user who opens `login.html` is sent to `groups.html`
(or to a safe `next` page). The header's **خروج** (log out) button clears the
token and returns to `login.html`; the token also survives reloads while it
remains in `localStorage`.

This guard is a UX convenience, not a security boundary: the API still has to
authorize every request.

## Pages

| Page | Contents | Access |
| --- | --- | --- |
| `index.html` | Start-page gate | Public; redirects to login or groups |
| `login.html` | Phone + SMS code login | Signed-out only; signed-in users go to `groups.html` |
| `groups.html` | Sample group list + backend health check | Requires a token |
| `group.html?id=:id` | Group detail placeholder, e.g. `group.html?id=household` | Requires a token |
| `404.html` | Not-found page | Public |

Navigation uses ordinary links, so every page load is a full request. Old
`#/login`, `#/groups`, and `#/groups/:id` links are translated by the
`index.html` gate. Whether a missing URL serves `404.html` depends on the static
host; `npx serve` and most hosts let you configure a custom 404 document.

## PWA behaviour

- The manifest is linked from every page and includes 192px and 512px icons,
  including maskable variants, plus app shortcuts to `groups.html` and
  `login.html`.
- `service-worker.js` precaches all pages and shell assets on install.
  Navigations are network-first with a cache fallback (including
  `group.html?id=...`), so the app opens offline after the first visit; cached
  shell assets are refreshed in the background.
- Cross-origin API requests (health and auth) are never cached, so they always
  hit the network.
- When a new service worker is waiting, a toast offers a reload instead of
  swapping the app underneath an open tab.

### Updating cached assets

Bump `CACHE_VERSION` in `service-worker.js` whenever you change a precached
file. The old cache is deleted on activation. (During local development, use
DevTools → Application → Service Workers → **Update on reload** to avoid stale
files.)

## Verify the acceptance criteria

Run the backend (`dotnet run` in `Backend/`) and the frontend, then:

1. **Happy path** — open `login.html`, submit `+989121234567` (any valid-looking
   number works in development), read the six-digit code from the **backend
   console**, enter it, and confirm the browser lands on `groups.html`.
2. **Validation without a request** — submit an empty phone or `09121234567`
   without a country code; a field error appears and DevTools → Network shows
   no `/auth/request-code` call.
3. **Resend cooldown** — after the code step appears, the resend button is
   disabled and counts down from 60 seconds before enabling.
4. **Wrong code** — enter a wrong six-digit code; an inline error appears and
   the page stays on `login.html`.
5. **429 and 503** — the backend returns 429 after repeated requests and 503
   when MongoDB/SMS is unavailable; both show inline messages and keep the form
   usable.
6. **Persistence** — after signing in, reload `groups.html`; the page renders
   because `dongi.auth.token` is in `localStorage`.
7. **Guard** — clear the token in DevTools → Application → Local Storage and
   reload `groups.html`; the guard redirects to `login.html`. Opening
   `login.html` with a token redirects to `groups.html`. `group.html?id=x` is
   guarded the same way.
8. **Logout** — click **خروج** in the header; `dongi.auth.token` is removed and
   the browser navigates to `login.html`.

Page checks:

- **Manifest** — DevTools → Application → Manifest detects the name, start URL,
  display mode, and both icon sizes without errors.
- **Service worker** — DevTools → Application → Service Workers shows
  `service-worker.js` activated; Cache Storage contains `dongi-shell-v6` with
  the HTML pages and modules.
- **Offline** — after one visit, switch DevTools → Network → **Offline** and
  reload `groups.html` or `group.html?id=household`; the cached page still
  renders.
- **Installability** — run Lighthouse against `http://localhost:5173` and check
  the installability audit, or use the address-bar install button.

## Project layout

```text
.
├── Backend/            # ASP.NET Core API
├── Backend.Tests/      # API test project
├── Dongi.slnx          # solution file
└── Frontend/           # this folder
    ├── index.html      # start-page gate
    ├── login.html
    ├── groups.html
    ├── group.html
    ├── 404.html
    ├── css/
    │   └── styles.css
    ├── js/
    │   ├── guard.js
    │   ├── shell.js
    │   ├── login.js
    │   ├── groups.js
    │   ├── group.js
    │   ├── not-found.js
    │   ├── api.js
    │   ├── auth.js
    │   ├── config.js
    │   └── pwa.js
    ├── icons/
    │   ├── icon.svg
    │   ├── icon-192.png
    │   ├── icon-512.png
    │   ├── icon-maskable-192.png
    │   ├── icon-maskable-512.png
    │   ├── apple-touch-icon.png
    │   └── favicon-32.png
    ├── manifest.webmanifest
    └── service-worker.js
```

## Browser support

Evergreen Chrome, Edge, Firefox, and Safari. The app uses ES modules, CSS custom
properties, and `fetch`; the service worker is skipped on insecure origins.

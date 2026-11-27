# Dongi

Dongi helps friends track shared expenses: create a group, record costs, and
settle up. This repository contains the web frontend and the ASP.NET Core API.

## Repository layout

| Folder | Contents |
| --- | --- |
| [`Frontend/`](Frontend/README.md) | Vanilla HTML/CSS/JS progressive web app. No framework, no build step. |
| [`Backend/`](Backend/README.md) | ASP.NET Core minimal API (auth, health, MongoDB). |
| [`Backend.Tests/`](Backend.Tests/) | xUnit tests for the API. |

`Dongi.slnx` groups the two .NET projects; the frontend is plain static files
and is not part of the solution.

## Run it

```bash
# API — http://localhost:5080
cd Backend
dotnet run

# Frontend — http://localhost:5173 (serve the Frontend folder as the root)
npx serve Frontend -l 5173
```

The frontend needs Node.js (for `npx serve`), Python 3 (`python -m http.server
5173 --directory Frontend`), or any static file server. See
[`Frontend/README.md`](Frontend/README.md) for pages, auth, PWA behaviour, and
verification steps, and [`Backend/README.md`](Backend/README.md) for
configuration and endpoints.
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

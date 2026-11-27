# Dongi

Dongi helps friends track shared expenses: create a group, invite people with a
code, record costs, and settle up. This repository contains the web frontend and
the ASP.NET Core API.

## Repository layout

| Folder | Contents |
| --- | --- |
| [`Frontend/`](Frontend/README.md) | Vanilla HTML/CSS/JS progressive web app. No framework, no build step. |
| [`Backend/`](Backend/README.md) | ASP.NET Core Web API (health, SMS OTP auth, MongoDB, groups). |
| [`Backend.Tests/`](Backend.Tests/) | xUnit integration tests for the API. |

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
5173 --directory Frontend`), or any static file server. The temporary development
API is configured at <http://192.168.1.8:8082> (Swagger:
<http://192.168.1.8:8082/swagger>); see
[`Frontend/README.md`](Frontend/README.md) for switching back to a local API.

## What works

- Phone + SMS code login, JWT storage, blocking auth guard, and logout.
- Authenticated group list with a member count per group, plus loading, empty,
  and error states.
- Create-group and join-with-code modals. Creating updates the list in place;
  joining opens the group detail route.
- Shareable hash routes: `groups.html#/groups`,
  `groups.html#/groups/{id}`, and `groups.html#/join/{code}`. The backend's
  `/#/join/{inviteCode}` links are translated to the last route by the
  `index.html` gate.
- Group detail with member avatars/initials, an expense list fed by
  `GET /groups/{id}/expenses` (title, amount, payer, date, empty state), and a
  **دعوت دوستان** button that shares the invite URL or copies it with a toast.
  Friendly 403/404 states keep non-members and unknown groups on a working page.
- **افزودن هزینه** modal with title, optional description, integer Rial amount,
  and a member multi-select. All members are selected by default, the payer is
  locked in, and a live per-person preview follows the backend's equal-split
  remainder rule. Submitting calls `POST /groups/{id}/expenses`, closes the
  modal, and refreshes the list; client and server errors stay inline.
- Persian RTL UI, light/dark themes, installable PWA shell, and an offline
  fallback for visited pages.

## Routes

| Route | View |
| --- | --- |
| `login.html` | Phone sign-in flow (signed-out only) |
| `groups.html#/groups` | Group list, create dialog, join dialog |
| `groups.html#/groups/{id}` | Group detail for members |
| `groups.html#/join/{code}` | Group list with the join dialog pre-filled |
| `group.html?id={id}` | Legacy group link; redirects to the hash route |
| `404.html` | Not-found page |

Within `groups.html` navigation is hash based, so list/detail/join transitions
do not reload the page. Moving between the login and groups shell pages is a
normal full request. See [`Frontend/README.md`](Frontend/README.md) for the full
acceptance checklist.

## PWA behaviour

- The manifest is linked from every page and includes 192px and 512px icons,
  including maskable variants, plus app shortcuts.
- `service-worker.js` precaches all pages and shell assets on install.
  Navigations are network-first with a cache fallback; cached shell assets are
  refreshed in the background.
- API requests are never cached.
- When a new service worker is waiting, a toast offers a reload instead of
  swapping the app underneath an open tab.

Bump `CACHE_VERSION` in `service-worker.js` whenever a precached file changes.

## Project layout

```text
.
├── Backend/            # ASP.NET Core API
├── Backend.Tests/      # API test project
├── Dongi.slnx          # solution file
└── Frontend/           # static PWA
    ├── index.html      # start-page / legacy hash gate
    ├── login.html
    ├── groups.html     # list + create/join + detail hash router
    ├── group.html      # legacy detail redirect
    ├── 404.html
    ├── css/
    │   └── styles.css
    ├── js/
    │   ├── guard.js
    │   ├── shell.js
    │   ├── login.js
    │   ├── groups.js
    │   ├── expenses.js
    │   ├── group.js
    │   ├── not-found.js
    │   ├── api.js
    │   ├── auth.js
    │   ├── config.js
    │   └── pwa.js
    ├── icons/
    ├── manifest.webmanifest
    └── service-worker.js
```

## Browser support

Evergreen Chrome, Edge, Firefox, and Safari. The app uses ES modules, CSS custom
properties, and `fetch`; the service worker is skipped on insecure origins.

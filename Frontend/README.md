# Dongi — Frontend (multi-page PWA)

Vanilla HTML/CSS/JS frontend for Dongi, built as an installable progressive web
app. No framework, no build step: the files in this folder are served as-is.

This is **Epic 1** from
[issue #5](https://github.com/AlirezaSabouei/Dongi/issues/5) and **Epic 2** from
[issue #8](https://github.com/AlirezaSabouei/Dongi/issues/8) on top of the
Epic 0 shell from [issue #2](https://github.com/AlirezaSabouei/Dongi/issues/2).
It provides the shared shell, a multi-page auth flow, the authenticated group
list with create/join dialogs, group detail routes, and offline support. The
ASP.NET Core API lives in [`Backend/`](../Backend/README.md).

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
| `groups.html` | Group list, create dialog, join dialog, `#/groups/{id}` detail (members, expenses, add-expense form, invite), and hash router |
| `group.html` | Legacy `?id=` entry point; redirects to `groups.html#/groups/{id}` |
| `404.html` | Standalone not-found page |
| `css/styles.css` | Responsive light/dark theme, no framework |
| `js/guard.js` | Blocking auth guard loaded in each page's `<head>` |
| `js/shell.js` | Shared chrome: connection badge, skip link, logout, API label, service worker |
| `js/login.js` | Login validation, API calls, resend cooldown, token storage |
| `js/groups.js` | Hash routes, list loading/empty/error states, create/join flows, detail rendering (members, expenses, invite sharing), add-expense form and validation, 401 handling |
| `js/expenses.js` | Reusable expense rows, amount/date formatting, expense totals, and the shared equal-split remainder rule |
| `js/group.js` | Legacy `group.html?id=` redirect |
| `js/not-found.js` | Chrome for the 404 page |
| `js/api.js` | `fetch` wrapper with configurable base URL, JSON handling, timeouts, bearer auth, `ApiError` |
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
the frontend origin through `Cors:AllowedOrigins`. For local/LAN development the
backend currently allows **any origin** (`"AllowedOrigins": ["*"]`); API requests
still require a JWT, so this only relaxes the browser CORS check. Replace `*`
with the real frontend origin(s) before deploying. The temporary API is plain
HTTP, so serve the frontend over HTTP as well; an HTTPS-hosted frontend would be
blocked as mixed content.

### Accessing from another device on the LAN

To let another computer on the same network use the app:

1. Find the host PC's LAN IP (`ip addr` on Linux, `ipconfig` on Windows). The
   checked-in config assumes `192.168.1.8`.
2. Start the backend bound to all interfaces on port `8082` (the port the
   frontend expects):

   ```bash
   cd Backend
   dotnet run --launch-profile lan
   ```

3. Serve the frontend so it is reachable from the network:

   ```bash
   npx serve Frontend -l 5173
   ```

4. On the other computer, open `http://192.168.1.8:5173/`.

Or run the whole stack in Docker — MongoDB, the API, and this frontend:

```bash
# from the repository root
docker compose -f docker-compose.dev.yml up --build
```

The compose file sets `ASPNETCORE_ENVIRONMENT=Development` and the API port
mapping for you, so no `launchSettings.json` or manual environment variables are
needed.

Because development CORS allows any origin, only these two need changing if the
host IP changes (restart the backend afterwards):

- `Backend/appsettings.Development.json` → `Groups:FrontendBaseUrl`
- `Frontend/js/config.js` → `apiBaseUrl`

Also allow inbound TCP `8082` (API) and `5173` (frontend) through the host
firewall.

When deploying, replace `"*"` in `Backend/appsettings.Development.json` with
the actual frontend origin(s) — or configure it on the server — so the API is
not open to arbitrary websites.

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
   and the browser navigates to the groups list (`groups.html#/groups`). The
   resend button stays disabled for 60 seconds after each successful request and
   then becomes available again.

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
authorize every request. Group requests attach the stored JWT as
`Authorization: Bearer …`; a `401` on any group call clears the token and
redirects to `login.html`, preserving the current group/join route in `next`.

## Groups flow

`groups.html` is a small hash router over the authenticated groups API:

| Route | View |
| --- | --- |
| `groups.html#/groups` | Group list, create dialog, join dialog |
| `groups.html#/groups/{id}` | Group detail: members, expenses, invite sharing |
| `groups.html#/join/{code}` | Group list with the join dialog pre-filled |

- The list calls `GET /groups` and renders each group's name and member count.
  While the request is in flight a loading state is shown. An empty response
  shows **هنوز گروهی ندارید** (no groups yet); network and server failures show
  an error card with **تلاش دوباره** (retry).
- **گروه جدید** (create group) opens a modal with a name field. Whitespace-only
  names are rejected locally, without an API call. `POST /groups` adds the
  returned group to the top of the list without a full page reload.
- **ورود با کد دعوت** (join with code) opens a modal and calls
  `POST /groups/join`. A valid code routes to `#/groups/{id}`; an unknown code
  shows the error inline and keeps the list route. The code is case-sensitive.
- Opening `#/join/ABC123` directly opens the join modal with `ABC123` filled in,
  so invite links shared by the backend
  (`{Groups:FrontendBaseUrl}/#/join/{inviteCode}`) work.
- The detail route fetches `GET /groups/{id}` and shows the name, member
  avatars/initials, member count, and creation date. A `403` shows **شما عضو این
  گروه نیستید** with a back link, and a `404` shows **گروه پیدا نشد**; neither
  case crashes the page.
- The detail route also fetches `GET /groups/{id}/expenses` and renders each
  expense's title, amount (Rials), payer, and date, with a **هنوز هزینه‌ای ثبت
  نشده است** empty state. Expense rendering lives in `js/expenses.js` so the
  later expense views (issues #11–#12) can reuse it. If the temporary backend
  does not expose the expenses endpoint yet, the section falls back to the empty
  state instead of failing the group page.
- **افزودن هزینه** (add expense) opens a modal with title, optional description,
  an integer Rial amount, and a member multi-select. Every group member is
  selected by default; the signed-in payer stays checked and disabled so the
  payer can never be removed from the split. A live preview shows each selected
  member's share. Submit validates the title, a positive integer amount, and at
  least one member locally, then calls `POST /groups/{id}/expenses` with
  `{ title, description?, amount, payerId, memberIds }`. On success the modal
  closes, a toast appears, and `GET /groups/{id}/expenses` is re-read so the
  list and totals come from the server. A `400` or `403` is shown inline and the
  modal stays open for correction.
- **دعوت دوستان** (invite) fetches `GET /groups/{id}/invite` and shares the
  returned join URL through `navigator.share` when available. Browsers without
  the Web Share API copy the URL to the clipboard instead (with a
  selection-based fallback for insecure origins) and confirm it in a toast.
- Live split previews use the same remainder rule as the backend (implemented
  in `calculateEqualSplit` in `js/expenses.js`): `base = floor(amount / count)`,
  `remainder = amount - base * count`, and the `remainder` extra Rials are given
  one at a time to the first members of the sorted `memberIds` list. The form
  sends that same sorted order, so the preview always adds up to the full amount
  and assigns the rounding Rial to the same people.
- Legacy `group.html?id={id}` links redirect to `groups.html#/groups/{id}`.

## Pages

| Page | Contents | Access |
| --- | --- | --- |
| `index.html` | Start-page gate | Public; redirects to login or groups |
| `login.html` | Phone + SMS code login | Signed-out only; signed-in users go to `groups.html` |
| `groups.html#/groups` | Group list, create/join modals | Requires a token |
| `groups.html#/groups/:id` | Group detail: members, expenses, add-expense form, invite sharing | Requires a token and membership |
| `groups.html#/join/:code` | Join modal pre-filled from invite link | Requires a token |
| `group.html?id=:id` | Legacy detail link; redirects to the hash route | Requires a token |
| `404.html` | Not-found page | Public |

The shell pages still use ordinary links, so moving between login and groups is
a full request; list/create/join/detail updates within `groups.html` use hash
routes and do not reload. Old `#/login`, `#/groups`, `#/groups/:id`, and
`#/join/:code` links are translated by the `index.html` gate. Whether a missing
URL serves `404.html` depends on the static host; `npx serve` and most hosts let
you configure a custom 404 document.

## PWA behaviour

- The manifest is linked from every page and includes 192px and 512px icons,
  including maskable variants, plus app shortcuts to `groups.html` and
  `login.html`.
- `service-worker.js` precaches all pages and shell assets on install.
  Navigations are network-first with a cache fallback (including any
  `groups.html#/groups/...` or `groups.html#/join/...` hash), so the app opens
  offline after the first visit; cached shell assets are refreshed in the
  background.
- Cross-origin API requests (health, auth, and groups) are never cached, so they
  always hit the network.
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
   console**, enter it, and confirm the browser lands on
   `groups.html#/groups`.
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

Groups checks (issue #8):

9. **Empty state** — with an account that belongs to no groups, open
   `groups.html#/groups`; the empty state (not an empty list) is shown.
10. **Create** — click **گروه جدید**, submit an empty name, and confirm an
    inline error appears with **no** `POST /groups` request. Enter `Trip`,
    submit, and confirm `Trip` appears in the list without a page reload.
11. **Join with a valid code** — open the join modal, enter a valid invite code
    from `GET /groups/{id}/invite`, and confirm the URL becomes
    `groups.html#/groups/{id}` and the detail view renders.
12. **Join with a bad code** — enter an unknown code; an inline error appears
    and the URL stays on the list/join route.
13. **Invite deep link** — while signed in, open
    `groups.html#/join/ABC123`; the join modal is open and the code field is
    pre-filled with `ABC123`.
14. **Expired token** — replace `dongi.auth.token` with an invalid/expired JWT
    and reload the list; the page redirects to `login.html` with a `next` route
    and the token is cleared.
15. **Legacy detail link** — open `group.html?id={id}`; the browser lands on
    `groups.html#/groups/{id}` and renders the same group.

Group page checks (issue #9):

16. **Member view** — open `groups.html#/groups/{id}` for a group you belong to;
    the group name, member avatars/initials, and member count render, and the
    expense list shows title, amount, payer, and date (or the empty state).
17. **No expenses** — open a fresh group; **هنوز هزینه‌ای ثبت نشده است** is
    shown instead of an empty list.
18. **Invite with Web Share** — in a browser with `navigator.share` (or a mocked
    `navigator.share`), click **دعوت دوستان**; the share sheet is invoked with
    the join URL.
19. **Invite without Web Share** — delete/mock out `navigator.share`, click
    **دعوت دوستان**, and confirm the clipboard contains the join URL and a
    success toast appears.
20. **Non-member** — open a group URL for a group you do not belong to; **شما
    عضو این گروه نیستید** and a back link render, with no uncaught errors.
21. **Unknown group** — open `groups.html#/groups/not-an-id`; **گروه پیدا نشد**
    renders with a back link.

Add-expense checks (issue #12):

22. **Open the form** — from a group page click **افزودن هزینه**; every member
    is selected, the payer's checkbox is checked and disabled, and the title
    field has focus.
23. **Equal preview** — type `3000` with three selected members; the preview
    shows **هر نفر ۱٬۰۰۰ ریال**.
24. **Remainder preview** — type `1000` with three selected members; the
    per-person rows show 334/333/333 and add up to 1000 (difference ≤ 1).
25. **Single split** — deselect every member except the payer; the preview shows
    the full amount for the payer and submit stays allowed.
26. **Client validation** — submit with an empty title, then with amount `0`;
    inline errors appear and DevTools → Network shows **no**
    `POST /groups/{id}/expenses`.
27. **Successful submit** — fill a title and a positive integer amount, submit,
    and confirm the request body has `payerId` plus the sorted `memberIds`; the
    modal closes, a success toast appears, and the list shows the new expense.
28. **Server errors** — force a `403` (non-member) or `400` from the API; the
    message is shown inline, the modal stays open, and the form remains usable.
29. **Expired token** — submit with an invalid/expired JWT; the page redirects to
    `login.html` with the group route preserved.

Page checks:

- **Manifest** — DevTools → Application → Manifest detects the name, start URL,
  display mode, and both icon sizes without errors.
- **Service worker** — DevTools → Application → Service Workers shows
  `service-worker.js` activated; Cache Storage contains `dongi-shell-v9` with
  the HTML pages and modules.
- **Offline** — after one visit, switch DevTools → Network → **Offline** and
  reload `groups.html#/groups`; the cached shell still renders (API data is not
  cached).
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
    │   ├── expenses.js
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

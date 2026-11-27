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

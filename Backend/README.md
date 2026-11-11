# Dongi API

Backend for Dongi — an ASP.NET Core Web API targeting **.NET 10** with
passwordless SMS OTP authentication.

Implemented so far:

- `GET /health` liveness probe
- `POST /auth/request-code` — issue a six-digit SMS login code
- `POST /auth/verify-code` — redeem the code and receive a JWT
- `POST /groups`, `GET /groups`, `GET /groups/{id}` — authenticated group
  creation, listing, and detail
- `POST /groups/join` and `GET /groups/{id}/invite` — invite-code joining and
  shareable join links
- MongoDB persistence for OTPs, per-phone rate-limit windows, users, and groups
- TTL indexes so expired OTPs and stale counters are removed automatically;
  unique invite-code index so codes cannot be reused
- Per-phone and per-IP rate limiting
- Swagger UI in Development, CORS for the frontend dev server

## Requirements

- [.NET SDK 10.0](https://dotnet.microsoft.com/download) or newer
- MongoDB (local `mongodb://localhost:27017` is used by default in Development)

## Run

```bash
cd Backend
dotnet run
```

The `http` launch profile starts the API at <http://localhost:5080> and sets
`ASPNETCORE_ENVIRONMENT=Development`.

The port is configurable. Either pass `--urls` or set `ASPNETCORE_URLS`:

```bash
dotnet run --urls "http://localhost:5090"
# or
ASPNETCORE_URLS="http://localhost:5090" dotnet run --no-launch-profile
```

In Development the console SMS sender logs the message, including the code, so
the flow can be exercised without a real SMS provider.

To exercise the Production pipeline locally, use the `http-production` profile or
skip the launch profile:

```bash
dotnet run --launch-profile http-production
```

Production startup requires `Jwt:Secret` (at least 32 bytes) and an SMS provider;
without them the API fails fast with a clear configuration error.

## Endpoints

| Method | Path                | Environment | Purpose                                  |
| ------ | ------------------- | ----------- | ---------------------------------------- |
| GET    | `/health`           | all         | Liveness probe, always 200               |
| POST   | `/auth/request-code`| all         | Send an OTP to an E.164 phone number     |
| POST   | `/auth/verify-code` | all         | Verify an OTP, return a JWT and the user |
| POST   | `/groups`           | all         | Create a group (auth required)           |
| GET    | `/groups`           | all         | List groups the caller belongs to        |
| GET    | `/groups/{id}`      | all         | Group detail, members only               |
| POST   | `/groups/join`      | all         | Join a group by invite code              |
| GET    | `/groups/{id}/invite` | all       | Invite code and shareable join URL       |
| GET    | `/swagger`          | Development | Swagger UI                               |
| GET    | `/swagger/v1/swagger.json` | Development | OpenAPI document                  |

Swagger is only registered when `ASPNETCORE_ENVIRONMENT=Development`; in
Production the `/swagger` routes return `404`.

### Authorizing in Swagger

Group endpoints require a JWT, so Swagger UI shows an **Authorize** button
(lock icons appear only on authenticated operations; `/health` and the auth
endpoints stay open):

1. Call `POST /auth/verify-code` and copy the `token` from the response.
2. Click **Authorize** and paste the token **without** the `Bearer ` prefix.
3. Click **Authorize** / **Close**, then call the group endpoints; Swagger adds
   the `Authorization: Bearer …` header to each request.

### Request a code

```bash
curl -i -X POST http://localhost:5080/auth/request-code \
  -H "Content-Type: application/json" \
  -d '{"phone":"+989121234567"}'
# HTTP/1.1 200 OK
# {"message":"If the number can receive SMS, a verification code has been sent."}
```

The API validates and normalizes the phone number to E.164. Formatting
characters (`+98 912 123 4567`, `+98-912-123-4567`) and the international `00`
prefix (`00989121234567`) are accepted. Iranian mobile numbers in national form
(`09121234567`, `0912 123 4567`) are accepted too and stored as
`+989121234567`, so every spelling of the same number shares one account and
rate-limit bucket. Other national formats (for example `08121234567`) are
rejected with a generic `400`.

In Development the generated code appears in the API log:

```
info: Dongi.Api.Services.ConsoleSmsSender[0]
      [Console SMS] To +989121234567: Your Dongi verification code is 123456. It expires in 2 minutes.
```

### Verify the code

```bash
curl -i -X POST http://localhost:5080/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{"phone":"+989121234567","code":"123456"}'
# HTTP/1.1 200 OK
# {"token":"eyJhbGciOiJIUzI1NiIs...","user":{"id":"66f...","phone":"+989121234567"}}
```

The JWT is HS256-signed, valid for seven days, and carries the user id in `sub`
and the phone number in `phone`. Users are created on first successful
verification and looked up by phone afterwards.

Wrong, expired, already-used, or unknown-phone codes all return the same generic
`401`:

```json
{ "message": "Invalid or expired verification code." }
```

## Groups

Every group endpoint requires `Authorization: Bearer <token>`; the caller is the
token's `sub` claim. Requests without a valid token receive `401`.

A group is `{ id, name, ownerId, memberIds, createdAt }`. The creator becomes the
owner and the first member. Invite codes are eight-character base62 strings,
unique across all groups (enforced by a unique MongoDB index), and are returned
only by the invite endpoint.

| Endpoint | Success | Notes |
| --- | --- | --- |
| `POST /groups` `{ "name": "Trip" }` | `201` | Trimmed name, 1–100 characters |
| `GET /groups` | `200` array | Only groups the caller is a member of, newest first |
| `GET /groups/{id}` | `200` | `403` for non-members, `404` for unknown/malformed ids |
| `POST /groups/join` `{ "inviteCode": "ABC12345" }` | `200` group | Idempotent: joining twice is a no-op; unknown code → `404` |
| `GET /groups/{id}/invite` | `200` `{ inviteCode, joinUrl }` | Members only; `joinUrl` is `{Groups:FrontendBaseUrl}/#/join/{inviteCode}` |

```bash
TOKEN="eyJhbGciOiJIUzI1NiIs..."   # from POST /auth/verify-code

# Create a group; the Location header points at the new group.
curl -i -X POST http://localhost:5080/groups \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"Trip"}'
# HTTP/1.1 201 Created
# {"id":"66f...","name":"Trip","ownerId":"66e...","memberIds":["66e..."],"createdAt":"..."}

# List, read, and invite.
curl -H "Authorization: Bearer $TOKEN" http://localhost:5080/groups
curl -H "Authorization: Bearer $TOKEN" http://localhost:5080/groups/66f...
curl -H "Authorization: Bearer $TOKEN" http://localhost:5080/groups/66f.../invite
# {"inviteCode":"aB3dE9xQ","joinUrl":"http://localhost:5173/#/join/aB3dE9xQ"}

# Join with the code (safe to retry).
curl -i -X POST http://localhost:5080/groups/join \
  -H "Authorization: Bearer $OTHER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"inviteCode":"aB3dE9xQ"}'
```

If five generated codes in a row collide with existing groups, creation returns
`409` instead of retrying forever. The retry count is configurable through
`Groups:MaxInviteCodeAttempts`.

## Authentication rules

- Codes are six digits, expire after **2 minutes**, and are single-use.
- Only an HMAC-SHA256 hash of the code is stored; the plaintext exists only in
  the SMS message.
- Issuing a code is limited to **3 requests per normalized phone per 10 minutes**
  (`429` after that). The counter is stored in MongoDB, so the limit is shared by
  every API instance.
- Auth endpoints are additionally limited to **20 requests per client IP per
  hour** by ASP.NET Core rate-limiting middleware (`429`, with `Retry-After`).
- Responses never reveal whether a phone number belongs to an existing user.
- MongoDB TTL indexes remove expired OTP documents and stale rate-limit counters.

## Configuration

`appsettings.json` contains only safe placeholders. Never commit production
secrets — use [user-secrets](https://learn.microsoft.com/aspnet/core/security/app-secrets)
or environment variables.

```bash
cd Backend
dotnet user-secrets set "MongoDb:ConnectionString" "mongodb://localhost:27017"
dotnet user-secrets set "Sms:ApiKey" "<your-api-key>"
dotnet user-secrets set "Jwt:Secret" "<at-least-32-random-bytes>"
```

Environment-variable equivalent (double underscore separates sections):

```bash
export MongoDb__ConnectionString="mongodb://localhost:27017"
export Sms__ApiKey="<your-api-key>"
export Jwt__Secret="<at-least-32-random-bytes>"
```

| Key                              | Purpose                                                   |
| -------------------------------- | --------------------------------------------------------- |
| `Cors:AllowedOrigins`            | Browser origins allowed to call the API                   |
| `MongoDb:ConnectionString`       | MongoDB connection string (empty by default)              |
| `MongoDb:DatabaseName`           | Mongo database name (`dongi`)                             |
| `Sms:Provider`                   | `Console` selects the development sender                  |
| `Sms:ApiKey`                     | SMS provider key (empty by default)                       |
| `Sms:SenderNumber`               | SMS sender number placeholder                             |
| `Jwt:Issuer` / `Jwt:Audience`    | JWT issuer/audience (`dongi`)                             |
| `Jwt:Secret`                     | HS256 signing key, at least 32 bytes (required outside Development) |
| `Jwt:ExpiryDays`                 | Access-token lifetime in days (`7`)                       |
| `Otp:CodeLength`                 | Generated code length (`6`)                               |
| `Otp:ExpiryMinutes`              | Code lifetime (`2`)                                       |
| `Otp:RequestWindowMinutes`       | Per-phone rate-limit window (`10`)                        |
| `Otp:MaxRequestsPerWindow`       | Per-phone requests allowed per window (`3`)               |
| `RateLimiting:AuthIpPermitLimit` | Auth requests allowed per IP per window (`20`)            |
| `RateLimiting:AuthIpWindowMinutes` | IP rate-limit window (`60`)                             |
| `Groups:FrontendBaseUrl`         | Origin used to build invite join links (`http://localhost:5173`) |
| `Groups:NameMaxLength`           | Maximum group-name length (`100`)                         |
| `Groups:MaxInviteCodeAttempts`   | Code-generation retries on collision (`5`)                |

`appsettings.Development.json` contains a clearly marked development-only JWT
secret and `Sms:Provider = Console`. CORS defaults to `http://localhost:5173`
(Vite's dev server) when `Cors:AllowedOrigins` is absent.

The IP limiter partitions on `HttpContext.Connection.RemoteIpAddress`. If the API
runs behind a reverse proxy, configure ASP.NET Core forwarded headers so the real
client IP is used.

## Tests

Integration tests boot the real API with `WebApplicationFactory` and run against a
real MongoDB database (a unique throwaway database per test class). The tests use
a controllable clock and a capturing SMS sender to cover:

- code issuance, storage, hashing, and two-minute expiry
- invalid phone handling
- successful verification, user creation, and JWT contents
- single-use codes, wrong codes, expired codes, and unknown phones
- per-phone rate limiting, normalization, and window reset
- the per-IP limit
- TTL/unique indexes
- group creation, member-only reads (`403`), invite links, and joining
- idempotent joins, invalid codes (`404`), and invite-code collision retries

Run them with:

```bash
dotnet test Backend.Tests/Dongi.Api.Tests.csproj
```

The tests expect MongoDB at `mongodb://localhost:27017`. Point them elsewhere
with `DONGI_TEST_MONGO`:

```bash
DONGI_TEST_MONGO="mongodb://localhost:27018" dotnet test Backend.Tests/Dongi.Api.Tests.csproj
```

## Project layout

```
Backend/
├── Auth/           # Phone normalization, JWT settings and token service
├── Controllers/    # API controllers (Health, Auth, Groups)
├── Data/           # Mongo context, repositories, rate limiter, index initializer
├── DTOs/           # Request/response contracts
├── Models/         # Domain documents (OtpCode, OtpRequestLimit, User, Group)
├── Services/       # OTP/auth/group services, SMS senders, settings
├── Startup/        # CORS, rate-limit settings, exception handling
├── Properties/     # launchSettings.json
├── Program.cs      # Composition root and HTTP pipeline
├── appsettings.json
└── appsettings.Development.json

Backend.Tests/      # xUnit integration tests (WebApplicationFactory + MongoDB)
```

## Verify the scaffold

```bash
# 1. Health endpoint returns 200 with no auth
curl -i http://localhost:5080/health

# 2. Swagger UI is served in Development
curl -I http://localhost:5080/swagger/index.html

# 3. CORS preflight from the dev origin is allowed
curl -i -X OPTIONS http://localhost:5080/health \
  -H "Origin: http://localhost:5173" \
  -H "Access-Control-Request-Method: GET"
# -> 204 and Access-Control-Allow-Origin: http://localhost:5173

# 4. CORS preflight from an unlisted origin is rejected
curl -i -X OPTIONS http://localhost:5080/health \
  -H "Origin: http://evil.example" \
  -H "Access-Control-Request-Method: GET"
# -> 204 with no Access-Control-Allow-Origin header
```

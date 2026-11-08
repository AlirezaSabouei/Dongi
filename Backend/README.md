# Dongi API

Backend scaffold for Dongi — an ASP.NET Core Web API targeting **.NET 10**.

No business logic or authentication is included yet. This project exists to
establish the folder layout, dependency injection, configuration placeholders,
health check, Swagger (Development only), and CORS for the frontend dev server.

## Requirements

- [.NET SDK 10.0](https://dotnet.microsoft.com/download) or newer

## Run

```bash
cd Backend
dotnet run
```

The `http` launch profile starts the API at <http://localhost:5080>.

The port is configurable. Either pass `--urls` or set `ASPNETCORE_URLS`:

```bash
dotnet run --urls "http://localhost:5090"
# or
ASPNETCORE_URLS="http://localhost:5090" dotnet run --no-launch-profile
```

`dotnet run` uses `Properties/launchSettings.json`, which sets
`ASPNETCORE_ENVIRONMENT=Development`. To exercise the Production pipeline
locally, use the `http-production` profile or skip the launch profile:

```bash
dotnet run --launch-profile http-production
```

## Endpoints

| Method | Path                     | Environment | Purpose                    |
| ------ | ------------------------ | ----------- | -------------------------- |
| GET    | `/health`                | all         | Liveness probe, always 200 |
| GET    | `/swagger`               | Development | Swagger UI                 |
| GET    | `/swagger/v1/swagger.json` | Development | OpenAPI document         |

Swagger is only registered when `ASPNETCORE_ENVIRONMENT=Development`; in
Production the `/swagger` routes return `404`.

Example:

```bash
curl -i http://localhost:5080/health
# HTTP/1.1 200 OK
# {"status":"Healthy","timestampUtc":"..."}
```

## Configuration

`appsettings.json` contains only safe placeholders. Never commit secrets —
use [user-secrets](https://learn.microsoft.com/aspnet/core/security/app-secrets)
or environment variables for local values.

```bash
cd Backend
dotnet user-secrets set "MongoDb:ConnectionString" "mongodb://localhost:27017"
dotnet user-secrets set "Sms:ApiKey" "<your-api-key>"
```

Environment-variable equivalent (double underscore separates sections):

```bash
export MongoDb__ConnectionString="mongodb://localhost:27017"
export Sms__ApiKey="<your-api-key>"
```

| Key                        | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `Cors:AllowedOrigins`      | Browser origins allowed to call the API          |
| `MongoDb:ConnectionString` | MongoDB connection string (empty by default)     |
| `MongoDb:DatabaseName`     | Mongo database name (`dongi`)                    |
| `Sms:Provider`             | SMS provider identifier placeholder              |
| `Sms:ApiKey`               | SMS provider key (empty by default)              |
| `Sms:SenderNumber`         | SMS sender number placeholder                    |

CORS defaults to `http://localhost:5173` (Vite's dev server) when
`Cors:AllowedOrigins` is absent. Preflight requests from other origins receive
no `Access-Control-Allow-Origin` header and are rejected by the browser.

## Project layout

```
Backend/
├── Controllers/    # API controllers (HealthController)
├── Data/           # Persistence settings/access (MongoDbSettings)
├── DTOs/           # Request/response contracts (HealthResponse)
├── Models/         # Domain models (empty for now)
├── Services/       # Service contracts/settings (SmsSettings)
├── Properties/     # launchSettings.json
├── Program.cs      # Composition root and HTTP pipeline
├── appsettings.json
└── appsettings.Development.json
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

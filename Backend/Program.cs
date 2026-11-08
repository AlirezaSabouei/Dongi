using System.Globalization;
using System.IdentityModel.Tokens.Jwt;
using System.Text;
using System.Threading.RateLimiting;
using Dongi.Api.Auth;
using Dongi.Api.Data;
using Dongi.Api.DTOs;
using Dongi.Api.Services;
using Dongi.Api.Startup;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------------------
// Configuration validation (fail fast on missing security-critical settings)
// ---------------------------------------------------------------------------
var jwtSettings = builder.Configuration
    .GetSection(JwtSettings.SectionName)
    .Get<JwtSettings>() ?? new JwtSettings();
jwtSettings.EnsureValid();

var otpSettings = builder.Configuration
    .GetSection(OtpSettings.SectionName)
    .Get<OtpSettings>() ?? new OtpSettings();
otpSettings.EnsureValid();

var rateLimitingSettings = builder.Configuration
    .GetSection(RateLimitingSettings.SectionName)
    .Get<RateLimitingSettings>() ?? new RateLimitingSettings();
rateLimitingSettings.EnsureValid();

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Secrets stay out of appsettings.json; supply them through user-secrets,
// environment variables, or a local (git-ignored) file.
builder.Services.Configure<MongoDbSettings>(
    builder.Configuration.GetSection(MongoDbSettings.SectionName));
builder.Services.Configure<SmsSettings>(
    builder.Configuration.GetSection(SmsSettings.SectionName));
builder.Services.Configure<JwtSettings>(
    builder.Configuration.GetSection(JwtSettings.SectionName));
builder.Services.Configure<OtpSettings>(
    builder.Configuration.GetSection(OtpSettings.SectionName));
builder.Services.Configure<RateLimitingSettings>(
    builder.Configuration.GetSection(RateLimitingSettings.SectionName));

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddSingleton<MongoDbContext>();
builder.Services.AddSingleton<IOtpCodeRepository, MongoOtpCodeRepository>();
builder.Services.AddSingleton<IOtpRequestLimiter, MongoOtpRequestLimiter>();
builder.Services.AddSingleton<IUserRepository, MongoUserRepository>();
builder.Services.AddHostedService<MongoIndexInitializer>();

builder.Services.AddSingleton<IOtpCodeHasher, OtpCodeHasher>();
builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();
builder.Services.AddSingleton<IOtpService, OtpService>();
builder.Services.AddSingleton<IAuthService, AuthService>();

// SMS provider selection. ConsoleSmsSender logs the message (and thus the code)
// and is only used for local development or when explicitly configured.
var smsProvider = builder.Configuration
    .GetSection(SmsSettings.SectionName)
    .Get<SmsSettings>()?.Provider;

if (builder.Environment.IsDevelopment() ||
    string.Equals(smsProvider, "Console", StringComparison.OrdinalIgnoreCase))
{
    builder.Services.AddSingleton<ISmsSender, ConsoleSmsSender>();
}
else
{
    builder.Services.AddSingleton<ISmsSender, UnavailableSmsSender>();
}

// Access tokens are HS256 JWTs with a configurable lifetime (7 days by default).
builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtSettings.Issuer,
            ValidateAudience = true,
            ValidAudience = jwtSettings.Audience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(jwtSettings.Secret)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = JwtRegisteredClaimNames.Sub,
        };
    });
builder.Services.AddAuthorization();

// Allow the frontend dev server to call the API. The list is configurable via
// Cors:AllowedOrigins and falls back to the Vite default.
var allowedOrigins = builder.Configuration
    .GetSection($"{CorsSettings.SectionName}:{nameof(CorsSettings.AllowedOrigins)}")
    .Get<string[]>();

builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsSettings.FrontendPolicy, policy =>
    {
        policy.WithOrigins(allowedOrigins ?? [CorsSettings.DefaultFrontendOrigin])
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

// Per-IP throttling for the unauthenticated auth endpoints. The phone-based OTP
// limit lives in Mongo (see OtpService) because its key comes from the request
// body rather than the connection.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.AddPolicy(RateLimitPolicies.AuthPerIp, httpContext =>
    {
        var settings = httpContext.RequestServices
            .GetRequiredService<Microsoft.Extensions.Options.IOptions<RateLimitingSettings>>()
            .Value;

        return RateLimitPartition.GetFixedWindowLimiter(
            partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            factory: _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = settings.AuthIpPermitLimit,
                Window = TimeSpan.FromMinutes(settings.AuthIpWindowMinutes),
                QueueLimit = 0,
                AutoReplenishment = true,
            });
    });

    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;

        if (context.Lease.TryGetMetadata(MetadataName.RetryAfter, out var retryAfter))
        {
            context.HttpContext.Response.Headers.RetryAfter =
                ((int)retryAfter.TotalSeconds).ToString(CultureInfo.InvariantCulture);
        }

        await context.HttpContext.Response.WriteAsJsonAsync(
            new MessageResponse("Too many requests. Try again later."),
            cancellationToken);
    };
});

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<ServiceUnavailableExceptionHandler>();

var app = builder.Build();

// ---------------------------------------------------------------------------
// HTTP request pipeline
// ---------------------------------------------------------------------------
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(options =>
    {
        options.SwaggerEndpoint("/swagger/v1/swagger.json", "Dongi API v1");
        options.RoutePrefix = "swagger";
    });
}

app.UseExceptionHandler();
app.UseRouting();
app.UseCors(CorsSettings.FrontendPolicy);
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();

/// <summary>Entry point exposed so integration tests can use WebApplicationFactory.</summary>
public partial class Program;

using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Dongi.Api.Auth;
using Dongi.Api.Data;
using Dongi.Api.Services;
using Dongi.Api.Startup;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;
using MongoDB.Bson;
using MongoDB.Driver;

namespace Dongi.Api.Tests.Infrastructure;

/// <summary>
/// Boots the real API through <see cref="WebApplicationFactory{TEntryPoint}"/> and
/// points it at a unique MongoDB database. The clock and SMS sender are replaced
/// so tests can advance time and read the generated codes.
/// </summary>
/// <remarks>
/// Tests require a MongoDB instance (default <c>mongodb://localhost:27017</c>,
/// override with <c>DONGI_TEST_MONGO</c>).
/// </remarks>
public class DongiApiFactory : WebApplicationFactory<Program>
{
    public const string TestJwtSecret = "dongi-integration-test-jwt-signing-secret-0123456789";
    public const string TestJwtIssuer = "dongi-tests";
    public const string TestJwtAudience = "dongi-tests";
    public const string TestFrontendBaseUrl = "http://localhost:5173";

    private readonly string _databaseName = $"dongi_test_{Guid.NewGuid():N}";
    private readonly MongoClient _mongoClient;
    private readonly TestTimeProvider _clock = new();
    private readonly CapturingSmsSender _sms = new();

    public DongiApiFactory() : this(ipPermitLimit: 10_000)
    {
    }

    protected DongiApiFactory(int ipPermitLimit)
    {
        IpPermitLimit = ipPermitLimit;
        _mongoClient = new MongoClient(MongoConnectionString);
    }

    public int IpPermitLimit { get; }

    public TestTimeProvider Clock => _clock;

    public CapturingSmsSender Sms => _sms;

    public string DatabaseName => _databaseName;

    public IMongoDatabase Database => _mongoClient.GetDatabase(_databaseName);

    public static string MongoConnectionString =>
        Environment.GetEnvironmentVariable("DONGI_TEST_MONGO") ?? "mongodb://localhost:27017";

    public static string NewPhoneNumber() =>
        "+98912" + Interlocked.Increment(ref _phoneSequence).ToString("D7");

    private static int _phoneSequence = Random.Shared.Next(1_000_000, 8_000_000);

    public static async Task<JsonDocument> ReadJsonAsync(HttpResponseMessage response)
    {
        var stream = await response.Content.ReadAsStreamAsync();
        return await JsonDocument.ParseAsync(stream);
    }

    /// <summary>Creates a token for a user id without going through the OTP flow.</summary>
    public static string CreateTokenFor(ObjectId userId)
    {
        var now = DateTime.UtcNow;
        var credentials = new SigningCredentials(
            new SymmetricSecurityKey(Encoding.UTF8.GetBytes(TestJwtSecret)),
            SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: TestJwtIssuer,
            audience: TestJwtAudience,
            claims: [new Claim(JwtRegisteredClaimNames.Sub, userId.ToString())],
            notBefore: now,
            expires: now.AddDays(1),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>Creates an HTTP client authenticated as a freshly generated user.</summary>
    public HttpClient CreateAuthenticatedClient(ObjectId userId)
    {
        var client = CreateClient();
        client.DefaultRequestHeaders.Authorization =
            new AuthenticationHeaderValue("Bearer", CreateTokenFor(userId));
        return client;
    }

    /// <summary>
    /// Waits for the background index initializer to create a named index. Useful
    /// for tests that depend on a unique-index guarantee rather than app logic.
    /// </summary>
    public async Task WaitForIndexAsync(string collectionName, string indexName)
    {
        var collection = Database.GetCollection<BsonDocument>(collectionName);
        var deadline = DateTime.UtcNow.AddSeconds(15);

        while (DateTime.UtcNow < deadline)
        {
            using var cursor = await collection.Indexes.ListAsync();
            var indexes = await cursor.ToListAsync();

            if (indexes.Any(index =>
                    index.TryGetValue("name", out var name) && name.AsString == indexName))
            {
                return;
            }

            await Task.Delay(50);
        }

        throw new TimeoutException(
            $"Index '{indexName}' was not created on '{collectionName}' within 15 seconds.");
    }

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Development");

        builder.ConfigureTestServices(services =>
        {
            services.RemoveAll<ISmsSender>();
            services.AddSingleton<ISmsSender>(_sms);

            services.RemoveAll<TimeProvider>();
            services.AddSingleton<TimeProvider>(_clock);

            services.Configure<MongoDbSettings>(settings =>
            {
                settings.ConnectionString = MongoConnectionString;
                settings.DatabaseName = _databaseName;
            });

            services.Configure<JwtSettings>(settings =>
            {
                settings.Secret = TestJwtSecret;
                settings.Issuer = TestJwtIssuer;
                settings.Audience = TestJwtAudience;
                settings.ExpiryDays = 7;
            });

            services.Configure<OtpSettings>(settings =>
            {
                settings.CodeLength = 6;
                settings.ExpiryMinutes = 2;
                settings.RequestWindowMinutes = 10;
                settings.MaxRequestsPerWindow = 3;
            });

            services.Configure<RateLimitingSettings>(settings =>
            {
                settings.AuthIpPermitLimit = IpPermitLimit;
                settings.AuthIpWindowMinutes = 60;
            });

            services.Configure<GroupSettings>(settings =>
            {
                settings.FrontendBaseUrl = TestFrontendBaseUrl;
                settings.NameMaxLength = 100;
                settings.MaxInviteCodeAttempts = 5;
            });

            ConfigureAdditionalTestServices(services);
        });
    }

    /// <summary>
    /// Hook for test-specific service replacements (for example a scripted invite
    /// code generator). Called after the shared test configuration.
    /// </summary>
    protected virtual void ConfigureAdditionalTestServices(IServiceCollection services)
    {
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            try
            {
                _mongoClient.DropDatabase(_databaseName);
            }
            catch (MongoException)
            {
                // Test cleanup is best-effort; do not mask a test failure.
            }
        }

        base.Dispose(disposing);
    }
}

/// <summary>Factory with the production per-IP auth limit (20 requests/hour).</summary>
public sealed class StrictIpApiFactory() : DongiApiFactory(ipPermitLimit: 20);

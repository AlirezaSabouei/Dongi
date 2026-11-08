using System.Net.Http.Json;
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
        });
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

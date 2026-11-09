using Microsoft.Extensions.Options;
using MongoDB.Driver;

namespace Dongi.Api.Data;

/// <summary>
/// Lazily creates the MongoDB client and database. Construction never touches
/// the network, so the API can start (and serve <c>/health</c>) while MongoDB is
/// down or unconfigured. Connection failures surface on first use and are
/// translated into 503 responses.
/// </summary>
public sealed class MongoDbContext : IDisposable
{
    private readonly MongoDbSettings _settings;
    private readonly Lazy<IMongoClient> _client;

    public MongoDbContext(IOptions<MongoDbSettings> settings)
    {
        _settings = settings.Value;
        _client = new Lazy<IMongoClient>(CreateClient, LazyThreadSafetyMode.ExecutionAndPublication);
    }

    public IMongoClient Client => _client.Value;

    public IMongoDatabase Database => Client.GetDatabase(DatabaseName);

    public string DatabaseName =>
        string.IsNullOrWhiteSpace(_settings.DatabaseName) ? "dongi" : _settings.DatabaseName;

    private IMongoClient CreateClient()
    {
        if (string.IsNullOrWhiteSpace(_settings.ConnectionString))
        {
            throw new MongoNotConfiguredException(
                "MongoDB is not configured. Set MongoDb:ConnectionString through configuration, " +
                "user-secrets, or environment variables.");
        }

        var clientSettings = MongoClientSettings.FromConnectionString(_settings.ConnectionString);
        clientSettings.ServerSelectionTimeout = TimeSpan.FromSeconds(5);
        return new MongoClient(clientSettings);
    }

    public void Dispose()
    {
        if (_client.IsValueCreated && _client.Value is IDisposable disposable)
        {
            disposable.Dispose();
        }
    }
}

namespace Dongi.Api.Data;

/// <summary>
/// MongoDB connection settings. The connection string is intentionally empty
/// in appsettings.json and must be supplied locally through user-secrets or
/// environment variables.
/// </summary>
public sealed class MongoDbSettings
{
    public const string SectionName = "MongoDb";

    public string ConnectionString { get; set; } = string.Empty;

    public string DatabaseName { get; set; } = "dongi";
}

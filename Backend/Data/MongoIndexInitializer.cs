using Dongi.Api.Models;
using MongoDB.Driver;

namespace Dongi.Api.Data;

/// <summary>
/// Creates the indexes the OTP flow depends on: TTL indexes that let MongoDB
/// remove expired OTPs and stale rate-limit counters, and the unique phone index
/// for users. Index creation runs in the background and never blocks startup, so
/// a temporarily unreachable database does not take the API down.
/// </summary>
internal sealed class MongoIndexInitializer(
    MongoDbContext context,
    ILogger<MongoIndexInitializer> logger) : BackgroundService
{
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(2);
    private const int MaxAttempts = 5;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        for (var attempt = 1; attempt <= MaxAttempts; attempt++)
        {
            try
            {
                await CreateIndexesAsync(stoppingToken);
                logger.LogInformation("MongoDB indexes are ready.");
                return;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception) when (attempt < MaxAttempts)
            {
                logger.LogWarning(
                    exception,
                    "Could not create MongoDB indexes (attempt {Attempt}/{MaxAttempts}); retrying in {Delay}s.",
                    attempt,
                    MaxAttempts,
                    RetryDelay.TotalSeconds);
                try
                {
                    await Task.Delay(RetryDelay, stoppingToken);
                }
                catch (OperationCanceledException)
                {
                    return;
                }
            }
            catch (Exception exception)
            {
                logger.LogError(exception, "MongoDB indexes could not be created. OTP TTL cleanup may be unavailable.");
            }
        }
    }

    private async Task CreateIndexesAsync(CancellationToken cancellationToken)
    {
        var database = context.Database;

        var otpCodes = database.GetCollection<OtpCode>(MongoCollections.OtpCodes);
        await otpCodes.Indexes.CreateOneAsync(
            new CreateIndexModel<OtpCode>(
                Builders<OtpCode>.IndexKeys.Ascending(code => code.ExpiresAt),
                new CreateIndexOptions { ExpireAfter = TimeSpan.Zero, Name = "ttl_expiresAt" }),
            cancellationToken: cancellationToken);

        var otpRequestLimits = database.GetCollection<OtpRequestLimit>(MongoCollections.OtpRequestLimits);
        await otpRequestLimits.Indexes.CreateOneAsync(
            new CreateIndexModel<OtpRequestLimit>(
                Builders<OtpRequestLimit>.IndexKeys.Ascending(limit => limit.ExpiresAt),
                new CreateIndexOptions { ExpireAfter = TimeSpan.Zero, Name = "ttl_expiresAt" }),
            cancellationToken: cancellationToken);

        var users = database.GetCollection<User>(MongoCollections.Users);
        await users.Indexes.CreateOneAsync(
            new CreateIndexModel<User>(
                Builders<User>.IndexKeys.Ascending(user => user.Phone),
                new CreateIndexOptions { Unique = true, Name = "unique_phone" }),
            cancellationToken: cancellationToken);
    }
}

using Dongi.Api.Models;
using MongoDB.Driver;

namespace Dongi.Api.Data;

internal sealed class MongoOtpRequestLimiter(MongoDbContext context) : IOtpRequestLimiter
{
    private const int MaxAttempts = 5;

    private IMongoCollection<OtpRequestLimit> Collection =>
        context.Database.GetCollection<OtpRequestLimit>(MongoCollections.OtpRequestLimits);

    public async Task<bool> TryAcquireAsync(
        string phone,
        DateTime utcNow,
        TimeSpan window,
        int maxRequests,
        CancellationToken cancellationToken)
    {
        var cutoff = utcNow - window;

        // Optimistic concurrency: every read-modify-write is conditional on the
        // window start observed during the read, so two racing requests can never
        // both reset or increment the counter incorrectly.
        for (var attempt = 0; attempt < MaxAttempts; attempt++)
        {
            var existing = await Collection
                .Find(limit => limit.Phone == phone)
                .FirstOrDefaultAsync(cancellationToken);

            if (existing is null)
            {
                var created = new OtpRequestLimit
                {
                    Phone = phone,
                    WindowStart = utcNow,
                    Count = 1,
                    ExpiresAt = utcNow + window,
                };

                try
                {
                    await Collection.InsertOneAsync(created, cancellationToken: cancellationToken);
                    return maxRequests >= 1;
                }
                catch (MongoWriteException exception)
                    when (exception.WriteError?.Category == ServerErrorCategory.DuplicateKey)
                {
                    // Another request created the counter first; re-read and retry.
                    continue;
                }
            }

            if (existing.WindowStart <= cutoff)
            {
                var resetFilter = Builders<OtpRequestLimit>.Filter.And(
                    Builders<OtpRequestLimit>.Filter.Eq(limit => limit.Phone, phone),
                    Builders<OtpRequestLimit>.Filter.Eq(limit => limit.WindowStart, existing.WindowStart));

                var resetUpdate = Builders<OtpRequestLimit>.Update
                    .Set(limit => limit.WindowStart, utcNow)
                    .Set(limit => limit.Count, 1)
                    .Set(limit => limit.ExpiresAt, utcNow + window);

                var reset = await Collection.UpdateOneAsync(
                    resetFilter,
                    resetUpdate,
                    cancellationToken: cancellationToken);

                if (reset.ModifiedCount == 1)
                {
                    return maxRequests >= 1;
                }

                continue;
            }

            var incrementFilter = Builders<OtpRequestLimit>.Filter.And(
                Builders<OtpRequestLimit>.Filter.Eq(limit => limit.Phone, phone),
                Builders<OtpRequestLimit>.Filter.Eq(limit => limit.WindowStart, existing.WindowStart));

            var incrementUpdate = Builders<OtpRequestLimit>.Update.Inc(limit => limit.Count, 1);

            var updated = await Collection.FindOneAndUpdateAsync(
                incrementFilter,
                incrementUpdate,
                new FindOneAndUpdateOptions<OtpRequestLimit> { ReturnDocument = ReturnDocument.After },
                cancellationToken);

            if (updated is not null)
            {
                return updated.Count <= maxRequests;
            }
        }

        throw new InvalidOperationException(
            "Could not update the OTP request counter after repeated contention.");
    }
}

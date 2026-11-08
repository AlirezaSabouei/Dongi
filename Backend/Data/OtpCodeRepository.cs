using Dongi.Api.Models;
using MongoDB.Driver;

namespace Dongi.Api.Data;

/// <summary>Persistence operations for <see cref="OtpCode"/> documents.</summary>
public interface IOtpCodeRepository
{
    Task InsertAsync(OtpCode code, CancellationToken cancellationToken);

    /// <summary>
    /// Returns the most recently issued, unexpired code for a phone, whether or
    /// not it has already been redeemed. Looking at the latest code only ensures
    /// an older code never becomes usable again after a newer one is issued.
    /// </summary>
    Task<OtpCode?> FindLatestAsync(string phone, DateTime utcNow, CancellationToken cancellationToken);

    /// <summary>
    /// Atomically marks a code as used. Returns <c>false</c> when another request
    /// already redeemed it (single-use guarantee).
    /// </summary>
    Task<bool> TryMarkUsedAsync(OtpCode code, DateTime utcNow, CancellationToken cancellationToken);
}

internal sealed class MongoOtpCodeRepository(MongoDbContext context) : IOtpCodeRepository
{
    private IMongoCollection<OtpCode> Collection =>
        context.Database.GetCollection<OtpCode>(MongoCollections.OtpCodes);

    public Task InsertAsync(OtpCode code, CancellationToken cancellationToken) =>
        Collection.InsertOneAsync(code, cancellationToken: cancellationToken);

    public async Task<OtpCode?> FindLatestAsync(
        string phone,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var filter = Builders<OtpCode>.Filter.And(
            Builders<OtpCode>.Filter.Eq(code => code.Phone, phone),
            Builders<OtpCode>.Filter.Gt(code => code.ExpiresAt, utcNow));

        return await Collection
            .Find(filter)
            .SortByDescending(code => code.CreatedAt)
            .ThenByDescending(code => code.Id)
            .Limit(1)
            .FirstOrDefaultAsync(cancellationToken);
    }

    public async Task<bool> TryMarkUsedAsync(
        OtpCode code,
        DateTime utcNow,
        CancellationToken cancellationToken)
    {
        var filter = Builders<OtpCode>.Filter.And(
            Builders<OtpCode>.Filter.Eq(candidate => candidate.Id, code.Id),
            Builders<OtpCode>.Filter.Eq(candidate => candidate.UsedAt, null),
            Builders<OtpCode>.Filter.Gt(candidate => candidate.ExpiresAt, utcNow));

        var update = Builders<OtpCode>.Update.Set(candidate => candidate.UsedAt, utcNow);

        var result = await Collection.UpdateOneAsync(filter, update, cancellationToken: cancellationToken);
        return result.ModifiedCount == 1;
    }
}
